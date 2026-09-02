import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { beaconStylesheet } from "@manualforge/render-web";
import { themes } from "@manualforge/tokens";
import { PENDING_PLACEHOLDER, buildImageIndex } from "./images.ts";

let figures: string;

/** Create an image file at `rel` under the figures root. */
const put = (rel: string): void => {
  const path = join(figures, rel);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, "x");
};

beforeEach(() => {
  figures = mkdtempSync(join(tmpdir(), "atlas-images-"));
  put(PENDING_PLACEHOLDER);
});

afterEach(() => {
  rmSync(figures, { recursive: true, force: true });
});

describe("buildImageIndex", () => {
  it("prefers the deployment's own image over the shared one", () => {
    put("_common/barra/busqueda.png");
    put("north/barra/busqueda.png");
    const index = buildImageIndex(figures, "north");
    const resolved = index.resolve("barra.busqueda");
    expect(resolved.state).toBe("tenant");
    expect(resolved.url).toContain("/north/barra/busqueda.png");
  });

  it("falls back to the shared image, so an identical screen is stored once", () => {
    put("_common/barra/busqueda.png");
    const index = buildImageIndex(figures, "north");
    const resolved = index.resolve("barra.busqueda");
    expect(resolved.state).toBe("common");
    expect(resolved.url).toContain("/_common/barra/busqueda.png");
  });

  it("falls back to the one placeholder when nothing was delivered", () => {
    const index = buildImageIndex(figures, "north");
    const resolved = index.resolve("barra.busqueda");
    expect(resolved.state).toBe("pending");
    expect(resolved.url).toContain(PENDING_PLACEHOLDER);
  });

  it("resolves a single-segment slot at the root of a set", () => {
    put("_common/dashboard.png");
    expect(buildImageIndex(figures, "north").resolve("dashboard").state).toBe("common");
  });

  it("accepts any of the delivery formats, whatever the area sends", () => {
    put("_common/uno.png");
    put("_common/dos.jpg");
    put("_common/tres.svg");
    put("_common/cuatro.webp");
    const index = buildImageIndex(figures, "north");
    for (const slot of ["uno", "dos", "tres", "cuatro"]) {
      expect(index.resolve(slot).state, slot).toBe("common");
    }
  });

  it("ignores a file that is not an image", () => {
    put("_common/notas.txt");
    expect(buildImageIndex(figures, "north").resolve("notas").state).toBe("pending");
  });

  // Two files for one slot means the same image was delivered twice under
  // different formats. Picking one silently is how a stale capture survives a
  // redelivery, so it stops the build instead.
  it("refuses two files claiming the same slot", () => {
    put("_common/barra/busqueda.png");
    put("_common/barra/busqueda.jpg");
    expect(() => buildImageIndex(figures, "north")).toThrow(/barra\.busqueda/);
    expect(() => buildImageIndex(figures, "north")).toThrow(/busqueda\.jpg|busqueda\.png/);
  });

  it("allows the same slot in a deployment set and in the shared set", () => {
    put("_common/barra/busqueda.png");
    put("north/barra/busqueda.jpg");
    expect(() => buildImageIndex(figures, "north")).not.toThrow();
  });

  it("ignores another deployment's images entirely", () => {
    put("metro/barra/busqueda.png");
    expect(buildImageIndex(figures, "north").resolve("barra.busqueda").state).toBe("pending");
  });

  // Reports what it SAW, never what it judged unused: deciding that needs every
  // deployment, because an image one of them uses is legitimately unused by the
  // others. That judgement belongs to `imageRequests`.
  it("lists every slot on disk, from both its own set and the shared one", () => {
    put("_common/barra/buscar.png");
    put("north/barra/otro.png");
    const index = buildImageIndex(figures, "north");
    expect(index.indexed()).toEqual(["barra.buscar", "barra.otro"]);
  });

  it("lists a slot whether or not anything resolved it", () => {
    put("_common/barra/busqueda.png");
    const index = buildImageIndex(figures, "north");
    index.resolve("barra.busqueda");
    expect(index.indexed()).toEqual(["barra.busqueda"]);
  });

  it("never lists the placeholder as a delivered slot", () => {
    const index = buildImageIndex(figures, "north");
    expect(index.indexed()).toEqual([]);
  });

  it("ignores another deployment's folder when listing", () => {
    put("metro/barra/busqueda.png");
    expect(buildImageIndex(figures, "north").indexed()).toEqual([]);
  });

  // A manual folder created from scratch has no placeholder of its own, and the
  // first build of a new manual is exactly when every slot is pending. The
  // pipeline ships one so that build renders instead of dying.
  it("falls back to the placeholder the pipeline ships when the manual has none", () => {
    rmSync(join(figures, PENDING_PLACEHOLDER));
    const index = buildImageIndex(figures, "north");
    const resolved = index.resolve("barra.busqueda");
    expect(resolved.state).toBe("pending");
    expect(existsSync(fileURLToPath(resolved.url))).toBe(true);
  });

  // The two shipping manuals keep their own copy, and it has to keep winning:
  // the shipped one is brand-neutral, theirs is not.
  it("prefers the manual's own placeholder over the one the pipeline ships", () => {
    const resolved = buildImageIndex(figures, "north").resolve("barra.busqueda");
    expect(resolved.state).toBe("pending");
    expect(fileURLToPath(resolved.url)).toBe(join(figures, PENDING_PLACEHOLDER));
  });

  it("works when a deployment has no folder of its own yet", () => {
    put("_common/barra/busqueda.png");
    expect(buildImageIndex(figures, "nuevo").resolve("barra.busqueda").state).toBe("common");
  });

  it("works when nothing has been delivered at all", () => {
    expect(buildImageIndex(figures, "north").resolve("cualquiera").state).toBe("pending");
  });
});

// --- the placeholder's proportions are load-bearing -------------------------
//
// Beacon's stylesheet pins every figure's box to the placeholder's ratio, so a
// delivered image letterboxes inside the box the reader has been looking at
// instead of changing the height of the page. That couples two files in
// different packages, and nothing else would notice them disagreeing: the build
// succeeds, the image renders, and the layout quietly moves.
//
// This test lives here because `cli` owns the shipped placeholder and depends on
// `render-web`. The reverse dependency does not exist and must not be invented
// for a test.
describe("the shipped placeholder and the ratio Beacon's CSS pins", () => {
  const shipped = (): string =>
    readFileSync(
      fileURLToPath(new URL("../assets/_pending.svg", import.meta.url)),
      "utf8",
    );

  it("agree, so a delivery letterboxes instead of moving the page", () => {
    const box = /viewBox="0 0 (\d+) (\d+)"/.exec(shipped());
    expect(box).not.toBeNull();
    const [, w, h] = box ?? [];
    expect(beaconStylesheet(themes.beacon, "VENDOR")).toContain(
      `aspect-ratio: ${w} / ${h}`,
    );
  });
});
