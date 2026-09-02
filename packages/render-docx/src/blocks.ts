import {
  AlignmentType,
  BorderStyle,
  ImageRun,
  LineRuleType,
  Paragraph,
  ShadingType,
  Table,
  TableCell,
  TableRow,
  TabStopType,
  TextRun,
  VerticalAlign,
  WidthType,
} from "docx";
import type { BlockNode, ManualNode, NodeId, SectionNode } from "@manualforge/blocks";
import { formatChangeLogDate } from "@manualforge/blocks";
import type { Tokens } from "@manualforge/tokens";
import { eighths, twips } from "./measure.ts";
import { fitFigure, fitIcon, type Box, type DocxAsset, type DocxAssetResolver } from "./image.ts";
import type { Faces, Layout, Metrics, Paints, Face } from "./style.ts";

/**
 * `ResolvedManual` nodes as Word content.
 *
 * One function per block type, matching `render-web` one to one — a block that
 * renders there and not here is an incomplete block, and the unknown-type case
 * throws for the same reason it throws there.
 *
 * Nothing here recomputes an ordinal. Step numbers come from `numbers`, figure
 * numbers from `figures`, both assigned upstream after conditioning. Deriving
 * either from a node's position would drift from the PDF the moment a tenant
 * excludes something.
 */

export interface Ctx {
  readonly t: Tokens;
  readonly f: Faces;
  readonly m: Metrics;
  readonly p: Paints;
  readonly l: Layout;
  readonly slots: ReadonlyMap<NodeId, string>;
  readonly assets: DocxAssetResolver;
  readonly figures: ReadonlyMap<NodeId, string>;
  readonly numbers: ReadonlyMap<NodeId, string>;
}

/** A run in one of the named faces. */
function run(text: string, face: Face): TextRun {
  return new TextRun({
    text,
    font: face.font,
    size: face.size,
    color: face.color,
    ...(face.bold === undefined ? {} : { bold: face.bold }),
    ...(face.italics === undefined ? {} : { italics: face.italics }),
    ...(face.characterSpacing === undefined
      ? {}
      : { characterSpacing: face.characterSpacing }),
    ...(face.allCaps === undefined ? {} : { allCaps: face.allCaps }),
  });
}

/**
 * `**bold**`, the only inline markup the authoring format has.
 *
 * The emphasised span is not merely bold: the stylesheet gives `strong` the deep
 * brand colour as well, so it is a different face rather than a modifier.
 */
export function runs(text: string, face: Face, strong: Face): readonly TextRun[] {
  const out: TextRun[] = [];
  const pattern = /\*\*(.+?)\*\*/g;
  let cursor = 0;
  for (let m = pattern.exec(text); m !== null; m = pattern.exec(text)) {
    const inner = m[1];
    if (inner === undefined) continue;
    if (m.index > cursor) out.push(run(text.slice(cursor, m.index), face));
    out.push(run(inner, strong));
    cursor = m.index + m[0].length;
  }
  if (cursor < text.length) out.push(run(text.slice(cursor), face));
  return out.length > 0 ? out : [run("", face)];
}

/**
 * Vertical space after a table.
 *
 * A Word table has no bottom margin, so the gap the stylesheet writes as
 * `margin-bottom` has to be a paragraph. Its line is forced to one twip so the
 * paragraph itself contributes no height and only its `after` spacing shows.
 */
function spacer(after: number, keepNext = false): Paragraph {
  return new Paragraph({
    spacing: { after, line: 1, lineRule: LineRuleType.EXACTLY },
    ...(keepNext ? { keepNext: true } : {}),
  });
}

const CLEAR = ShadingType.CLEAR;
const NO_BORDER = { style: BorderStyle.NONE, size: 0, color: "auto" } as const;

/**
 * A block-level box with real padding: one cell, which is how Word pads a fill.
 *
 * The row cannot split. Every box this builds — an opener, a subsection heading,
 * a callout — carries `break-inside: avoid` in the stylesheet, and a filled box
 * broken across two sheets shows the fill ending mid-air.
 */
function box(opts: {
  readonly children: readonly Paragraph[];
  readonly widthPt: number;
  readonly fill?: string;
  readonly leftRule?: { readonly widthPt: string; readonly color: string };
  readonly pad: { readonly top: number; readonly right: number; readonly bottom: number; readonly left: number };
}): Table {
  return new Table({
    width: { size: twips(`${opts.widthPt}pt`), type: WidthType.DXA },
    columnWidths: [twips(`${opts.widthPt}pt`)],
    borders: {
      top: NO_BORDER,
      bottom: NO_BORDER,
      left:
        opts.leftRule === undefined
          ? NO_BORDER
          : {
              style: BorderStyle.SINGLE,
              size: eighths(opts.leftRule.widthPt),
              color: opts.leftRule.color,
            },
      right: NO_BORDER,
      insideHorizontal: NO_BORDER,
      insideVertical: NO_BORDER,
    },
    rows: [
      new TableRow({
        cantSplit: true,
        children: [
          new TableCell({
            children: [...opts.children],
            ...(opts.fill === undefined
              ? {}
              : { shading: { type: CLEAR, fill: opts.fill, color: "auto" } }),
            margins: {
              top: twips(`${opts.pad.top}pt`),
              bottom: twips(`${opts.pad.bottom}pt`),
              left: twips(`${opts.pad.left}pt`),
              right: twips(`${opts.pad.right}pt`),
            },
          }),
        ],
      }),
    ],
  });
}

/** The image a node declares, or `undefined` when it declares none. */
function assetFor(id: NodeId, ctx: Ctx): DocxAsset | undefined {
  const slot = ctx.slots.get(id);
  if (slot === undefined) return undefined;
  return ctx.assets(slot);
}

function imageParagraph(
  asset: DocxAsset,
  size: Box,
  spacingAfter: number,
  keepNext = false,
): Paragraph {
  return new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { after: spacingAfter, line: 240, lineRule: LineRuleType.AUTO },
    ...(keepNext ? { keepNext: true } : {}),
    children: [
      new ImageRun({
        data: asset.data,
        type: asset.type,
        transformation: { width: size.width, height: size.height },
      }),
    ],
  });
}

/**
 * A numbered, captioned figure — the manual's one image convention outside a
 * table, so a step's screenshot and a standalone illustration both arrive here.
 *
 * `containerPt` is the column the image sits in: the text column normally, the
 * narrower figure column when a block asked for its text and image side by side.
 */
/**
 * How tall a figure's IMAGE may be: the page's text block, less what the
 * caption under it needs.
 *
 * The caption is reserved for rather than measured, because measuring it means
 * knowing where Word will break the line. Two lines is the allowance — most
 * captions are one, a long one wraps to two — plus the space above and below.
 *
 * Reserving it is the difference between a figure that fits and a figure whose
 * caption is pushed alone onto the next page. `imageParagraph` keeps the two
 * together (`break-inside: avoid`), so a picture that fills the page exactly
 * would send BOTH to the next one and leave the current page blank.
 */
function figureRoomPt(ctx: Ctx): number {
  // A face's `size` is in half-points and docx spacing is in twentieths.
  const captionLinePt = (ctx.f.figCaption.size / 2) * 1.4;
  const spacingPt = (ctx.m.spaceXs + ctx.m.spaceMd) / 20;
  return ctx.l.contentHeightPt - captionLinePt * 2 - spacingPt;
}

function figure(
  id: NodeId,
  caption: string,
  ctx: Ctx,
  containerPt: number,
  widthPercent: number | undefined,
): readonly Paragraph[] {
  const asset = assetFor(id, ctx);
  if (asset === undefined) return [];
  const size = fitFigure(asset, containerPt, widthPercent, ctx.m.itemFigureCap, figureRoomPt(ctx));
  const n = ctx.figures.get(id);
  const label = n === undefined ? "" : `Figura ${n}. `;
  return [
    // `figure { break-inside: avoid }` — the caption must never orphan from the
    // image it names.
    imageParagraph(asset, size, ctx.m.spaceXs, true),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: ctx.m.spaceMd },
      children: [run(`${label}${caption}`, ctx.f.figCaption)],
    }),
  ];
}

/**
 * Text and its figure, arranged as the item asked for.
 *
 * `beside` is a two-column borderless table, matching the flex row the
 * stylesheet builds: the figure column is a fixed fraction of the text column
 * and the gap is carried as the figure cell's left margin, so the two columns
 * still add up to the full width.
 */
function pair(
  text: readonly Paragraph[],
  figureOf: (containerPt: number) => readonly Paragraph[],
  layout: unknown,
  ctx: Ctx,
): readonly (Paragraph | Table)[] {
  const full = figureOf(ctx.l.contentWidthPt);
  if (layout !== "beside" || full.length === 0) return [...text, ...full];

  const gapPt = ctx.m.spaceMd / 20;
  const figurePt = ctx.l.contentWidthPt * ctx.m.pairFigureFraction;
  const textPt = ctx.l.contentWidthPt - gapPt - figurePt;
  const cell = (children: readonly (Paragraph | Table)[], widthPt: number, leftPad: number): TableCell =>
    new TableCell({
      children: [...children],
      width: { size: twips(`${widthPt}pt`), type: WidthType.DXA },
      verticalAlign: VerticalAlign.TOP,
      margins: { top: 0, bottom: 0, left: twips(`${leftPad}pt`), right: 0 },
    });

  return [
    new Table({
      width: { size: twips(`${ctx.l.contentWidthPt}pt`), type: WidthType.DXA },
      columnWidths: [twips(`${textPt}pt`), twips(`${figurePt + gapPt}pt`)],
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
          children: [
            cell(text, textPt, 0),
            cell(figureOf(figurePt), figurePt + gapPt, gapPt),
          ],
        }),
      ],
    }),
    spacer(0),
  ];
}

const prose = (text: string, ctx: Ctx, after = ctx.m.spaceMd): Paragraph =>
  new Paragraph({
    alignment: ctx.t.prose.align === "justify" ? AlignmentType.JUSTIFIED : AlignmentType.START,
    spacing: { after, line: ctx.m.proseLine, lineRule: LineRuleType.AUTO },
    children: [...runs(text, ctx.f.prose, ctx.f.strong)],
  });

function calloutBlock(node: BlockNode, ctx: Ctx): readonly (Paragraph | Table)[] {
  const variant = String(node.props["variant"] ?? "info");
  const important = variant === "important";
  const text = String(node.props["text"]);
  const label = important ? [run("IMPORTANTE: ", ctx.f.calloutLabel)] : [];
  return [
    box({
      widthPt: ctx.l.contentWidthPt,
      fill: important ? ctx.p.calloutImportantFill : ctx.p.calloutInfoFill,
      leftRule: {
        widthPt: `${ctx.m.calloutRulePt}pt`,
        color: important ? ctx.p.calloutImportantRule : ctx.p.calloutInfoRule,
      },
      pad: ctx.m.calloutPad,
      children: [
        new Paragraph({
          spacing: { after: 0, line: ctx.m.proseLine, lineRule: LineRuleType.AUTO },
          children: [...label, ...runs(text, ctx.f.callout, ctx.f.strong)],
        }),
      ],
    }),
    spacer(ctx.m.spaceMd),
  ];
}

function fieldList(node: BlockNode, ctx: Ctx): readonly (Paragraph | Table)[] {
  const items = node.props["items"] as ReadonlyArray<Record<string, unknown>>;
  return items.flatMap((item) => {
    const label = String(item["label"]);
    const id = String(item["id"]);
    const width = typeof item["widthPercent"] === "number" ? item["widthPercent"] : undefined;
    return [
      new Paragraph({
        spacing: { after: twips("2pt"), before: 0 },
        keepNext: true,
        children: [run(label, ctx.f.fieldLabel)],
      }),
      ...pair(
        [prose(String(item["text"]), ctx)],
        (containerPt) => figure(id, label, ctx, containerPt, width),
        item["layout"],
        ctx,
      ),
    ];
  });
}

function termList(node: BlockNode, ctx: Ctx): readonly (Paragraph | Table)[] {
  const entries = node.props["entries"] as ReadonlyArray<Record<string, unknown>>;
  return entries.flatMap((entry) => {
    const term = String(entry["term"]);
    const id = String(entry["id"]);
    return [
      // A `dt` then an indented `dd`: the browser default the PDF is set with.
      // The stylesheet's `.term__word` rule is never emitted by the HTML
      // renderer, so the term is NOT bold in the delivered document.
      new Paragraph({
        spacing: { after: 0 },
        keepNext: true,
        children: [run(`${term}:`, ctx.f.termWord)],
      }),
      new Paragraph({
        spacing: { after: ctx.m.spaceSm, line: ctx.m.proseLine, lineRule: LineRuleType.AUTO },
        indent: { left: ctx.m.termIndent },
        children: [...runs(String(entry["definition"]), ctx.f.termDefinition, ctx.f.strong)],
      }),
      ...figure(id, term, ctx, ctx.l.contentWidthPt, undefined),
    ];
  });
}

function procedure(node: BlockNode, ctx: Ctx): readonly (Paragraph | Table)[] {
  const steps = node.props["steps"] as ReadonlyArray<Record<string, unknown>>;
  const lead = node.props["lead"] === undefined ? [] : [prose(String(node.props["lead"]), ctx)];

  const body = steps.flatMap((step) => {
    const id = String(step["id"]);
    const title = String(step["title"]);
    const n = ctx.numbers.get(id) ?? "";
    const width = typeof step["widthPercent"] === "number" ? step["widthPercent"] : undefined;

    // The marker and the title share one line, as they do in the HTML.
    const heading = new Paragraph({
      spacing: { before: twips("1pt"), after: twips("3pt") },
      keepNext: true,
      children: [run(`Paso ${n}: `, ctx.f.stepMarker), run(title, ctx.f.stepTitle)],
    });

    // The action list is numbered here rather than through a Word numbering
    // definition. The ordinal is presentational — it comes from the list's own
    // order, not from `numbers` — and a document with two hundred procedures in
    // it is one where Word deciding on its own whether a list continues or
    // restarts is a real risk. Fixed text cannot restart wrongly.
    const actions = Array.isArray(step["actions"])
      ? (step["actions"] as readonly string[]).map(
          (action, i) =>
            new Paragraph({
              spacing: {
                after: i === (step["actions"] as readonly string[]).length - 1 ? ctx.m.spaceXs : 0,
                line: ctx.m.proseLine,
                lineRule: LineRuleType.AUTO,
              },
              indent: { left: ctx.m.termIndent, hanging: twips("12pt") },
              children: [
                run(`${i + 1}. `, ctx.f.prose),
                ...runs(action, ctx.f.prose, ctx.f.strong),
              ],
            }),
        )
      : [];

    return [
      heading,
      ...pair(
        [prose(String(step["text"]), ctx, actions.length > 0 ? ctx.m.spaceXs : ctx.m.spaceMd), ...actions],
        (containerPt) => figure(id, title, ctx, containerPt, width),
        step["layout"],
        ctx,
      ),
    ];
  });

  return [...lead, ...body];
}

/**
 * `icon-table` and `data-table`, through one function — as in `render-web`,
 * where what differs is an icon column, the header colour and the zebra fill.
 *
 * Column widths are FIXED here, unlike the browser's content-driven auto layout.
 * Word's own autofit is not the browser's algorithm either, so neither choice
 * reproduces it exactly; a declared width at least renders the same on every
 * machine that opens the file, which is what a deliverable needs.
 */
function table(node: BlockNode, ctx: Ctx): readonly (Paragraph | Table)[] {
  const rows = node.props["rows"] as ReadonlyArray<Record<string, unknown>>;
  const withIcons = node.type === "icon-table";
  const labelHeader = String(node.props["labelHeader"]);
  const declaredDescription = node.props["descriptionHeader"];
  const described = (r: Record<string, unknown>): string =>
    typeof r["description"] === "string" ? r["description"] : "";

  // The browser creates the third column if ANY row supplies that cell, even
  // where no header declares it. Word needs every row to carry the same number
  // of cells, so the column is decided once and short rows get an empty cell.
  const hasDescription =
    declaredDescription !== undefined || rows.some((r) => described(r) !== "");

  const iconPt = withIcons ? ctx.m.iconColumnPt : 0;
  const rest = ctx.l.contentWidthPt - iconPt;
  const labelPt = hasDescription ? rest * 0.32 : rest;
  const descriptionPt = hasDescription ? rest - labelPt : 0;

  const widths = [
    ...(withIcons ? [iconPt] : []),
    labelPt,
    ...(hasDescription ? [descriptionPt] : []),
  ];

  const headFill = withIcons ? ctx.p.tableHeadFill : ctx.p.dataTableHeadFill;
  const altFill = withIcons ? ctx.p.tableAltFill : ctx.p.dataTableAltFill;

  const cellMargins = {
    top: ctx.m.cellPad.vertical,
    bottom: ctx.m.cellPad.vertical,
    left: ctx.m.cellPad.horizontal,
    right: ctx.m.cellPad.horizontal,
  };

  const headCell = (text: string, widthPt: number): TableCell =>
    new TableCell({
      width: { size: twips(`${widthPt}pt`), type: WidthType.DXA },
      shading: { type: CLEAR, fill: headFill, color: "auto" },
      margins: cellMargins,
      children: [
        new Paragraph({ spacing: { after: 0 }, children: [run(text, ctx.f.tableHead)] }),
      ],
    });

  const bodyCell = (
    children: readonly Paragraph[],
    widthPt: number,
    fill: string | undefined,
  ): TableCell =>
    new TableCell({
      width: { size: twips(`${widthPt}pt`), type: WidthType.DXA },
      ...(fill === undefined ? {} : { shading: { type: CLEAR, fill, color: "auto" } }),
      margins: cellMargins,
      verticalAlign: VerticalAlign.TOP,
      borders: {
        top: NO_BORDER,
        left: NO_BORDER,
        right: NO_BORDER,
        bottom: { style: BorderStyle.SINGLE, size: eighths("0.5pt"), color: ctx.p.tableRule },
      },
      children: [...children],
    });

  const header = new TableRow({
    tableHeader: true,
    children: [
      ...(withIcons ? [headCell("", iconPt)] : []),
      headCell(labelHeader, labelPt),
      ...(hasDescription
        ? [headCell(declaredDescription === undefined ? "" : String(declaredDescription), descriptionPt)]
        : []),
    ],
  });

  const body = rows.map((r, i) => {
    // `tr:nth-child(even)` counts within the body, so the first row is plain.
    const fill = (i + 1) % 2 === 0 ? altFill : undefined;
    const iconCells = withIcons ? [bodyCell(icon(String(r["id"]), ctx), iconPt, fill)] : [];
    return new TableRow({
      children: [
        ...iconCells,
        bodyCell(
          [new Paragraph({ spacing: { after: 0 }, children: [run(String(r["label"]), ctx.f.tableLabel)] })],
          labelPt,
          fill,
        ),
        ...(hasDescription
          ? [
              bodyCell(
                [
                  new Paragraph({
                    spacing: { after: 0, line: ctx.m.proseLine, lineRule: LineRuleType.AUTO },
                    children: [...runs(described(r), ctx.f.tableCell, ctx.f.strong)],
                  }),
                ],
                descriptionPt,
                fill,
              ),
            ]
          : []),
      ],
    });
  });

  return [
    new Table({
      width: { size: twips(`${ctx.l.contentWidthPt}pt`), type: WidthType.DXA },
      columnWidths: widths.map((w) => twips(`${w}pt`)),
      rows: [header, ...body],
    }),
    spacer(ctx.m.spaceMd),
  ];
}

/**
 * The manual's delivery history, as a three-column table.
 *
 * Column widths are fixed like `table`'s, and for a sharper reason here: the
 * two value columns hold short strings, so Word's autofit would collapse them
 * to the width of their longest entry and the layout would change the first
 * time a version number grows a digit.
 *
 * Zebra, head fill and rule all come from the data-table palette, the same
 * borrowing render-web does — one delivery history should not look like a
 * different species of table than the reference tables above it.
 */
function changeLog(node: BlockNode, ctx: Ctx): readonly (Paragraph | Table)[] {
  const rows = node.props["rows"] as ReadonlyArray<Record<string, unknown>>;

  const versionPt = 62;
  const datePt = 72;
  const descriptionPt = ctx.l.contentWidthPt - versionPt - datePt;
  const widths = [versionPt, datePt, descriptionPt];

  const cellMargins = {
    top: ctx.m.cellPad.vertical,
    bottom: ctx.m.cellPad.vertical,
    left: ctx.m.cellPad.horizontal,
    right: ctx.m.cellPad.horizontal,
  };

  const headCell = (text: string, widthPt: number): TableCell =>
    new TableCell({
      width: { size: twips(`${widthPt}pt`), type: WidthType.DXA },
      shading: { type: CLEAR, fill: ctx.p.dataTableHeadFill, color: "auto" },
      margins: cellMargins,
      children: [
        new Paragraph({ spacing: { after: 0 }, children: [run(text, ctx.f.tableHead)] }),
      ],
    });

  const bodyCell = (
    children: readonly Paragraph[],
    widthPt: number,
    fill: string | undefined,
  ): TableCell =>
    new TableCell({
      width: { size: twips(`${widthPt}pt`), type: WidthType.DXA },
      ...(fill === undefined ? {} : { shading: { type: CLEAR, fill, color: "auto" } }),
      margins: cellMargins,
      verticalAlign: VerticalAlign.TOP,
      borders: {
        top: NO_BORDER,
        left: NO_BORDER,
        right: NO_BORDER,
        bottom: { style: BorderStyle.SINGLE, size: eighths("0.5pt"), color: ctx.p.tableRule },
      },
      children: [...children],
    });

  const header = new TableRow({
    tableHeader: true,
    children: [
      headCell(String(node.props["versionHeader"]), versionPt),
      headCell(String(node.props["dateHeader"]), datePt),
      headCell(String(node.props["descriptionHeader"]), descriptionPt),
    ],
  });

  const body = rows.map((r, i) => {
    // Matches `tr:nth-child(even)` counting within the body, as `table` does.
    const fill = (i + 1) % 2 === 0 ? ctx.p.dataTableAltFill : undefined;
    const line = (text: string, font: Parameters<typeof run>[1]): readonly Paragraph[] => [
      new Paragraph({ spacing: { after: 0 }, children: [run(text, font)] }),
    ];
    return new TableRow({
      children: [
        bodyCell(line(String(r["version"]), ctx.f.tableLabel), versionPt, fill),
        bodyCell(line(formatChangeLogDate(String(r["date"])), ctx.f.tableCell), datePt, fill),
        bodyCell(
          [
            new Paragraph({
              spacing: { after: 0, line: ctx.m.proseLine, lineRule: LineRuleType.AUTO },
              children: [...runs(String(r["description"]), ctx.f.tableCell, ctx.f.strong)],
            }),
          ],
          descriptionPt,
          fill,
        ),
      ],
    });
  });

  return [
    new Table({
      width: { size: twips(`${ctx.l.contentWidthPt}pt`), type: WidthType.DXA },
      columnWidths: widths.map((w) => twips(`${w}pt`)),
      rows: [header, ...body],
    }),
    spacer(ctx.m.spaceMd),
  ];
}

/** The icon cell's image, capped by the stylesheet at 26pt — 24pt while pending. */
function icon(id: NodeId, ctx: Ctx): readonly Paragraph[] {
  const asset = assetFor(id, ctx);
  if (asset === undefined) return [new Paragraph({ spacing: { after: 0 } })];
  const cap = asset.pending ? ctx.m.iconPendingMaxPt : ctx.m.iconMaxPt;
  const size = fitIcon(asset, cap);
  return [
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 0 },
      children: [
        new ImageRun({
          data: asset.data,
          type: asset.type,
          transformation: { width: size.width, height: size.height },
        }),
      ],
    }),
  ];
}

export function renderBlock(node: BlockNode, ctx: Ctx): readonly (Paragraph | Table)[] {
  switch (node.type) {
    case "prose":
      return [prose(String(node.props["text"]), ctx)];

    case "callout":
      return calloutBlock(node, ctx);

    case "detail-header":
      return [
        new Paragraph({
          spacing: { before: ctx.m.spaceMd, after: ctx.m.spaceXs },
          keepNext: true,
          children: [run(String(node.props["text"]), ctx.f.detailHeader)],
        }),
      ];

    case "field-list":
      return fieldList(node, ctx);

    case "term-list":
      return termList(node, ctx);

    case "procedure":
      return procedure(node, ctx);

    case "figure":
      return figure(
        node.id,
        String(node.props["caption"]),
        ctx,
        ctx.l.contentWidthPt,
        typeof node.props["widthPercent"] === "number" ? node.props["widthPercent"] : 100,
      );

    case "icon-table":
    case "data-table":
      return table(node, ctx);

    // Its own builder, matching render-web's split and for the same reason:
    // `table` already carries two types through a set of booleans, and the
    // change log's three columns mean something else entirely.
    case "change-log":
      return changeLog(node, ctx);

    default:
      // A block type with no renderer is a broken block, not a silent skip —
      // the same contract `render-web` holds, so the two cannot drift quietly.
      throw new Error(
        `render-docx has no renderer for block type "${node.type}" (node ${node.id})`,
      );
  }
}

const plain = (inline: SectionNode["title"]): string =>
  inline.map((i) => ("value" in i ? i.value : "")).join("");

/**
 * A top-level section opener: the pier.
 *
 * A filled box with the kicker, the title and the subtitle, and the ordinal set
 * large and ghosted behind it.
 *
 * The ghost rides on the KICKER's line, tabbed to the right edge, with that
 * line's height pinned so a 76pt glyph cannot push the box taller. It was first
 * tried as an absolutely framed paragraph, which is what the CSS does — and a
 * `framePr` inside a table cell turns the CELL into the frame: the pier came out
 * 120pt wide, floating over the body text with the prose wrapping around it. The
 * ornament is worth a tab stop, never the opener.
 *
 * The title keeps a real heading style even though it lives inside a table,
 * because that is what the table of contents and Word's navigation pane read.
 * An opener rendered as a picture would look perfect and leave the document with
 * no outline at all.
 */
function opener(node: SectionNode, n: string, ctx: Ctx): readonly (Paragraph | Table)[] {
  const kicker = ctx.t.sectionHeader.kicker;
  const children: Paragraph[] = [];
  const inner = ctx.l.contentWidthPt - ctx.m.openerPad.left - ctx.m.openerPad.right;

  if (kicker !== "" || n !== "") {
    children.push(
      new Paragraph({
        spacing: { after: twips("5pt"), line: twips(ctx.t.space.md), lineRule: LineRuleType.EXACTLY },
        tabStops: [{ type: TabStopType.RIGHT, position: twips(`${inner}pt`) }],
        keepNext: true,
        children: [
          ...(kicker === "" ? [] : [run(kicker, ctx.f.sectionKicker)]),
          ...(n === "" ? [] : [run("\t", ctx.f.sectionKicker), run(n, ctx.f.sectionGhost)]),
        ],
      }),
    );
  }
  children.push(
    new Paragraph({
      heading: "Heading1",
      spacing: { before: 0, after: 0 },
      keepNext: true,
      children: [run(`${n}. ${plain(node.title)}`, ctx.f.sectionTitle)],
    }),
  );
  if (node.subtitle !== undefined) {
    children.push(
      new Paragraph({
        spacing: { before: twips("4pt"), after: 0 },
        keepNext: true,
        children: [run(plain(node.subtitle), ctx.f.sectionSubtitle)],
      }),
    );
  }

  return [
    box({
      widthPt: ctx.l.contentWidthPt,
      fill: ctx.p.ground,
      pad: ctx.m.openerPad,
      children,
    }),
    // `.section-header { break-after: avoid }` — a pier stranded at the foot of a
    // sheet with its section starting on the next one reads as the end of
    // something rather than the start of it.
    spacer(ctx.m.spaceLg, true),
  ];
}

export function renderSection(
  node: SectionNode,
  depth: number,
  ctx: Ctx,
): readonly (Paragraph | Table)[] {
  const n = ctx.numbers.get(node.id) ?? "";
  const children = node.children.flatMap((c) => renderNode(c, depth + 1, ctx));

  if (depth === 0) return [...opener(node, n, ctx), ...children];

  if (depth === 1) {
    return [
      box({
        widthPt: ctx.l.contentWidthPt,
        fill: ctx.p.subsectionFill,
        leftRule: { widthPt: "2.5pt", color: ctx.p.subsectionRule },
        pad: ctx.m.subsectionPad,
        children: [
          new Paragraph({
            heading: "Heading2",
            spacing: { before: 0, after: 0 },
            keepNext: true,
            children: [run(`${n}. ${plain(node.title)}`, ctx.f.subsectionTitle)],
          }),
        ],
      }),
      // `.subsection-header { break-after: avoid }`.
      spacer(ctx.m.spaceSm, true),
      ...children,
    ];
  }

  // Deeper divisions are detail blocks: subordinate, unnumbered in the design.
  return [
    new Paragraph({
      spacing: { before: ctx.m.spaceMd, after: ctx.m.spaceXs },
      keepNext: true,
      children: [run(plain(node.title), ctx.f.detailHeader)],
    }),
    ...children,
  ];
}

export function renderNode(
  node: ManualNode,
  depth: number,
  ctx: Ctx,
): readonly (Paragraph | Table)[] {
  return node.kind === "section"
    ? renderSection(node, depth, ctx)
    : renderBlock(node, ctx);
}
