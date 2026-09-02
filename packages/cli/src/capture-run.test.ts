import { describe, expect, it } from "vitest";
import { looksBlank } from "./capture-run.ts";

/**
 * The rest of `capture-run.ts` drives a real browser, so this boundary is the
 * only part of it a test can reach. It is worth reaching: the number decides
 * whether an attached run recovers from the product's re-entry defect or reports
 * a healthy screen as dead, and the two mistakes fail in opposite directions.
 */
describe("looksBlank", () => {
  it("calls a blanked tree blank — a dead Beacon360 reports exactly zero", () => {
    expect(looksBlank(0)).toBe(true);
  });

  it("does NOT call the emptiest healthy view blank", () => {
    // Beacon of Things showing only its landing panel, measured: 641.
    expect(looksBlank(641)).toBe(false);
  });

  it("leaves room under the threshold rather than sitting on the observed zero", () => {
    // A tree part-way through mounting is still not a screen worth shooting, so
    // a little slack below is deliberate. If this ever has to grow past the
    // hundreds, the gap it relies on has closed and the check needs rethinking.
    expect(looksBlank(40)).toBe(true);
    expect(looksBlank(41)).toBe(false);
  });
});
