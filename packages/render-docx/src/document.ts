import {
  AlignmentType,
  BorderStyle,
  Document,
  Footer,
  Header,
  HorizontalPositionRelativeFrom,
  ImageRun,
  LineRuleType,
  Packer,
  PageNumber,
  Paragraph,
  ShadingType,
  Table,
  TableCell,
  TableOfContents,
  TableRow,
  TabStopType,
  TextRun,
  TextWrappingType,
  VerticalAlign,
  VerticalPositionRelativeFrom,
  WidthType,
} from "docx";
import type { NodeId, ResolvedManual, SectionNode } from "@manualforge/blocks";
import type { Tokens } from "@manualforge/tokens";
import { eighths, halfPoints, requireSolid, twips } from "./measure.ts";
import type { DocxAsset, DocxAssetResolver } from "./image.ts";
import { A4, faces, layout, metrics, paints, type Face } from "./style.ts";
import { renderNode, runs, type Ctx } from "./blocks.ts";

/**
 * `ResolvedManual` → .docx. The Word deliverable.
 *
 * Same contract as every other renderer: it reads the AST and reinterprets
 * nothing. Numbering, conditioning and cross-references are resolved upstream,
 * and every value comes from the tokens.
 *
 * ## What this cannot promise
 *
 * The document matches the PDF's typography, palette, tables, figure sizing,
 * cover and page furniture. It does NOT match its PAGE BREAKS. Word reflows
 * text with its own line-breaking and table-splitting rules, so a 73-page PDF
 * may land on a different count and a figure at the top of one page may sit at
 * the foot of the previous one. Nothing here can fix that; it is what the format
 * is. The manual survives it only because its cross-references are figure and
 * section ordinals, never page numbers.
 */

/** The cover's text. Same five fields the HTML renderer takes. */
export interface CoverData {
  readonly brand: string;
  readonly title: string;
  readonly version: string;
  readonly lede: string;
  readonly meta: string;
}

export interface DocxOptions {
  /** `"BRAND  |  Title  |  vX"`, as the CLI composes it. */
  readonly header: string;
  readonly cover: CoverData;
  /**
   * The cover as a single full-bleed picture.
   *
   * The cover is the one page whose composition does not survive translation:
   * a soft radial glow, twenty-two hairline rules and an inline vector mark are
   * CSS and SVG, and Word has no equivalent for any of them. Printing that one
   * page and placing the result is pixel-exact instead of approximate, and it
   * costs nothing that matters — a cover carries no text anyone navigates to and
   * no figure anyone references.
   *
   * Omitted, the cover is composed from real text instead, which is legible but
   * plainly not the designed page.
   */
  readonly coverImage?: DocxAsset;
  readonly slots: ReadonlyMap<NodeId, string>;
  readonly assets: DocxAssetResolver;
  readonly figures: ReadonlyMap<NodeId, string>;
  readonly theme: Tokens;
  /** The footer's left-hand line, as the stylesheet's `@bottom-left` states it. */
  readonly footerNote: string;
  /** The vendor, set at the header's right edge. */
  readonly vendor: string;
}

const CLEAR = ShadingType.CLEAR;
const NO_BORDER = { style: BorderStyle.NONE, size: 0, color: "auto" } as const;

const run = (text: string, face: Face): TextRun =>
  new TextRun({
    text,
    font: face.font,
    size: face.size,
    color: face.color,
    ...(face.bold === undefined ? {} : { bold: face.bold }),
    ...(face.italics === undefined ? {} : { italics: face.italics }),
    ...(face.characterSpacing === undefined ? {} : { characterSpacing: face.characterSpacing }),
    ...(face.allCaps === undefined ? {} : { allCaps: face.allCaps }),
  });

/**
 * The running header: a dark band across the full page width.
 *
 * A paragraph's shading stops at its indents, and Word's header sits inside the
 * text column, so a band that reaches the paper's edge has to be pulled out
 * there with negative indents. The width is the page, not the column.
 *
 * The deck rule is the paragraph's bottom border — one rule, which is also how
 * the PDF finally had to draw it: three abutting margin boxes each carrying a
 * border showed a doubled line at every seam.
 */
function runningHeader(o: DocxOptions, f: ReturnType<typeof faces>, t: Tokens): Header {
  const cut = o.header.indexOf("|");
  const brand = cut === -1 ? "" : o.header.slice(0, cut).trim();
  const rest = cut === -1 ? o.header : o.header.slice(cut + 1).trim();
  const marginX = twips(t.page.marginX);
  const deck = paints(t).deck;

  return new Header({
    children: [
      new Paragraph({
        indent: { left: -marginX, right: -marginX },
        spacing: { before: 0, after: 0, line: twips(t.runningHeader.height), lineRule: LineRuleType.EXACTLY },
        shading: { type: CLEAR, fill: requireSolid(t.cover.background), color: "auto" },
        ...(deck === undefined
          ? {}
          : {
              border: {
                bottom: { style: BorderStyle.SINGLE, size: eighths("1.5pt"), color: deck, space: 0 },
              },
            }),
        tabStops: [{ type: TabStopType.RIGHT, position: twips(`${A4.widthPt}pt`) - marginX * 2 }],
        children: [
          run(`   ${brand}`, f.headerBrand),
          run(`    ${rest}`, f.headerRest),
          new TextRun({ children: [] }),
          run("\t", f.headerVendor),
          run(`${o.vendor}   `, f.headerVendor),
        ],
      }),
    ],
  });
}

/** The footer: the confidentiality line, the page number, one rule over both. */
function runningFooter(o: DocxOptions, f: ReturnType<typeof faces>, t: Tokens): Footer {
  const rule = paints(t).footerRule;
  const contentWidth = twips(`${A4.widthPt}pt`) - twips(t.page.marginX) * 2;
  return new Footer({
    children: [
      new Paragraph({
        spacing: { before: 0, after: 0 },
        ...(rule === undefined
          ? {}
          : {
              border: {
                top: { style: BorderStyle.SINGLE, size: eighths("0.6pt"), color: rule, space: 6 },
              },
            }),
        tabStops: [{ type: TabStopType.RIGHT, position: contentWidth }],
        children: [
          run(o.footerNote, f.footerNote),
          run("\t", f.footerPage),
          run("Página ", f.footerPage),
          new TextRun({
            children: [PageNumber.CURRENT],
            font: f.footerPage.font,
            size: f.footerPage.size,
            color: f.footerPage.color,
            bold: true,
          }),
        ],
      }),
    ],
  });
}

/**
 * The cover as text, for when no rendered picture is supplied.
 *
 * A full-bleed dark page is a single-cell table with no page margin around it.
 * The ornament — cables and glow — is dropped rather than faked: a row of thin
 * grey rules in Word would read as a mistake, and absence reads as restraint.
 */
function textCover(o: DocxOptions, f: ReturnType<typeof faces>, t: Tokens): readonly (Paragraph | Table)[] {
  const p = paints(t);
  const title = o.cover.title.trimEnd();
  const cut = title.lastIndexOf(" ");
  const head = cut === -1 ? "" : title.slice(0, cut);
  const tail = cut === -1 ? title : title.slice(cut + 1);
  const wide = twips(`${A4.widthPt}pt`);

  const lines: Paragraph[] = [
    new Paragraph({
      spacing: { after: twips("96pt") },
      children: [run(o.cover.brand, f.coverWordmark)],
    }),
  ];
  if (head !== "") {
    lines.push(
      new Paragraph({
        spacing: { after: 0, line: Math.round(1.12 * 240), lineRule: LineRuleType.AUTO },
        children: [run(head, f.coverTitle)],
      }),
    );
  }
  lines.push(
    new Paragraph({
      spacing: { after: twips("15pt"), line: Math.round(1.12 * 240), lineRule: LineRuleType.AUTO },
      children: [run(tail, { ...f.coverTitle, bold: true })],
    }),
    // The 52pt accent rule under the title, as a bordered empty paragraph.
    new Paragraph({
      spacing: { after: twips("13pt"), line: 1, lineRule: LineRuleType.EXACTLY },
      indent: { right: twips(`${A4.widthPt - 54 - 54 - 52}pt`) },
      border: { bottom: { style: BorderStyle.SINGLE, size: eighths("2.4pt"), color: p.coverAccent, space: 0 } },
      children: [],
    }),
    new Paragraph({
      spacing: { after: twips("120pt"), line: Math.round(1.55 * 240), lineRule: LineRuleType.AUTO },
      indent: { right: twips(`${A4.widthPt - 54 - 54 - 290}pt`) },
      children: [run(o.cover.lede, f.coverLede)],
    }),
    new Paragraph({
      spacing: { before: twips("11pt"), after: 0 },
      border: { top: { style: BorderStyle.SINGLE, size: eighths("0.6pt"), color: p.coverMetaRule, space: 8 } },
      tabStops: [{ type: TabStopType.RIGHT, position: twips(`${A4.widthPt - 108}pt`) }],
      children: [
        run(o.cover.meta, f.coverMeta),
        run("\t", f.coverVersion),
        run(`v${o.cover.version}`, f.coverVersion),
      ],
    }),
  );

  return [
    new Table({
      width: { size: wide, type: WidthType.DXA },
      columnWidths: [wide],
      borders: {
        top: NO_BORDER,
        bottom: NO_BORDER,
        left: NO_BORDER,
        right: NO_BORDER,
        insideHorizontal: NO_BORDER,
        insideVertical: NO_BORDER,
      },
      rows: [
        new TableRow({
          height: { value: twips(`${A4.heightPt}pt`), rule: "exact" },
          children: [
            new TableCell({
              shading: { type: CLEAR, fill: p.ground, color: "auto" },
              verticalAlign: VerticalAlign.CENTER,
              margins: {
                top: twips("62pt"),
                bottom: twips("44pt"),
                left: twips("54pt"),
                right: twips("54pt"),
              },
              children: lines,
            }),
          ],
        }),
      ],
    }),
  ];
}

/**
 * The cover as the rendered page, bleeding to all four edges.
 *
 * FLOATING and anchored to the page, not inline. An inline picture is laid out
 * inside the text column, and Word shrinks one that does not fit rather than
 * letting it overflow — which left a thin white margin on all four sides even
 * with the section's margins set to zero. Anchoring to the page ignores the
 * column entirely, which is the only way a full bleed is exact.
 */
function imageCover(asset: DocxAsset): readonly Paragraph[] {
  return [
    new Paragraph({
      spacing: { before: 0, after: 0, line: 1, lineRule: LineRuleType.EXACTLY },
      children: [
        new ImageRun({
          data: asset.data,
          type: asset.type,
          transformation: {
            width: (A4.widthPt * 4) / 3,
            height: (A4.heightPt * 4) / 3,
          },
          floating: {
            horizontalPosition: { relative: HorizontalPositionRelativeFrom.PAGE, offset: 0 },
            verticalPosition: { relative: VerticalPositionRelativeFrom.PAGE, offset: 0 },
            wrap: { type: TextWrappingType.NONE },
            behindDocument: true,
          },
        }),
      ],
    }),
  ];
}

/**
 * The table of contents.
 *
 * A real Word field over the heading styles, not a hand-built list. Its page
 * numbers are WORD's, computed from Word's own pagination — which is the only
 * correct answer, because the numbers in the PDF describe a document that breaks
 * its pages somewhere else. A transcribed list would be confidently wrong.
 *
 * `updateFields` makes Word populate it when the file opens.
 */
function toc(t: Tokens, f: ReturnType<typeof faces>): readonly (Paragraph | Table)[] {
  const p = paints(t);
  return [
    new Paragraph({
      spacing: { before: twips(t.space.lg), after: twips(t.space.sm) },
      border: {
        bottom: { style: BorderStyle.SINGLE, size: eighths("1.5pt"), color: p.tocTitleRule, space: 6 },
      },
      children: [run("Tabla de Contenido", f.tocTitle)],
    }),
    new TableOfContents("Tabla de Contenido", {
      hyperlink: true,
      headingStyleRange: "1-2",
    }),
  ];
}

/**
 * Neutral heading styles.
 *
 * Word ships Heading1 and Heading2 in its own blue sans. The openers set every
 * run property explicitly, but the STYLE still carries paragraph-level defaults
 * — colour inheritance, spacing, keep-with-next — so it is redeclared flat here.
 * Without this the document looks Word-default in the places a style wins.
 */
function headingStyles(t: Tokens, f: ReturnType<typeof faces>) {
  const neutral = (face: Face) => ({
    run: { font: face.font, size: face.size, color: face.color, bold: face.bold === true },
    paragraph: { spacing: { before: 0, after: 0 } },
  });
  return {
    paragraphStyles: [
      { id: "Heading1", name: "Heading 1", basedOn: "Normal", next: "Normal", quickFormat: true, ...neutral(f.sectionTitle) },
      { id: "Heading2", name: "Heading 2", basedOn: "Normal", next: "Normal", quickFormat: true, ...neutral(f.subsectionTitle) },
    ],
    default: {
      document: {
        run: { font: f.prose.font, size: f.prose.size, color: f.prose.color },
        paragraph: {
          spacing: { after: twips(t.space.md), line: Math.round(Number(t.prose.lineHeight) * 240), lineRule: LineRuleType.AUTO },
        },
      },
    },
  };
}

/** Render a resolved manual to a .docx. */
export async function renderDocx(manual: ResolvedManual, o: DocxOptions): Promise<Uint8Array> {
  const t = o.theme;
  const f = faces(t);
  const l = layout(t);
  const ctx: Ctx = {
    t,
    f,
    m: metrics(t),
    p: paints(t),
    l,
    slots: o.slots,
    assets: o.assets,
    figures: o.figures,
    numbers: manual.numbers,
  };

  const body = manual.children.flatMap((c) => renderNode(c, 0, ctx));

  const doc = new Document({
    title: `${o.cover.brand} — ${o.cover.title}`,
    creator: o.vendor,
    description: o.cover.lede,
    features: { updateFields: true },
    styles: headingStyles(t, f),
    sections: [
      // The cover: its own section, because it is the only page with no margin
      // and no furniture. `@page cover { margin: 0 }` in the stylesheet.
      {
        properties: {
          page: {
            size: { width: twips(`${A4.widthPt}pt`), height: twips(`${A4.heightPt}pt`) },
            margin: { top: 0, right: 0, bottom: 0, left: 0, header: 0, footer: 0 },
          },
        },
        children: [
          ...(o.coverImage === undefined ? textCover(o, f, t) : imageCover(o.coverImage)),
        ],
      },
      // Everything else: the band, the footer, the contents, the manual.
      {
        properties: {
          page: {
            size: { width: twips(`${A4.widthPt}pt`), height: twips(`${A4.heightPt}pt`) },
            margin: {
              top: twips(t.page.marginTop),
              right: twips(t.page.marginX),
              bottom: twips(t.page.marginBottom),
              left: twips(t.page.marginX),
              header: 0,
              footer: twips("20pt"),
            },
          },
        },
        headers: { default: runningHeader(o, f, t) },
        footers: { default: runningFooter(o, f, t) },
        children: [...toc(t, f), ...body],
      },
    ],
  });

  return new Uint8Array(await Packer.toBuffer(doc));
}

/** Section ids in document order — what a caller needs to name TOC targets. */
export const sectionIds = (manual: ResolvedManual): readonly NodeId[] =>
  manual.children.filter((c): c is SectionNode => c.kind === "section").map((s) => s.id);

export { runs, halfPoints };
