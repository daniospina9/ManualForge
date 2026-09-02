/**
 * Token values, in the units OOXML stores them in.
 *
 * Tokens hold CSS: `"9.5pt"`, `"#0D1525"`, `"rgba(94,234,212,0.15)"`,
 * `"22pt 18pt 20pt"`. The tokens package is forbidden from holding a
 * renderer-specific value, so every translation into Word's units lives here and
 * nowhere else.
 *
 * Word measures the same document four different ways, and getting one wrong is
 * invisible until the page is looked at:
 *
 *  - font sizes in HALF-POINTS
 *  - spacing, indents, page geometry in TWIPS, a twentieth of a point
 *  - borders in EIGHTHS of a point
 *  - images in 96-DPI PIXELS, which `docx` multiplies by 9525 into EMU
 */

/** A token's point value. Throws rather than guess at any other unit. */
export function pt(value: string): number {
  const m = /^(-?\d+(?:\.\d+)?)pt$/.exec(value.trim());
  if (m === null || m[1] === undefined) {
    throw new Error(`expected a value in points, got "${value}"`);
  }
  return Number(m[1]);
}

/** A font size, in the half-points OOXML's `w:sz` carries. */
export const halfPoints = (value: string): number => Math.round(pt(value) * 2);

/** Spacing, indents and page geometry, in twentieths of a point. */
export const twips = (value: string): number => Math.round(pt(value) * 20);

/** A border width, in the eighths of a point OOXML's `w:sz` carries for rules. */
export const eighths = (value: string): number => Math.max(1, Math.round(pt(value) * 8));

/**
 * Points as the unit `docx` takes for image size.
 *
 * It computes `emus = value * 9525`, and an inch is 914400 EMU, so its unit is a
 * 96-DPI pixel. 72 points to the inch makes one point 4/3 of one.
 */
export const px96 = (points: number): number => (points * 4) / 3;

const channel = (v: string): number => {
  const n = Number(v);
  if (!Number.isFinite(n) || n < 0 || n > 255) throw new Error(`bad colour channel "${v}"`);
  return n;
};

/**
 * A token colour as the six hex digits OOXML wants, or `undefined` for no paint.
 *
 * Three shapes arrive here. `#RRGGBB` loses its hash. `transparent` and `none`
 * mean a brand switched an ornament off — Word has no transparent fill, it has
 * no fill, which is what `undefined` says. `rgba()` has no OOXML equivalent at
 * all: a fill is opaque, so the composite over the ground it sits on is the only
 * honest answer, and `backdrop` is required because the same accent at 15% is a
 * different colour over the cover than over paper.
 */
export function solid(value: string, backdrop?: string): string | undefined {
  const v = value.trim();
  if (v === "transparent" || v === "none") return undefined;

  const hex = /^#([0-9a-fA-F]{6})$/.exec(v);
  if (hex?.[1] !== undefined) return hex[1].toUpperCase();

  const rgba = /^rgba?\(([^)]+)\)$/.exec(v);
  if (rgba?.[1] !== undefined) {
    const parts = rgba[1].split(",").map((p) => p.trim());
    const [r, g, b, a = "1"] = parts;
    if (r === undefined || g === undefined || b === undefined || parts.length > 4) {
      throw new Error(`bad rgba colour "${value}"`);
    }
    const alpha = Number(a);
    if (!Number.isFinite(alpha) || alpha < 0 || alpha > 1) {
      throw new Error(`bad alpha in "${value}"`);
    }
    if (backdrop === undefined) {
      throw new Error(`"${value}" is translucent and needs a backdrop to flatten against`);
    }
    const under = solid(backdrop);
    if (under === undefined) {
      throw new Error(`backdrop "${backdrop}" is not a colour to flatten against`);
    }
    const mix = (top: number, i: number): number => {
      const bottom = Number.parseInt(under.slice(i * 2, i * 2 + 2), 16);
      return Math.round(top * alpha + bottom * (1 - alpha));
    };
    return [channel(r), channel(g), channel(b)]
      .map((c, i) => mix(c, i).toString(16).padStart(2, "0"))
      .join("")
      .toUpperCase();
  }

  throw new Error(`unrecognised colour "${value}"`);
}

/** `solid`, for a value that must produce paint. */
export function requireSolid(value: string, backdrop?: string): string {
  const c = solid(value, backdrop);
  if (c === undefined) throw new Error(`"${value}" produces no colour, but one is required`);
  return c;
}

/**
 * The one family name Word gets, taken from the head of a CSS stack.
 *
 * CSS lists alternates and lets the printer choose. OOXML names a single family
 * and lets the READING machine substitute, which is a different thing: a face
 * missing on the client's computer is resolved there, not here, and the document
 * stops matching. Committing to the first entry is only safe because the Beacon
 * fonts are frozen to faces that ship with Office — see the note on `font` in
 * the tokens package. Lifting that freeze without solving font embedding makes
 * this function name a face the PDF does not use.
 */
export function family(stack: string): string {
  const first = stack.split(",")[0]?.trim() ?? "";
  const name = first.replace(/^['"]|['"]$/g, "").trim();
  if (name === "") throw new Error(`font stack names no family: "${stack}"`);
  return name;
}

export interface Edges {
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
  readonly left: number;
}

/** A CSS padding shorthand, expanded to four point values. */
export function edges(shorthand: string): Edges {
  const v = shorthand.trim().split(/\s+/).filter((s) => s !== "");
  const [a, b, c, d] = v;
  if (a === undefined || v.length > 4) {
    throw new Error(`"${shorthand}" is not a 1-to-4 value CSS shorthand`);
  }
  const top = pt(a);
  const right = b === undefined ? top : pt(b);
  const bottom = c === undefined ? top : pt(c);
  const left = d === undefined ? right : pt(d);
  return { top, right, bottom, left };
}
