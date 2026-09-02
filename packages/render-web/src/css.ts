import type { Tokens } from "@manualforge/tokens";

/**
 * Escape a value for use inside a CSS string literal (e.g. a `content`
 * value), and neutralise a literal `</style>` sequence.
 *
 * This stylesheet is embedded verbatim inside a literal `<style>` element in
 * `html.ts`. `<style>` is a "raw text" element: the HTML parser closes it at
 * the first `</style` sequence it sees, character-for-character, regardless
 * of CSS quoting. A backslash between `<` and `/` breaks that sequence
 * without changing what a CSS parser renders — `\/` inside a CSS string is
 * an escaped `/`.
 */
function escapeCssString(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/"/g, '\\"')
    .replace(/<\/(style)/gi, "<\\/$1");
}

/**
 * Stylesheet for the paginated target.
 *
 * Every value comes from `tokens`. A literal colour or size in here is a bug —
 * the design system must be swappable without touching this file.
 */
export function stylesheet(t: Tokens, header: string): string {
  const gutter = `calc(${t.page.marginX} - 12pt)`;
  const safeHeader = escapeCssString(header);
  return `
@page {
  size: ${t.page.size};
  margin: ${t.page.marginTop} ${t.page.marginX} ${t.page.marginBottom};

  @top-left-corner { content: ""; background: ${t.runningHeader.accent}; }
  @top-left {
    content: "${safeHeader}";
    color: ${t.runningHeader.textColor};
    font: ${t.runningHeader.textSize} ${t.font.sans};
    vertical-align: middle;
    padding-left: 10pt;
    white-space: pre;
  }
  @top-right {
    content: "VENDOR";
    color: ${t.runningHeader.textColor};
    font: ${t.runningHeader.textSize} ${t.font.sans};
    letter-spacing: 1.4pt;
    vertical-align: middle;
    text-align: right;
    white-space: pre;
    padding-right: 10pt;
  }
  @top-right-corner { content: ""; }

  @bottom-left {
    content: "© 2026 Vendor — Confidencial — Uso Interno";
    color: ${t.runningFooter.textColor};
    font: ${t.runningFooter.textSize} ${t.font.sans};
    border-top: 0.6pt solid ${t.runningFooter.rule};
    padding-top: 5pt;
    vertical-align: top;
  }
  @bottom-right {
    content: "Página " counter(page);
    color: ${t.runningFooter.pageNumberColor};
    font: bold ${t.runningFooter.pageNumberSize} ${t.font.sans};
    border-top: 0.6pt solid ${t.runningFooter.rule};
    padding-top: 5pt;
    vertical-align: top;
    text-align: right;
  }
}

/* The cover is full-bleed and carries no running furniture. */
@page cover {
  margin: 0;
  @top-left-corner { content: none; }
  @top-left { content: none; }
  @top-center { content: none; }
  @top-right { content: none; }
  @top-right-corner { content: none; }
  @bottom-left { content: none; }
  @bottom-right { content: none; }
}

/*
 * Running header bar.
 *
 * The bar is painted on the polyfill's margin ROW, not on the individual
 * margin boxes. A margin box with no content is never generated, so
 * backgrounding each box leaves gaps wherever a box happens to be empty.
 * These class names are the polyfill's contract — the one place this
 * stylesheet knows which pagination engine is in use.
 */
.pagedjs_margin-top,
.pagedjs_margin-top-right-corner-holder { background: ${t.runningHeader.background}; }
.pagedjs_margin-top-left-corner-holder { background: ${t.runningHeader.accent}; }
.pagedjs_cover_page .pagedjs_margin-top,
.pagedjs_cover_page .pagedjs_margin-top-right-corner-holder,
.pagedjs_cover_page .pagedjs_margin-top-left-corner-holder { background: none; }

/*
 * Keep the first thing on a page off the running header bar.
 *
 * A margin cannot do this. The bar's height IS the page's top margin, because
 * the paginator paints it on the margin row — so a bigger margin is a taller
 * bar and the gap stays exactly zero. Nor can it be a margin on the content:
 * the first block of a fragmented page has its top margin dropped, which is
 * correct behaviour and precisely why a section header or a table would land
 * flush against the bar. Two dark blocks touching read as one, and the table
 * looked like part of the header.
 *
 * So it is padding on the paginator's own per-page flow box, which every page
 * gets and nothing can collapse. The cover is exempt: it is a full-bleed panel
 * and padding there would leave a white strip above it.
 */
.pagedjs_page_content { padding-top: ${t.page.contentTop}; }
.pagedjs_cover_page .pagedjs_page_content { padding-top: 0; }

* { box-sizing: border-box; }

body {
  margin: 0;
  font-family: ${t.font.sans};
  color: ${t.prose.color};
  background: ${t.page.background};
}

/* ---- cover ---------------------------------------------------------- */

.cover {
  page: cover;
  break-after: page;
  background: ${t.cover.background};
  color: ${t.cover.titleColor};
  height: 100%;
  padding: 120pt 56pt 40pt;
  border-left: 10pt solid ${t.cover.accent};
  display: flex;
  flex-direction: column;
  justify-content: flex-end;
}
.cover__brand {
  font-size: 46pt;
  font-weight: bold;
  letter-spacing: 2pt;
  margin: 0;
}
.cover__rule {
  height: 3pt;
  width: 300pt;
  background: ${t.cover.accent};
  margin: 10pt 0 14pt;
}
.cover__title {
  font-size: 17pt;
  color: ${t.cover.subtitleColor};
  margin: 0 0 16pt;
}
.cover__version {
  align-self: flex-start;
  background: ${t.cover.accent};
  color: ${t.cover.background};
  font-size: ${t.runningHeader.textSize};
  font-weight: bold;
  padding: 4pt 10pt;
  border-radius: 3pt;
}
.cover__lede {
  border-top: 0.6pt solid ${t.cover.metaColor};
  margin-top: 22pt;
  padding-top: 14pt;
  font-size: 12pt;
  max-width: 330pt;
  line-height: 1.5;
}
.cover__meta {
  margin-top: auto;
  padding-top: 60pt;
  color: ${t.cover.metaColor};
  font-size: ${t.runningFooter.textSize};
}

/* ---- table of contents ----------------------------------------------- */

/* Generated, never authored — see renderToc in html.ts. Two levels, matching the
   manual this replaces, with the page number resolved by the paginator through
   target-counter once the layout is final. */
.toc {
  break-after: page;
  padding-top: ${t.space.lg};
}
.toc__title {
  font-size: 24pt;
  font-weight: bold;
  color: ${t.prose.color};
  margin: 0 0 ${t.space.sm};
  padding-bottom: ${t.space.sm};
  border-bottom: 2pt solid ${t.sectionHeader.accent};
}
.toc__entry {
  display: flex;
  align-items: baseline;
  gap: ${t.space.sm};
  text-decoration: none;
  border-bottom: 0.5pt solid ${t.runningFooter.rule};
  padding: 3.5pt 0;
  break-inside: avoid;
}
.toc__entry--l1 {
  color: ${t.prose.color};
  font-size: ${t.prose.size};
  font-weight: bold;
  margin-top: ${t.space.xs};
}
.toc__entry--l2 {
  color: ${t.subsectionHeader.titleColor};
  font-size: ${t.table.cellSize};
  padding-left: ${t.space.xl};
}
/* The text takes the slack so the page number sits hard against the right edge. */
.toc__text { flex: 1 1 auto; }
/* The page the entry points at. Resolved by the paginator, which is the only
   thing that knows it: a hand-written number would be wrong for the next build,
   and wrong per deployment, since conditioning changes what lands on each page. */
.toc__entry::after {
  content: target-counter(attr(href), page);
  font-variant-numeric: tabular-nums;
  color: ${t.runningFooter.pageNumberColor};
  font-weight: bold;
}

/* ---- headings ------------------------------------------------------- */

.section-header {
  background: ${t.sectionHeader.background};
  border-left: 5pt solid ${t.sectionHeader.accent};
  padding: 10pt 14pt;
  margin: 0 0 ${t.space.lg};
  break-after: avoid;
  break-inside: avoid;
}
.section-header__title {
  color: ${t.sectionHeader.titleColor};
  font-size: ${t.sectionHeader.titleSize};
  font-weight: bold;
  text-transform: uppercase;
  margin: 0;
}
.section-header__subtitle {
  color: ${t.sectionHeader.subtitleColor};
  font-size: ${t.sectionHeader.subtitleSize};
  margin: 3pt 0 0;
}

.subsection-header {
  background: ${t.subsectionHeader.background};
  border-left: 4pt solid ${t.subsectionHeader.accent};
  padding: 6pt 12pt;
  margin: ${t.space.lg} 0 ${t.space.md};
  color: ${t.subsectionHeader.titleColor};
  font-size: ${t.subsectionHeader.titleSize};
  font-weight: bold;
  break-after: avoid;
  break-inside: avoid;
}

.detail-header {
  color: ${t.detailHeader.color};
  font-size: ${t.detailHeader.size};
  font-weight: bold;
  margin: ${t.space.md} 0 ${t.space.sm};
  break-after: avoid;
}

/* ---- blocks --------------------------------------------------------- */

p.prose {
  font-size: ${t.prose.size};
  line-height: ${t.prose.lineHeight};
  text-align: ${t.prose.align};
  margin: 0 0 ${t.space.md};
  orphans: 2;
  widows: 2;
}

figure {
  margin: ${t.space.lg} 0;
  text-align: center;
  break-inside: avoid;
}
/* No border. A screenshot carries its own frame — a window chrome, a panel edge,
   a grey field — and the manual this replaces sets its figures directly on the
   page. A rule around them added a second, competing edge. */
figure img {
  max-width: 100%;
}
/* An item's image — a step's control, an element's screenshot — has no
   widthPercent to declare, so it is capped here. A figure BLOCK sets its own
   width inline and must not be capped by this, which is why the class exists
   rather than a blanket rule on every figure.

   (No backticks anywhere in this file: the whole stylesheet is one JS template
   literal, and a backtick in a comment ends it.) */
figure.figure--item img { max-width: 70%; }

figcaption {
  margin-top: ${t.space.sm};
  color: ${t.figure.captionColor};
  font-size: ${t.figure.captionSize};
  font-style: ${t.figure.captionStyle};
}

/* One table implementation, two variants — see renderTable in html.ts. */
table.tbl {
  width: 100%;
  border-collapse: collapse;
  margin: ${t.space.md} 0 ${t.space.lg};
  font-size: ${t.table.cellSize};
}
table.tbl thead th {
  font-size: ${t.table.headSize};
  text-align: left;
  padding: 6pt 8pt;
}
table.tbl--icon-table thead th {
  background: ${t.table.headBackground};
  color: ${t.table.headColor};
}
table.tbl--data-table thead th {
  background: ${t.dataTable.headBackground};
  color: ${t.dataTable.headColor};
}
table.tbl tbody tr { break-inside: avoid; }
table.tbl--icon-table tbody tr:nth-child(even) { background: ${t.table.rowAltBackground}; }
table.tbl--data-table tbody tr:nth-child(even) { background: ${t.dataTable.rowAltBackground}; }
table.tbl td {
  padding: 5pt 8pt;
  border-bottom: 0.5pt solid ${t.table.rule};
  color: ${t.table.cellColor};
  vertical-align: middle;
}
td.tbl__icon {
  width: 34pt;
  text-align: center;
  background: ${t.sectionHeader.background};
}
td.tbl__icon img { max-width: 20pt; max-height: 20pt; }
td.tbl__label {
  width: 130pt;
  color: ${t.table.labelColor};
  font-weight: bold;
}
table.tbl--data-table td.tbl__label { color: ${t.dataTable.labelColor}; }

/*
 * The change log borrows the data table's palette rather than declaring its
 * own. It is a reference table like any other, and a delivery history in its
 * own colours would read as a different kind of object than it is.
 *
 * The two value columns are pinned. Left to auto layout a version cell sizes to
 * whatever string it holds, so the column moves between manuals and between
 * builds of the same manual — and this is the last table in the document, where
 * a shifting column is the last thing the reader sees.
 */
table.tbl--change-log thead th {
  background: ${t.dataTable.headBackground};
  color: ${t.dataTable.headColor};
}
table.tbl--change-log tbody tr:nth-child(even) { background: ${t.dataTable.rowAltBackground}; }
table.tbl--change-log td.tbl__version {
  width: 62pt;
  color: ${t.dataTable.labelColor};
  font-weight: bold;
  white-space: nowrap;
}
table.tbl--change-log td.tbl__date { width: 72pt; white-space: nowrap; }

.callout {
  padding: 8pt 12pt;
  margin: ${t.space.md} 0;
  font-size: ${t.callout.size};
  color: ${t.callout.color};
  break-inside: avoid;
}
.callout--info {
  background: ${t.callout.info.background};
  border-left: 3pt solid ${t.callout.info.accent};
}
.callout--important {
  background: ${t.callout.important.background};
  border-left: 3pt solid ${t.callout.important.accent};
}

/* ---- field-list ------------------------------------------------------ */

.field { break-inside: avoid; margin-bottom: ${t.space.md}; }
.field__label {
  color: ${t.fieldList.labelColor};
  font-size: ${t.fieldList.labelSize};
  font-weight: bold;
  margin: ${t.space.md} 0 ${t.space.xs};
}


/* ---- term-list ------------------------------------------------------- */

.term-list { margin: ${t.space.sm} 0 ${t.space.md} ${t.space.md}; }
.term { break-inside: avoid; margin-bottom: ${t.space.xs}; }
.term dt {
  display: inline;
  font-weight: bold;
  color: ${t.termList.termColor};
  font-size: ${t.termList.size};
}
.term dd {
  display: inline;
  margin: 0 0 0 ${t.space.xs};
  font-size: ${t.termList.size};
}

/* ---- procedure ------------------------------------------------------- */

.step { break-inside: avoid; margin-bottom: ${t.space.md}; }
.step__title {
  color: ${t.procedure.stepTitleColor};
  font-size: ${t.procedure.stepTitleSize};
  font-weight: bold;
  margin: ${t.space.md} 0 ${t.space.sm};
}
.step__marker { color: ${t.procedure.markerColor}; }
.step__actions {
  margin: 0 0 ${t.space.sm} ${t.space.lg};
  font-size: ${t.prose.size};
  line-height: ${t.prose.lineHeight};
}
.step__actions li { margin-bottom: ${t.space.xs}; }
/* ---- pending images -------------------------------------------------- */

/* Every image slot renders something: the delivered image, or the single
   placeholder holding its place. Never an empty gap — a gap reads as finished
   content and the reader cannot tell it is not.

   LAST in the stylesheet on purpose. Each block sizes its own images
   (\`.step__shot img\` at 70%, \`.field__shot img\` at 62%, a figure inline at
   whatever it declares) and those selectors are just as specific as this one,
   so only source order makes the placeholder one consistent size everywhere.
   Move this block up and the placeholders silently go back to being sized by
   whichever block they happen to sit in. */
/* Qualified with the parent element so it OUTWEIGHS the item cap above: that
   selector carries a class plus two elements, so a bare img-plus-class loses to
   it and every placeholder silently rendered at the item width instead of the
   placeholder width. Specificity first, source order second. */
figure img.shot--pending {
  max-width: 40%;
}

/* DRAFT BUILDS ONLY — the filename the capture team must save the image under.
   Never emitted for a client build; see RenderOptions.draft in html.ts.

   Monospaced because this is text to be transcribed, not read: in the body face
   lowercase L, one and uppercase i are the same shape, and a mistyped name is a
   delivery that silently matches no slot. Amber, because it must not read as
   part of the manual's own design language. */
/* inline-block, not block: it must hug the path and sit under the placeholder it
   belongs to. A full-column band under a 40%-wide image reads as unrelated to
   it, which for a filename is worse than ugly. */
.shot__name {
  display: inline-block;
  max-width: 100%;
  margin-top: ${t.space.xs};
  font-family: ${t.font.mono};
  font-size: ${t.draft.slotSize};
  color: ${t.draft.slotColor};
  background: ${t.draft.background};
  border-left: 2pt solid ${t.draft.accent};
  padding: 2pt 4pt;
  /* The DIRECTORY may break anywhere; it is context, not text to transcribe. */
  word-break: break-all;
}
/* The filename may not break at all. It broke between "...seleccionar." and
   "png", which reads as a name ending in a dot — and this text exists to be
   copied character for character. Every slot name is far shorter than the
   column, so forbidding the break cannot overflow it. */
.shot__file {
  white-space: nowrap;
  word-break: normal;
}
/* Inside a table cell, its own line: someone works down a table row by row, and
   a name trailing the end of a description sentence is one they can skip. */
table.tbl .shot__name { display: block; margin-top: ${t.space.xs}; }
/* A pending icon gets a little more room than a delivered one: at 20pt only
   its frame is legible, and the row's label already names the control. */
td.tbl__icon--pending img { max-width: 24pt; max-height: 24pt; opacity: 0.75; }

/* ---- side-by-side text and figure -------------------------------------- */

/* For a short explanation whose figure, stacked underneath, would leave a band
   of empty page beside two lines of prose. Declared per item — see the layout
   prop on a procedure step and a field-list item.

   Kept together on one page: the pair is one unit of meaning, and a step whose
   image landed on the next page would be worse than the stacked version. */
.pair {
  display: flex;
  align-items: flex-start;
  gap: ${t.space.md};
  break-inside: avoid;
}
.pair__text { flex: 1 1 0; min-width: 0; }
.pair__figure { flex: 0 0 42%; }
/* The figure now sizes against ITS COLUMN, not the text column, so the caps that
   keep a stacked image from dominating the page have to be lifted here.
   Both selectors carry two classes and two elements, which outweighs the
   item-cap and pending-cap rules above — those win on specificity, not on source
   order, so matching their weight is the only thing that works. */
.pair__figure figure { margin: 0; }
.pair__figure figure img { max-width: 100%; }
.pair__figure figure img.shot--pending { max-width: 100%; }

.content { padding-right: ${gutter}; }
`;
}
