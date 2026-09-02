import type { Tokens } from "@manualforge/tokens";
import { edges, family, halfPoints, pt, requireSolid, solid, twips } from "./measure.ts";

/**
 * The stylesheet, restated in Word's terms.
 *
 * This file is the counterpart of `css-beacon.ts` and it is deliberately shaped
 * like it: one named entry per CSS class, carrying the same values from the same
 * tokens. When the two disagree the PDF is the referee, because the PDF is what
 * this document has to match.
 *
 * It holds no content decisions. Everything here is appearance, so a block
 * renderer never has to know that a step marker is letter-spaced or that a term
 * definition is indented — it asks for the face by the name the CSS uses.
 */

/** A character style: everything OOXML puts in `w:rPr`. */
export interface Face {
  readonly font: string;
  /** Half-points, as `w:sz` carries. */
  readonly size: number;
  /** Six hex digits, no hash. */
  readonly color: string;
  readonly bold?: boolean;
  readonly italics?: boolean;
  /** Twentieths of a point, as a run's `w:spacing` carries. */
  readonly characterSpacing?: number;
  readonly allCaps?: boolean;
}

/** A4, the only size the manual is built at. `@page { size: A4 }`. */
export const A4 = { widthPt: 595.276, heightPt: 841.89 } as const;

export interface Layout {
  /** The text column: A4 less the left and right page margins. */
  readonly contentWidthPt: number;
  /**
   * The text BLOCK: A4 less the top and bottom page margins.
   *
   * Word puts the running header and footer inside those margins, so this is
   * the whole height a flowing paragraph — or a picture — has to live in.
   * Nothing bounded a figure vertically before this existed, and a tall
   * screenshot scaled to the full column width came out taller than the page.
   */
  readonly contentHeightPt: number;
  readonly marginTopPt: number;
  readonly marginBottomPt: number;
  readonly marginXPt: number;
}

export function layout(t: Tokens): Layout {
  if (t.page.size !== "A4") {
    throw new Error(`render-docx only knows A4 page geometry, got "${t.page.size}"`);
  }
  const marginXPt = pt(t.page.marginX);
  const marginTopPt = pt(t.page.marginTop);
  const marginBottomPt = pt(t.page.marginBottom);
  return {
    contentWidthPt: A4.widthPt - marginXPt * 2,
    contentHeightPt: A4.heightPt - marginTopPt - marginBottomPt,
    marginTopPt,
    marginBottomPt,
    marginXPt,
  };
}

/**
 * Every face the manual uses, named after the CSS class it reproduces.
 *
 * The odd-looking ones are faithful, not mistakes:
 *  - `sectionKicker` takes its size from a SPACE token, because the stylesheet
 *    does (`font-size: ${t.space.sm}`). Reading a size token instead would make
 *    the kicker larger here than in the PDF.
 *  - `stepMarker` does the same.
 *  - `termWord` is NOT bold. The stylesheet has a `.term__word` rule, but the
 *    HTML renderer never emits that class, so the PDF shows a plain `dt`. This
 *    matches the PDF; changing it would mean changing the delivered document.
 */
export function faces(t: Tokens) {
  const sans = family(t.font.sans);
  const display = family(t.font.display);
  const mono = family(t.font.mono);
  const ground = t.cover.background;

  return {
    prose: {
      font: sans,
      size: halfPoints(t.prose.size),
      color: requireSolid(t.prose.color),
    },
    /** `strong { color: ... }` — bold AND recoloured, over the prose face. */
    strong: {
      font: sans,
      size: halfPoints(t.prose.size),
      color: requireSolid(ground),
      bold: true,
    },
    coverWordmark: {
      font: display,
      size: halfPoints("21pt"),
      color: requireSolid(t.cover.titleColor),
      bold: true,
      characterSpacing: twips("4pt"),
    },
    tocTitle: {
      font: display,
      size: halfPoints("26pt"),
      color: requireSolid(ground),
      characterSpacing: twips("-0.5pt"),
    },
    tocL1: {
      font: display,
      size: halfPoints(t.prose.size),
      color: requireSolid(ground),
      bold: true,
    },
    tocL2: {
      font: sans,
      size: halfPoints(t.table.cellSize),
      color: requireSolid(t.prose.color),
    },
    sectionKicker: {
      font: display,
      size: halfPoints(t.space.sm),
      color: requireSolid(t.sectionHeader.subtitleColor),
      characterSpacing: twips("2.4pt"),
      allCaps: true,
    },
    sectionTitle: {
      font: display,
      size: halfPoints(t.sectionHeader.titleSize),
      color: requireSolid(t.sectionHeader.titleColor),
      bold: true,
      characterSpacing: twips("-0.2pt"),
    },
    sectionSubtitle: {
      font: sans,
      size: halfPoints(t.sectionHeader.subtitleSize),
      color: requireSolid(t.sectionHeader.subtitleColor),
    },
    /** The ghosted ordinal: the accent at low alpha, flattened over the pier. */
    sectionGhost: {
      font: display,
      size: halfPoints(t.sectionHeader.ghostSize),
      color: requireSolid(t.sectionHeader.ghost, ground),
      bold: true,
      characterSpacing: twips("-3pt"),
    },
    subsectionTitle: {
      font: display,
      size: halfPoints(t.subsectionHeader.titleSize),
      color: requireSolid(t.subsectionHeader.titleColor),
      bold: true,
    },
    detailHeader: {
      font: display,
      size: halfPoints(t.detailHeader.size),
      color: requireSolid(t.detailHeader.color),
      bold: true,
    },
    fieldLabel: {
      font: display,
      size: halfPoints(t.fieldList.labelSize),
      color: requireSolid(t.fieldList.labelColor),
      bold: true,
    },
    stepMarker: {
      font: display,
      size: halfPoints(t.space.sm),
      color: requireSolid(t.procedure.markerColor),
      bold: true,
      characterSpacing: twips("1.6pt"),
      allCaps: true,
    },
    stepTitle: {
      font: display,
      size: halfPoints(t.procedure.stepTitleSize),
      color: requireSolid(t.procedure.stepTitleColor),
      bold: true,
    },
    termWord: {
      font: display,
      size: halfPoints(t.termList.size),
      color: requireSolid(t.termList.termColor),
    },
    termDefinition: {
      font: sans,
      size: halfPoints(t.termList.size),
      color: requireSolid(t.prose.color),
    },
    callout: {
      font: sans,
      size: halfPoints(t.callout.size),
      color: requireSolid(t.callout.color),
    },
    calloutLabel: {
      font: display,
      size: halfPoints(t.callout.labelSize),
      color: requireSolid(t.callout.color),
      bold: true,
    },
    tableHead: {
      font: display,
      size: halfPoints(t.table.headSize),
      color: requireSolid(t.table.headColor),
      characterSpacing: twips("0.5pt"),
    },
    tableCell: {
      font: sans,
      size: halfPoints(t.table.cellSize),
      color: requireSolid(t.table.cellColor),
    },
    tableLabel: {
      font: sans,
      size: halfPoints(t.table.cellSize),
      color: requireSolid(t.table.labelColor),
      bold: true,
    },
    figCaption: {
      font: sans,
      size: halfPoints(t.figure.captionSize),
      color: requireSolid(t.figure.captionColor),
      italics: t.figure.captionStyle === "italic",
    },
    headerBrand: {
      font: display,
      size: halfPoints(t.runningHeader.textSize),
      color: requireSolid(t.runningHeader.brandColor),
      bold: true,
      characterSpacing: twips("1.6pt"),
    },
    headerRest: {
      font: sans,
      size: halfPoints(t.runningHeader.textSize),
      color: requireSolid(t.runningHeader.textColor),
    },
    headerVendor: {
      font: display,
      size: halfPoints(t.runningHeader.textSize),
      color: requireSolid(t.runningHeader.textColor),
      characterSpacing: twips("2.2pt"),
    },
    footerNote: {
      font: sans,
      size: halfPoints(t.runningFooter.textSize),
      color: requireSolid(t.runningFooter.textColor),
    },
    footerPage: {
      font: display,
      size: halfPoints(t.runningFooter.pageNumberSize),
      color: requireSolid(t.runningFooter.pageNumberColor),
      bold: true,
    },
    coverTitle: {
      font: display,
      size: halfPoints("33pt"),
      color: requireSolid(t.cover.titleColor),
      characterSpacing: twips("-0.4pt"),
    },
    coverLede: {
      font: sans,
      size: halfPoints("10.5pt"),
      color: requireSolid(t.cover.ledeColor),
    },
    coverMeta: {
      font: sans,
      size: halfPoints(t.runningFooter.textSize),
      color: requireSolid(t.cover.metaColor),
    },
    coverVersion: {
      font: mono,
      size: halfPoints(t.runningFooter.textSize),
      color: requireSolid(t.cover.accent),
    },
  } as const satisfies Record<string, Face>;
}

export type Faces = ReturnType<typeof faces>;

/** Block geometry the renderers need, read once from the tokens. */
export function metrics(t: Tokens) {
  return {
    /** `.prose { line-height }`, in the 240ths OOXML's `auto` line rule uses. */
    proseLine: Math.round(Number(t.prose.lineHeight) * 240),
    spaceXs: twips(t.space.xs),
    spaceSm: twips(t.space.sm),
    spaceMd: twips(t.space.md),
    spaceLg: twips(t.space.lg),
    spaceXl: twips(t.space.xl),
    /** `table.tbl th/td { padding: 6pt 8pt }`. */
    cellPad: { vertical: twips("6pt"), horizontal: twips("8pt") },
    /** `td.tbl__icon { width: 34pt }` and the 26pt cap on the icon inside it. */
    iconColumnPt: pt("34pt"),
    iconMaxPt: pt("26pt"),
    iconPendingMaxPt: pt("24pt"),
    /** `.pair__figure { flex: 0 0 38% }` beside `.pair { gap }`. */
    pairFigureFraction: 0.38,
    /** `figure.figure--item img { max-width: 70% }`. */
    itemFigureCap: 0.7,
    /** `.section-header { padding }`, and the pier's own inset. */
    openerPad: edges(t.sectionHeader.pad),
    /** `.callout { padding: 8pt 11pt }` and its 2.5pt left rule. */
    calloutPad: edges("8pt 11pt"),
    calloutRulePt: pt("2.5pt"),
    /** `.subsection-header { padding: 6pt 10pt }` and its 2.5pt left rule. */
    subsectionPad: edges("6pt 10pt"),
    /** `dd { margin-inline-start }` — the browser default the PDF renders with. */
    termIndent: twips("30pt"),
  } as const;
}

export type Metrics = ReturnType<typeof metrics>;

/** Fills and rules, resolved once. `undefined` where a brand paints nothing. */
export function paints(t: Tokens) {
  const ground = t.cover.background;
  return {
    ground: requireSolid(ground),
    /** The 1.5pt deck rule under the running header. */
    deck: solid(t.runningHeader.deck),
    footerRule: solid(t.runningFooter.rule),
    tableRule: requireSolid(t.table.rule),
    tableHeadFill: requireSolid(ground),
    dataTableHeadFill: requireSolid(t.dataTable.headBackground),
    tableAltFill: requireSolid(t.table.rowAltBackground),
    dataTableAltFill: requireSolid(t.dataTable.rowAltBackground),
    subsectionFill: requireSolid(t.subsectionHeader.background),
    subsectionRule: requireSolid(t.subsectionHeader.accent),
    calloutInfoFill: requireSolid(t.callout.info.background),
    calloutInfoRule: requireSolid(t.callout.info.accent),
    calloutImportantFill: requireSolid(t.callout.important.background),
    calloutImportantRule: requireSolid(t.callout.important.accent),
    tocRule: requireSolid(t.runningFooter.rule),
    tocTitleRule: requireSolid(t.sectionHeader.accent),
    coverAccent: requireSolid(t.cover.accent),
    coverMetaRule: requireSolid(t.cover.accentSoft, ground),
  } as const;
}

export type Paints = ReturnType<typeof paints>;
