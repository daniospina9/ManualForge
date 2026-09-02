import { readFileSync, rmSync, writeFileSync } from "node:fs";
import { extname, join } from "node:path";
import { pathToFileURL } from "node:url";
import puppeteer from "puppeteer-core";
import { findChrome } from "./chrome.ts";

/**
 * Image bytes and intrinsic size, for a target that cannot reference a file.
 *
 * The HTML renderer hands the browser a URL and lets it decode whatever it
 * finds. A .docx has no such option: the picture is stored inside the archive, in
 * a format Word can read. That rules out two of the four formats this manual's
 * assets use, so something has to convert them, and Chrome — already required to
 * print the PDF — decodes all four.
 */
export interface Raster {
  /**
   * The size the image would occupy if nothing constrained it, in CSS pixels.
   *
   * This is what the layout maths needs, and it is NOT the same as the byte
   * count of `data`. A 24px icon is rasterised well above its intrinsic size so
   * it stays sharp in print; reporting the larger number instead would place it
   * four times too wide.
   */
  readonly widthPx: number;
  readonly heightPx: number;
  readonly type: "png" | "jpg";
  readonly data: Uint8Array;
}

/** What OOXML embeds directly. Anything else has to be redrawn as a PNG. */
const NATIVE: Readonly<Record<string, "png" | "jpg">> = {
  ".png": "png",
  ".jpg": "jpg",
  ".jpeg": "jpg",
  ".gif": "png",
  ".bmp": "png",
};

const needsRedraw = (path: string): boolean => NATIVE[extname(path).toLowerCase()] === undefined;

interface Probe {
  readonly widthPx: number;
  readonly heightPx: number;
  /** A data URI, present only for a source that had to be redrawn. */
  readonly png: string | null;
  readonly error: string | null;
}

/**
 * Measure every image, and redraw the ones Word cannot open.
 *
 * `scale` oversamples a redraw so a vector icon does not arrive at print as the
 * 24 pixels its source declares. It changes the byte count, never the reported
 * intrinsic size, so layout is unaffected.
 *
 * One browser for the whole set: launching per image turned a 220-image manual
 * into minutes of process startup.
 */
export async function rasterise(
  paths: readonly string[],
  scratchDir: string,
  scale = 4,
  timeoutMs = 120000,
): Promise<Map<string, Raster>> {
  const unique = [...new Set(paths)];
  if (unique.length === 0) return new Map();

  const browser = await puppeteer.launch({
    executablePath: findChrome(),
    headless: true,
    args: ["--disable-gpu", "--no-sandbox", "--allow-file-access-from-files"],
  });

  // The page must itself be a FILE, not `about:blank`.
  //
  // `--allow-file-access-from-files` relaxes what a file-origin document may
  // read; it grants nothing to an opaque origin, which is what `about:blank`
  // has. Probing from there failed to decode every single image in the manual —
  // 186 perfectly valid PNGs — and reported it as if the files were corrupt.
  // `printToPdf` never hit this because it navigates to the document it prints.
  const scratch = join(scratchDir, ".raster-probe.html");
  writeFileSync(scratch, "<!doctype html><meta charset=utf-8><title>probe</title>", "utf8");

  try {
    const page = await browser.newPage();
    await page.goto(pathToFileURL(scratch).href, { waitUntil: "load", timeout: timeoutMs });

    const jobs = unique.map((p) => ({ url: pathToFileURL(p).href, redraw: needsRedraw(p) }));

    const probes = (await page.evaluate(
      async (list: ReadonlyArray<{ url: string; redraw: boolean }>, factor: number) => {
        const g = globalThis as unknown as {
          Image: new () => any;
          document: any;
          fetch: (u: string) => Promise<any>;
        };
        const out: Array<{
          widthPx: number;
          heightPx: number;
          png: string | null;
          error: string | null;
        }> = [];

        for (const job of list) {
          try {
            const img = new g.Image();
            img.src = job.url;
            await img.decode();

            let w = img.naturalWidth;
            let h = img.naturalHeight;

            // An SVG that declares only a viewBox has no intrinsic size. Its
            // viewBox is the size the browser lays it out at, so read that
            // rather than letting a zero reach the layout maths.
            if ((w === 0 || h === 0) && job.url.endsWith(".svg")) {
              const text = await (await g.fetch(job.url)).text();
              const box = /viewBox\s*=\s*["']\s*[-\d.]+\s+[-\d.]+\s+([\d.]+)\s+([\d.]+)/.exec(text);
              if (box !== null) {
                w = Number(box[1]);
                h = Number(box[2]);
              }
            }
            if (w === 0 || h === 0) {
              out.push({ widthPx: 0, heightPx: 0, png: null, error: "no intrinsic size" });
              continue;
            }

            let png: string | null = null;
            if (job.redraw) {
              const canvas = g.document.createElement("canvas");
              canvas.width = Math.max(1, Math.round(w * factor));
              canvas.height = Math.max(1, Math.round(h * factor));
              const c2d = canvas.getContext("2d");
              if (c2d === null) throw new Error("no 2d context");
              c2d.drawImage(img, 0, 0, canvas.width, canvas.height);
              png = canvas.toDataURL("image/png");
            }
            out.push({ widthPx: w, heightPx: h, png, error: null });
          } catch (e) {
            out.push({
              widthPx: 0,
              heightPx: 0,
              png: null,
              error: e instanceof Error ? e.message : String(e),
            });
          }
        }
        return out;
      },
      jobs,
      scale,
    )) as readonly Probe[];

    const result = new Map<string, Raster>();
    const failed: string[] = [];

    unique.forEach((path, i) => {
      const probe = probes[i];
      if (probe === undefined || probe.error !== null) {
        failed.push(`${path}${probe?.error === undefined ? "" : ` (${probe.error})`}`);
        return;
      }
      if (probe.png === null) {
        const type = NATIVE[extname(path).toLowerCase()];
        if (type === undefined) {
          failed.push(`${path} (no converter and not a format Word embeds)`);
          return;
        }
        result.set(path, {
          widthPx: probe.widthPx,
          heightPx: probe.heightPx,
          type,
          // The original bytes, not a re-encode: a lossless format stays
          // lossless and a JPEG is not generation-lossed for nothing.
          data: new Uint8Array(readFileSync(path)),
        });
        return;
      }
      const base64 = probe.png.slice(probe.png.indexOf(",") + 1);
      result.set(path, {
        widthPx: probe.widthPx,
        heightPx: probe.heightPx,
        type: "png",
        data: Uint8Array.from(Buffer.from(base64, "base64")),
      });
    });

    if (failed.length > 0) {
      throw new Error(
        `could not read ${failed.length} image(s) for the Word build:\n  ${failed.join("\n  ")}`,
      );
    }
    return result;
  } finally {
    await browser.close();
    rmSync(scratch, { force: true });
  }
}

/**
 * The first paginated sheet, as a PNG.
 *
 * The cover is the one page whose composition has no counterpart in Word: a soft
 * radial glow, twenty-two hairline rules and an inline vector mark. Printing that
 * page and placing the result is exact where a rebuild would be approximate, and
 * the cover is the one page carrying no heading anything navigates to.
 *
 * Shot from the ALREADY PAGINATED document, so it is the same sheet the PDF's
 * first page is, not a second guess at composing it.
 */
export async function shootFirstPage(
  htmlPath: string,
  scale = 3,
  timeoutMs = 120000,
): Promise<Raster> {
  const { PAGED_DONE_FLAG, PAGED_ERROR_FLAG } = await import("@manualforge/render-web");
  const browser = await puppeteer.launch({
    executablePath: findChrome(),
    headless: true,
    args: ["--disable-gpu", "--no-sandbox", "--allow-file-access-from-files"],
  });
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1240, height: 1754, deviceScaleFactor: scale });
    await page.goto(pathToFileURL(htmlPath).href, { waitUntil: "networkidle0", timeout: timeoutMs });
    await page.waitForFunction(
      `window["${PAGED_DONE_FLAG}"] !== null || window["${PAGED_ERROR_FLAG}"] !== null`,
      { timeout: timeoutMs, polling: 200 },
    );
    const failure = await page.evaluate(
      (flag) => (globalThis as unknown as Record<string, string | null>)[flag],
      PAGED_ERROR_FLAG,
    );
    if (failure) throw new Error(`pagination failed while shooting the cover: ${failure}`);

    const sheet = await page.$(".pagedjs_page");
    if (sheet === null) throw new Error("no paginated sheet to shoot the cover from");
    const shot = await sheet.screenshot({ type: "png" });

    const size = await page.evaluate(() => {
      const doc = (globalThis as unknown as { document: any }).document;
      const el = doc.querySelector(".pagedjs_page");
      return { widthPx: el.clientWidth, heightPx: el.clientHeight };
    });

    return {
      widthPx: size.widthPx,
      heightPx: size.heightPx,
      type: "png",
      data: new Uint8Array(shot),
    };
  } finally {
    await browser.close();
  }
}
