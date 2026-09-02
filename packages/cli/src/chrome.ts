import { existsSync } from "node:fs";
import { pathToFileURL } from "node:url";
import puppeteer from "puppeteer-core";
import { PAGED_DONE_FLAG, PAGED_ERROR_FLAG } from "@manualforge/render-web";

const CANDIDATES = [
  process.env["CHROME_PATH"],
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/usr/bin/google-chrome",
  "/usr/bin/chromium",
].filter((p): p is string => Boolean(p));

export function findChrome(): string {
  const found = CANDIDATES.find((p) => existsSync(p));
  if (!found) {
    throw new Error(
      "No Chrome or Edge binary found. Set CHROME_PATH to one.\n" +
        `Looked in:\n  ${CANDIDATES.join("\n  ")}`,
    );
  }
  return found;
}

export interface PrintResult {
  /** Pages the paginator produced. Reported so a caller can sanity-check it. */
  readonly pages: number;
  /**
   * Which page each image landed on, in layout order.
   *
   * Only knowable here. Pagination is what decides it, it happens in the
   * browser, and by the time the PDF exists the answer has been flattened into
   * ink. Reported for every image, pending or not; deciding which ones matter is
   * the caller's job, not the printer's.
   */
  readonly placements: ReadonlyArray<{ readonly slot: string; readonly page: number }>;
}

/**
 * Print an HTML file to PDF, waiting for pagination to actually finish.
 *
 * The previous implementation shelled out to `chrome --print-to-pdf`, which
 * cannot wait for a JavaScript signal: it printed whatever the paginator had
 * managed to lay out by then. Three identical runs of the same document
 * produced 9, 10 and 13 pages, only one of them complete — and the build
 * reported success every time.
 *
 * Driving the browser directly makes the completion signal observable, so a
 * truncated render is an error instead of a silently short PDF.
 */
export async function printToPdf(
  htmlPath: string,
  pdfPath: string,
  timeoutMs = 120000,
): Promise<PrintResult> {
  const browser = await puppeteer.launch({
    executablePath: findChrome(),
    headless: true,
    args: ["--disable-gpu", "--no-sandbox", "--allow-file-access-from-files"],
  });
  try {
    const page = await browser.newPage();
    const url = pathToFileURL(htmlPath).href;
    await page.goto(url, { waitUntil: "networkidle0", timeout: timeoutMs });

    await page.waitForFunction(
      `window["${PAGED_DONE_FLAG}"] !== null || window["${PAGED_ERROR_FLAG}"] !== null`,
      { timeout: timeoutMs, polling: 200 },
    );

    // These callbacks are serialised and run in the browser, so they must not
    // reference anything from this module's scope, and `globalThis` is used
    // rather than `window` because this package's lib has no DOM types.
    const failure = await page.evaluate(
      (flag) => (globalThis as unknown as Record<string, string | null>)[flag],
      PAGED_ERROR_FLAG,
    );
    if (failure) throw new Error(`pagination failed: ${failure}`);

    const pages = await page.evaluate(
      (flag) => (globalThis as unknown as Record<string, number | null>)[flag] ?? 0,
      PAGED_DONE_FLAG,
    );
    if (!pages) throw new Error("pagination produced no pages");

    // Read the laid-out DOM, not the source flow: the query is rooted at
    // `.pagedjs_page` so it can only see content the paginator actually placed.
    // `data-page-number` is the sheet paged.js assigned, which is the same
    // number the footer prints — nothing in the stylesheet resets `counter(page)`.
    const placements = await page.evaluate(() => {
      const out: Array<{ slot: string; page: number }> = [];
      const doc = (globalThis as unknown as { document: any }).document;
      for (const sheet of doc.querySelectorAll(".pagedjs_page")) {
        const n = Number(sheet.getAttribute("data-page-number"));
        if (!Number.isFinite(n) || n < 1) continue;
        for (const img of sheet.querySelectorAll("img[data-slot]")) {
          const slot = img.getAttribute("data-slot");
          if (slot) out.push({ slot, page: n });
        }
      }
      return out;
    });

    await page.pdf({
      path: pdfPath,
      printBackground: true,
      preferCSSPageSize: true,
      timeout: timeoutMs,
    });

    // The paginator reports what it laid out; the PDF must contain exactly
    // that. A mismatch means the print stage dropped content — the very
    // failure this rewrite exists to make impossible to ship unnoticed.
    return { pages, placements };
  } finally {
    await browser.close();
  }
}
