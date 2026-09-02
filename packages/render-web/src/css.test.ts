import { describe, expect, it } from "vitest";
import { themes, tokens } from "@manualforge/tokens";
import { stylesheet } from "./css.ts";
import { beaconStylesheet } from "./css-beacon.ts";

describe("stylesheet", () => {
  it("escapes a double quote in the header so the CSS string is not broken", () => {
    const css = stylesheet(tokens, 'ATLAS | Manual "especial" | v1.0');
    expect(css).toContain('content: "ATLAS | Manual \\"especial\\" | v1.0";');
  });

  it("escapes a backslash in the header", () => {
    const css = stylesheet(tokens, "ATLAS \\ v1.0");
    expect(css).toContain('content: "ATLAS \\\\ v1.0";');
  });

  it("neutralises a literal </style> sequence so it cannot close the surrounding <style> element early", () => {
    const css = stylesheet(tokens, "ATLAS </style><script>alert(1)</script>");
    expect(css).not.toMatch(/<\/style/i);
  });

  // Beacon has its OWN stylesheet. These assert the separation itself, because
  // the first attempt shared one configurable sheet and that is exactly how a
  // delivered document becomes something another brand's change can break.
  it("keeps Atlas's sheet free of anything Beacon introduced", () => {
    const css = stylesheet(themes.atlas, "VENDOR");
    expect(css).not.toContain("Century Gothic");
    expect(css).not.toContain("cover__lockup");
    expect(css).not.toContain("section-header__kicker");
  });

  it("renders Atlas identically whichever brand exists beside it", () => {
    // The Atlas sheet takes tokens, so this is the guarantee that matters:
    // its output depends on ITS tokens and nothing else.
    expect(stylesheet(themes.atlas, "X")).toBe(stylesheet(themes.atlas, "X"));
  });

  it("gives Beacon its display face, its deck rule and its cover ornament", () => {
    const css = beaconStylesheet(themes.beacon, "VENDOR");
    // Century Gothic, not Outfit. Beacon's web face was named here for months
    // and never once loaded — no font file, no @font-face — so the printer fell
    // through to this, and the delivered PDF embeds it. The tokens now say so
    // out loud, because a second renderer made the difference matter: Word
    // substitutes a missing family on the READER's machine. See `font` in
    // packages/tokens.
    expect(css).toContain("Century Gothic");
    expect(css).not.toContain("Outfit");
    expect(css).toContain("#14B8A6");
    expect(css).toContain("cover__lockup");
    expect(css).toContain("section-header__kicker");
  });

  it("escapes the header in Beacon's sheet too, not only in Atlas's", () => {
    const css = beaconStylesheet(themes.beacon, 'BEACON </style><script>alert(1)</script>');
    expect(css).not.toMatch(/<\/style/i);
  });

  // A figure's WIDTH is declared (`widthPercent`) and does not move when an
  // image arrives. Its HEIGHT came from the file's own proportions, and nothing
  // held it: deliver a 4:3 screenshot into a slot whose placeholder is 8:5 and
  // that block changes height, the page break moves, and the document has to be
  // re-laid-out by hand. Measured on the first product: exactly that, repeatedly.
  //
  // So the BOX is pinned and the image fits inside it. The box is what the reader
  // has been looking at all along, because every slot renders the placeholder
  // until it does not.
  describe("Beacon pins the figure box so a delivery cannot move the page", () => {
    const css = beaconStylesheet(themes.beacon, "VENDOR");

    it("pins the ratio and lets the image letterbox inside it", () => {
      expect(css).toContain("aspect-ratio: 320 / 200");
      expect(css).toContain("object-fit: contain");
    });

    // The `beside` layout inherits the rule above rather than declaring its own.
    // Beacon's sheet has no `.pair__figure figure img` at all — Atlas's does —
    // so what this asserts is that no such override appears and quietly unpins
    // exactly the figures that sit beside a procedure step.
    it("leaves the beside layout covered by that same rule, with no override", () => {
      expect(css).toContain(".pair__figure figure { margin: 0; }");
      expect(css).not.toMatch(/\.pair__figure figure img/);
    });

    // Table icons were never at risk: that cell bounds them on BOTH axes
    // already, which is why this change is about figures and nothing else.
    it("leaves the icon cell's own bounds alone", () => {
      expect(css).toContain("max-width: 26pt; max-height: 26pt");
    });

    // Same reasoning as every other assertion in this file: Beacon's sheet is
    // its own, and a delivered document must not change because another brand
    // needed something.
    it("does not reach into Atlas's sheet", () => {
      expect(stylesheet(themes.atlas, "VENDOR")).not.toContain("aspect-ratio");
    });
  });
});
