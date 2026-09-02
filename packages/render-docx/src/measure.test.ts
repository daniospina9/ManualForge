import { describe, expect, it } from "vitest";
import { edges, family, halfPoints, px96, pt, solid, twips } from "./measure.ts";

describe("pt", () => {
  it("reads the token's own unit", () => {
    expect(pt("9.5pt")).toBe(9.5);
    expect(pt("62pt")).toBe(62);
  });

  it("refuses a unit it cannot convert rather than guessing", () => {
    // Tokens are authored in points throughout. A value in anything else is a
    // token change this package has not been told about, and silently reading
    // the digits would place it at the wrong size.
    expect(() => pt("12px")).toThrow(/points/);
    expect(() => pt("1.55")).toThrow(/points/);
  });
});

describe("halfPoints", () => {
  it("converts a font size to the unit OOXML stores", () => {
    expect(halfPoints("9.5pt")).toBe(19);
    expect(halfPoints("13pt")).toBe(26);
  });

  it("keeps every size on the type scale an exact integer", () => {
    // 7 / 8 / 8.5 / 9 / 9.5 / 10 / 10.5 / 13 — the whole scale doubles cleanly,
    // so no font size in this document is ever rounded.
    const scale = ["7pt", "8pt", "8.5pt", "9pt", "9.5pt", "10pt", "10.5pt", "13pt"];
    for (const s of scale) expect(halfPoints(s) % 1).toBe(0);
  });
});

describe("twips", () => {
  it("converts spacing to twentieths of a point", () => {
    expect(twips("10pt")).toBe(200);
    expect(twips("62pt")).toBe(1240);
  });
});

describe("px96", () => {
  it("converts points to the 96-DPI pixels docx multiplies into EMU", () => {
    // docx computes emus = value * 9525, and 914400 EMU is an inch, so its unit
    // is a 96-DPI pixel: 72pt to the inch means 1pt is 4/3 of one.
    expect(px96(72)).toBe(96);
    expect(px96(471.276)).toBeCloseTo(628.368, 3);
  });
});

describe("solid", () => {
  it("strips the hash OOXML does not use", () => {
    expect(solid("#0D1525")).toBe("0D1525");
    expect(solid("#FFFFFF")).toBe("FFFFFF");
  });

  it("reports absence for the values that mean no paint", () => {
    // A brand without a deck rule sets it to `transparent` so the rule stays in
    // the stylesheet and only its colour changes. Word has no transparent
    // border — it has no border, which is what undefined says here.
    expect(solid("transparent")).toBeUndefined();
    expect(solid("none")).toBeUndefined();
  });

  it("flattens a translucent value against the ground it sits on", () => {
    // Word fills are opaque. The ghost number is the accent at 15% over the
    // cover ground, so the composite is what must be named.
    expect(solid("rgba(94,234,212,0.15)", "#040A14")).toBe("122C31");
    // Fully opaque and fully transparent are the ends of the same formula.
    expect(solid("rgba(94,234,212,1)", "#040A14")).toBe("5EEAD4");
    expect(solid("rgba(94,234,212,0)", "#040A14")).toBe("040A14");
  });

  it("refuses to flatten without knowing the ground", () => {
    // Guessing white here would put a pale ghost on a near-black pier.
    expect(() => solid("rgba(94,234,212,0.15)")).toThrow(/backdrop/);
  });
});

describe("family", () => {
  it("commits to the head of the stack, because Word cannot fall back", () => {
    expect(family("'Century Gothic', 'Avenir Next', Arial, sans-serif")).toBe("Century Gothic");
    expect(family("Arial, Helvetica, sans-serif")).toBe("Arial");
    expect(family("Consolas, 'DejaVu Sans Mono', Menlo, monospace")).toBe("Consolas");
  });

  it("rejects a stack with no family to commit to", () => {
    expect(() => family("")).toThrow(/family/);
    expect(() => family(", Arial")).toThrow(/family/);
  });
});

describe("edges", () => {
  it("expands the CSS shorthand the padding tokens are written in", () => {
    expect(edges("10pt")).toEqual({ top: 10, right: 10, bottom: 10, left: 10 });
    expect(edges("10pt 14pt")).toEqual({ top: 10, right: 14, bottom: 10, left: 14 });
    expect(edges("22pt 18pt 20pt")).toEqual({ top: 22, right: 18, bottom: 20, left: 18 });
    expect(edges("1pt 2pt 3pt 4pt")).toEqual({ top: 1, right: 2, bottom: 3, left: 4 });
  });

  it("rejects a shorthand with no CSS meaning", () => {
    expect(() => edges("")).toThrow(/shorthand/);
    expect(() => edges("1pt 2pt 3pt 4pt 5pt")).toThrow(/shorthand/);
  });
});
