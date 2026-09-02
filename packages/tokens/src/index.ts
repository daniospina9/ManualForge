/**
 * Design tokens, one palette per brand.
 *
 * The Atlas values were extracted from the vector content stream of
 * `Manual_Atlas_v5.pdf` (exact source values, not sampled pixels); the
 * Beacon values come from Beacon360's own `@theme` block in `src/app/App.css`.
 * Neither was sampled from a screenshot, and neither is a placeholder awaiting
 * replacement.
 *
 * Nothing outside this file may hardcode a colour or a size.
 *
 * The two brands share the SEMANTIC layer below and differ only in the palette
 * and type fed into it. That is deliberate: a second manual must not become a
 * second renderer, or every fix has to be made twice.
 */

/** One rung of a ramp is a CSS length. Points, in practice — see `Brand.scale`. */
type Ramp<K extends string> = Readonly<Record<K, string>>;
type SizeKey = "xs" | "sm" | "base" | "md" | "body" | "lg" | "xl" | "xxl";
type SpaceKey = "xs" | "sm" | "md" | "lg" | "xl";

/** What one brand supplies. Only the semantic layer may read these. */
interface Brand {
  readonly color: {
    /** Section bands, table heads, running header. */
    readonly deep: string;
    /** The cover ground. Usually a shade darker than `deep`. */
    readonly deepest: string;
    /** The accent, on dark grounds. */
    readonly accentLight: string;
    /** The accent, on paper — must hold contrast against white. */
    readonly accentDark: string;
    readonly bodyInk: string;
    readonly mutedInk: string;
    readonly headerInk: string;
    readonly surfaceAccent: string;
    readonly surfaceCool: string;
    readonly ruleLight: string;
  };
  readonly font: {
    readonly sans: string;
    /**
     * Headings, numbers and labels. Atlas sets this to its body face — one
     * neutral doing everything, which is what makes it read operational.
     * Beacon gives it a geometric display face, which is most of what
     * distinguishes the two manuals once the palettes are this close.
     */
    readonly display: string;
    readonly mono: string;
  };
  /** A 1.5pt rule under the running header. `none` on brands without one. */
  readonly deckRule: string;
  /** The ghosted section number behind a section opener. */
  readonly ghostNumber: string;
  /**
   * Composition, not colour. Two brands can share a renderer and still not
   * share a cover: these say WHICH arrangement to draw, and the markup and
   * stylesheet carry both.
   *
   * `band`  the wordmark set large against a rule — Atlas's.
   * `mark`  a logo beside a wordmark, the title light and set low — Beacon's.
   */
  readonly coverStyle: "band" | "mark";
  /** Small label above a section title ("MÓDULO"). Empty for none. */
  readonly sectionKicker: string;
  /** How tall the section opener sits, and how big its ghost number runs. */
  readonly openerPad: string;
  readonly ghostSize: string;
  /** Cover ornament: hairline verticals and a soft glow. Transparent for none. */
  readonly coverHairline: string;
  readonly coverGlow: string;
  /** Which stylesheet to render with. Two brands, two files, no shared risk. */
  readonly sheet: "atlas" | "beacon";
  /**
   * Type scale and spacing ramp. Omit it and the brand gets `defaultScale`
   * unchanged; give part of it and only those keys move.
   *
   * Opened because the first two manuals could differ in palette and type but
   * not in rhythm, and rhythm is most of what makes a design read as its own.
   * The cost is the one the shared layer was buying: a key overridden here is a
   * key that no longer gets fixed once for everybody.
   *
   * **Points only.** Every value ends up in CSS, where any unit is accepted, and
   * in Word, where `pt()` throws on anything that is not `<number>pt`. A `--docx`
   * build is the check that catches a wrong unit; the PDF will not complain.
   */
  readonly scale?: {
    readonly size?: Partial<Ramp<SizeKey>>;
    readonly space?: Partial<Ramp<SpaceKey>>;
  };
}

const atlas: Brand = {
  color: {
    deep: "#1A2332",
    deepest: "#192231",
    accentLight: "#2DD4BF",
    accentDark: "#0D9488",
    bodyInk: "#2D3748",
    mutedInk: "#8FA3B8",
    headerInk: "#E8EDF2",
    surfaceAccent: "#F0F7F6",
    surfaceCool: "#F0F4F8",
    ruleLight: "#D0E0EC",
  },
  font: {
    sans: "Helvetica, Arial, sans-serif",
    display: "Helvetica, Arial, sans-serif",
    mono: "Consolas, 'DejaVu Sans Mono', Menlo, monospace",
  },
  deckRule: "transparent",
  ghostNumber: "transparent",
  coverStyle: "band",
  sectionKicker: "",
  openerPad: "10pt 14pt",
  ghostSize: "46pt",
  coverHairline: "transparent",
  coverGlow: "transparent",
  sheet: "atlas",
};

/** Beacon360. Palette and type from its own `@theme`; see the header above. */
const beacon: Brand = {
  color: {
    deep: "#0D1525",
    deepest: "#040A14",
    accentLight: "#5EEAD4",
    accentDark: "#0F766E",
    bodyInk: "#44566A",
    mutedInk: "#7C8FA3",
    headerInk: "#E8EDF2",
    surfaceAccent: "#F1F5F8",
    surfaceCool: "#F1F5F8",
    ruleLight: "#D7E3EA",
  },
  /**
   * FROZEN, by decision — these are not Beacon360's web faces.
   *
   * The product loads Outfit, Geist Variable and Montserrat from Google Fonts
   * (`src/app/App.css`), and this block used to name them. Nothing ever served
   * them: there is no font file in this repository and no `@font-face`, so the
   * printer silently fell through every chain. Inspecting the delivered PDF's
   * font table shows what it actually embedded — CenturyGothic, ArialMT,
   * Consolas. The manual has never been set in Beacon's type.
   *
   * They are named explicitly now instead of being restored, because a second
   * renderer changed what the fallback costs. Word cannot resolve a CSS chain:
   * it substitutes per reading machine, so a face that is not installed on the
   * client's computer makes the .docx render differently there than here.
   * Century Gothic, Arial and Consolas ship with Office, which is what lets the
   * PDF and the .docx be the same document.
   *
   * This keeps the brands apart, which is the point of the field: Atlas sets
   * body and display to one neutral, Beacon answers with a geometric display.
   * Century Gothic carries that contrast. Reversing the freeze means bundling
   * the real faces as files AND solving Word font embedding — both, or neither,
   * or the two deliverables stop matching.
   */
  font: {
    sans: "Arial, Helvetica, sans-serif",
    display: "'Century Gothic', 'Avenir Next', Arial, sans-serif",
    mono: "Consolas, 'DejaVu Sans Mono', Menlo, monospace",
  },
  deckRule: "#14B8A6",
  ghostNumber: "rgba(94,234,212,0.15)",
  coverStyle: "mark",
  sectionKicker: "Módulo",
  // Taller than Atlas's, and the ghost runs big enough to bleed off the top
  // edge — the pier the opener is meant to read as.
  openerPad: "22pt 18pt 20pt",
  ghostSize: "76pt",
  coverHairline: "rgba(20,184,166,0.13)",
  coverGlow: "rgba(20,184,166,0.16)",
  sheet: "beacon",
};

/**
 * The rhythm every brand starts from. A brand keeps it by saying nothing, and
 * overrides only the rungs it needs through `Brand.scale`.
 *
 * These were shared outright until a second manual needed its own type scale.
 * They remain the default because most of a manual is page geometry, and a brand
 * that redefines all thirteen has taken on maintaining all thirteen.
 */
const defaultScale: { size: Ramp<SizeKey>; space: Ramp<SpaceKey> } = {
  size: {
    xs: "7pt",
    sm: "8pt",
    base: "8.5pt",
    md: "9pt",
    body: "9.5pt",
    lg: "10pt",
    xl: "10.5pt",
    xxl: "13pt",
  },
  space: {
    xs: "3pt",
    sm: "6pt",
    md: "10pt",
    lg: "16pt",
    xl: "24pt",
  },
} as const;

/** Named roles. Blocks and renderers reference only these. */
function build(brand: Brand) {
  // Merged per rung, not per group: a brand that overrides `size.xxl` keeps the
  // other seven sizes shared, which is the whole point of the default existing.
  const scale = {
    size: { ...defaultScale.size, ...brand.scale?.size },
    space: { ...defaultScale.space, ...brand.scale?.space },
  };
  return {
  page: {
    size: "A4",
    marginTop: "62pt",
    marginBottom: "52pt",
    marginX: "62pt",
    background: "#FFFFFF",
    /**
     * Breathing room between the running header bar and the first thing on the
     * page.
     *
     * Its own token rather than a `space` value: this is page geometry, not
     * block rhythm, and it cannot be expressed as a margin. The header bar's
     * height IS `marginTop` — the paginator paints the bar on the page's margin
     * row — so enlarging the margin makes the bar taller and the gap stays zero.
     */
    contentTop: "16pt",
  },
  runningHeader: {
    background: brand.color.deep,
    accent: brand.color.accentLight,
    brandColor: brand.color.accentLight,
    brandSize: scale.size.sm,
    textColor: brand.color.headerInk,
    textSize: scale.size.sm,
    height: "37pt",
    /**
     * The deck line. A 1.5pt rule under the running header that runs the whole
     * document — Beacon's one ornament, and a structural echo of its own logo.
     * `transparent` on a brand without one, so the rule is always in the
     * stylesheet and only its colour changes.
     */
    deck: brand.deckRule,
  },
  runningFooter: {
    rule: brand.color.accentLight,
    textColor: brand.color.mutedInk,
    textSize: scale.size.xs,
    pageNumberColor: brand.color.deep,
    pageNumberSize: scale.size.sm,
  },
  sectionHeader: {
    background: brand.color.deep,
    accent: brand.color.accentLight,
    titleColor: "#FFFFFF",
    titleSize: scale.size.xxl,
    subtitleColor: brand.color.accentLight,
    subtitleSize: scale.size.md,
    /** The section number, set large and ghosted behind the title. */
    ghost: brand.ghostNumber,
    ghostSize: brand.ghostSize,
    kicker: brand.sectionKicker,
    pad: brand.openerPad,
  },
  subsectionHeader: {
    background: brand.color.surfaceAccent,
    accent: brand.color.accentLight,
    titleColor: brand.color.deep,
    titleSize: scale.size.xl,
  },
  detailHeader: {
    color: brand.color.accentDark,
    size: scale.size.lg,
  },
  prose: {
    color: brand.color.bodyInk,
    size: scale.size.body,
    lineHeight: "1.55",
    align: "justify",
  },
  table: {
    headBackground: brand.color.deep,
    headColor: "#FFFFFF",
    headSize: scale.size.base,
    rowBackground: "#FFFFFF",
    rowAltBackground: brand.color.surfaceCool,
    labelColor: brand.color.accentDark,
    cellColor: "#000000",
    cellSize: scale.size.base,
    rule: brand.color.ruleLight,
  },
  figure: {
    captionColor: brand.color.mutedInk,
    captionSize: scale.size.sm,
    captionStyle: "italic",
  },
  callout: {
    info: {
      background: brand.color.surfaceAccent,
      accent: brand.color.accentDark,
    },
    important: {
      background: "#FFF8E8",
      accent: "#F59E0B",
    },
    color: brand.color.deep,
    size: scale.size.base,
    labelSize: scale.size.base,
  },
  fieldList: {
    labelColor: brand.color.accentDark,
    labelSize: scale.size.lg,
  },
  procedure: {
    stepTitleColor: brand.color.deep,
    stepTitleSize: scale.size.xl,
    markerColor: brand.color.accentDark,
  },
  termList: {
    termColor: brand.color.bodyInk,
    size: scale.size.body,
  },
  dataTable: {
    headBackground: brand.color.accentDark,
    headColor: "#FFFFFF",
    labelColor: brand.color.accentDark,
    cellColor: "#000000",
    rowAltBackground: brand.color.surfaceAccent,
  },
  cover: {
    style: brand.coverStyle,
    sheet: brand.sheet,
    hairline: brand.coverHairline,
    glow: brand.coverGlow,
    accentSoft: "rgba(94,234,212,0.22)",
    ledeColor: "#B6C7D6",
    background: brand.color.deepest,
    accent: brand.color.accentLight,
    titleColor: "#FFFFFF",
    subtitleColor: brand.color.accentLight,
    metaColor: brand.color.mutedInk,
  },
  /**
   * The draft build only. Amber rather than the brand palette, and deliberately
   * loud: a draft carries the filenames the capture team must reproduce, and it
   * must be impossible to mistake for the document a client receives.
   */
  draft: {
    accent: "#F59E0B",
    background: "#FFF8E8",
    slotColor: brand.color.bodyInk,
    slotSize: scale.size.xs,
  },
  space: scale.space,
  font: brand.font,
  } as const;
}

export const themes = {
  atlas: build(atlas),
  beacon: build(beacon),
} as const;

/** A theme name a manual may ask for in its config. */
export type ThemeName = keyof typeof themes;
export const isThemeName = (v: unknown): v is ThemeName =>
  typeof v === "string" && Object.hasOwn(themes, v);

/** The default, so existing callers and tests keep working unchanged. */
export const tokens = themes.atlas;
export type Tokens = ReturnType<typeof build>;
