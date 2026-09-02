import { describe, expect, it } from "vitest";
import { fitFigure, fitIcon, type DocxAsset } from "./image.ts";
import { px96 } from "./measure.ts";

/** The Beacon content column: A4 less two 62pt margins. */
const COLUMN = 471.276;
const CAP = 0.7;
/**
 * The Beacon text block: A4 less a 96pt top and a 78pt bottom margin, roughly.
 * Generous on purpose in the tests above — they are about the WIDTH rules, and
 * a cap that bound would silently change what they measure.
 */
const ROOM = 668;

const asset = (widthPx: number, heightPx: number): DocxAsset => ({
  data: new Uint8Array(),
  type: "png",
  widthPx,
  heightPx,
  pending: false,
});

describe("fitFigure with a declared width", () => {
  it("sets the width, scaling a small image UP", () => {
    // `style="width:50%"` is a width, not a cap. 235.638pt is half the column,
    // and 235.638pt in 96-DPI pixels is 314.184.
    const box = fitFigure(asset(100, 50), COLUMN, 50, CAP, ROOM);
    expect(box.width).toBeCloseTo(314.184, 3);
  });

  it("keeps the aspect ratio", () => {
    const box = fitFigure(asset(1600, 900), COLUMN, 100, CAP, ROOM);
    expect(box.height / box.width).toBeCloseTo(900 / 1600, 6);
  });
});

describe("fitFigure without a declared width", () => {
  it("caps a wide image at the stylesheet's 70%", () => {
    // 70% of 471.276pt is 329.893pt -> 439.858 px.
    const box = fitFigure(asset(4000, 2000), COLUMN, undefined, CAP, ROOM);
    expect(box.width).toBeCloseTo(439.858, 2);
  });

  it("leaves an image narrower than the cap at its own size", () => {
    // THE distinction that matters: `max-width` caps, it does not stretch. A 48px
    // control screenshot must not become 70% of the column — that is how a button
    // ends up wider than the paragraph describing it.
    const box = fitFigure(asset(48, 24), COLUMN, undefined, CAP, ROOM);
    expect(box.width).toBe(48);
    expect(box.height).toBe(24);
  });

  it("refuses an image with no intrinsic size instead of dividing by zero", () => {
    expect(() => fitFigure(asset(0, 0), COLUMN, undefined, CAP, ROOM)).toThrow(/intrinsic size/);
  });
});

describe("fitIcon", () => {
  it("caps on the binding edge and keeps the ratio", () => {
    // A tall icon binds on height: 26pt tall, width follows at half that.
    const box = fitIcon(asset(100, 200), 26);
    expect(box.height).toBeCloseTo((26 * 4) / 3, 4);
    expect(box.width / box.height).toBeCloseTo(0.5, 6);
  });

  it("does not enlarge an icon already inside the box", () => {
    const box = fitIcon(asset(12, 12), 26);
    expect(box.width).toBe(12);
    expect(box.height).toBe(12);
  });
});

/**
 * The defect this exists for: every rule above bounds the WIDTH, so the height
 * followed the image's own proportions with nothing holding it. A tall
 * screenshot scaled to the column came out taller than the sheet — visible in
 * the .docx and never in the PDF, where CSS bounds the figure.
 */
describe("fitFigure never exceeds the page", () => {
  const PAGE = 600;

  it("shrinks a portrait image until it fits the height", () => {
    // 1000x4000 at the full column would be four times as tall as it is wide.
    const box = fitFigure(asset(1000, 4000), COLUMN, 100, CAP, PAGE);
    expect(box.height).toBeLessThanOrEqual(px96(PAGE) + 0.001);
  });

  it("keeps the aspect ratio while shrinking", () => {
    const box = fitFigure(asset(1000, 4000), COLUMN, 100, CAP, PAGE);
    expect(box.height / box.width).toBeCloseTo(4000 / 1000, 6);
  });

  /** A declared width is a width — until it would run off the page. */
  it("overrides a declared width when that width would not fit", () => {
    const unbounded = fitFigure(asset(1000, 4000), COLUMN, 100, CAP, 100_000);
    const bounded = fitFigure(asset(1000, 4000), COLUMN, 100, CAP, PAGE);
    expect(bounded.width).toBeLessThan(unbounded.width);
  });

  /**
   * The half that would be easy to get wrong: this must SHRINK and never
   * enlarge, or every small control screenshot would inflate to fill the page.
   */
  it("leaves an image that already fits exactly as it was", () => {
    const small = fitFigure(asset(48, 24), COLUMN, undefined, CAP, PAGE);
    expect(small.width).toBe(48);
    expect(small.height).toBe(24);
  });

  it("leaves a landscape figure alone — those always fitted", () => {
    const wide = fitFigure(asset(1600, 900), COLUMN, 100, CAP, PAGE);
    const unbounded = fitFigure(asset(1600, 900), COLUMN, 100, CAP, 100_000);
    expect(wide).toEqual(unbounded);
  });
});
