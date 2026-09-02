import type { Tokens } from "@manualforge/tokens";

/**
 * Beacon's stylesheet. Its OWN, not a parameterisation of Atlas's.
 *
 * The first attempt made one stylesheet configurable and let both brands share
 * it. That was wrong twice over: Beacon silently inherited every Atlas
 * decision nobody thought to override, and Atlas — a document already
 * delivered — became something a Beacon change could break.
 *
 * So the two are separate files. They will duplicate some rules. That is the
 * price of letting one brand's design move without putting the other at risk,
 * and it is the right trade for a document that is already out.
 *
 * Written from the approved proposal, whose distinctive parts are: hairline
 * verticals and a soft glow on the cover, a logo lockup, the brand word carried
 * in the accent inside the running header, section openers as piers with a
 * ghosted number, and a display face doing all the headings.
 *
 * NOTE: this file is ONE template literal. A backtick anywhere in it — including
 * inside a CSS comment — is a TypeScript syntax error.
 */
function escapeCssString(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/"/g, '\\"')
    .replace(/<\/(style)/gi, "<\\/$1");
}

export function beaconStylesheet(t: Tokens, header: string): string {
  // The brand is set apart so it can carry the accent colour and the display
  // weight the proposal gives it. The CLI composes the header as
  // "BRAND  |  Title  |  vX", so the first separator is the split point; a
  // header without one simply has no brand segment and renders whole.
  const cut = header.indexOf("|");
  const safeBrand = escapeCssString(cut === -1 ? "" : header.slice(0, cut).trim());
  const safeRest = escapeCssString(cut === -1 ? header : header.slice(cut + 1).trim());
  return `
@page {
  size: ${t.page.size};
  margin: ${t.page.marginTop} ${t.page.marginX} ${t.page.marginBottom};

  /* Widened so the brand sits at the page edge rather than drifting inward:
     the corner box is the only thing left of @top-left. */
  @top-left-corner { content: ""; background: ${t.cover.background}; }
  /* The brand line lives in the LEFT box so it is flush left, and never wraps:
     a narrow box made it break across two lines. VENDOR keeps its own box on
     the right. */
  @top-left { content: element(rh); }
  @top-center { content: ""; }
  @top-right {
    content: "VENDOR";
    color: ${t.runningHeader.textColor};
    font: ${t.runningHeader.textSize} ${t.font.display};
    letter-spacing: 2.2pt;
    vertical-align: middle;
    text-align: right;
    white-space: pre;
    padding-right: 14pt;
  }
  @top-right-corner { content: ""; background: ${t.cover.background}; }

  @bottom-left {
    content: "© 2026 Vendor — Confidencial — Uso Interno";
    color: ${t.runningFooter.textColor};
    font: ${t.runningFooter.textSize} ${t.font.sans};
    border-top: 0.6pt solid ${t.runningFooter.rule};
    padding-top: 6pt;
    vertical-align: top;
  }
  @bottom-right {
    content: "Página " counter(page);
    color: ${t.runningFooter.pageNumberColor};
    font: bold ${t.runningFooter.pageNumberSize} ${t.font.display};
    border-top: 0.6pt solid ${t.runningFooter.rule};
    padding-top: 6pt;
    vertical-align: top;
    text-align: right;
  }
}

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

.pagedjs_margin-top,
.pagedjs_margin-top-left-corner-holder,
.pagedjs_margin-top-right-corner-holder { background: ${t.cover.background}; }
/* ONE rectangle, not three.
   The header band is three sibling boxes — a centre row between two corner
   holders — so a border-bottom on each drew three abutting rules. They measure
   identical and share exact coordinates, but at each seam two edges land on the
   same x, and a viewer resolving that against its pixel grid leaves a visible
   join: the rule looked doubled at two points, about a tenth in from each edge.
   Drawn once on the page box instead, positioned where the band ends, it has no
   seams to show. The band's height IS the page's top margin, which is what makes
   the offset exact rather than a guess. */
.pagedjs_pagebox { position: relative; }
.pagedjs_pagebox::after {
  content: "";
  position: absolute;
  left: 0;
  right: 0;
  top: calc(${t.page.marginTop} - 1.5pt);
  height: 1.5pt;
  background: ${t.runningHeader.deck};
  pointer-events: none;
}
.pagedjs_cover_page .pagedjs_pagebox::after { content: none; }
.pagedjs_cover_page .pagedjs_margin-top,
.pagedjs_cover_page .pagedjs_margin-top-left-corner-holder,
.pagedjs_cover_page .pagedjs_margin-top-right-corner-holder { background: none; }

.pagedjs_page_content { padding-top: ${t.page.contentTop}; }
.pagedjs_cover_page .pagedjs_page_content { padding-top: 0; }

/* The running header: real DOM, so the brand can carry the accent while the
   whole line stays flush left. Margin boxes could do one or the other. */
/* The centre margin box and the wrapper the paginator puts inside it. Without
   both the box shrinks to its content and the header sits centred, which is
   what "width: 100%" on the running element alone could not fix. */

.rh-host { height: 0; overflow: hidden; }
.rh {
  position: running(rh);
  display: flex;
  align-items: baseline;
  gap: 7pt;
  white-space: nowrap;
  padding-left: 14pt;
}
.rh__brand {
  font-family: ${t.font.display};
  font-weight: bold;
  font-size: ${t.runningHeader.textSize};
  letter-spacing: 1.6pt;
  color: ${t.runningHeader.brandColor};
}
.rh__rest {
  margin-left: 8pt;
  font-family: ${t.font.sans};
  font-size: ${t.runningHeader.textSize};
  color: ${t.runningHeader.textColor};
}


* { box-sizing: border-box; }

body {
  margin: 0;
  font-family: ${t.font.sans};
  color: ${t.prose.color};
  background: ${t.page.background};
}

/* ---- cover ----------------------------------------------------------- */
/* The hairline verticals and the soft glow are the cover's whole ornament,
   and they are structural: cables over a deck. Painted as gradients so there
   is no asset to resolve and nothing to go missing. */

.cover {
  page: cover;
  break-after: page;
  position: relative;
  height: 100%;
  padding: 62pt 54pt 44pt;
  background: ${t.cover.background};
  color: ${t.cover.titleColor};
  display: flex;
  flex-direction: column;
  justify-content: space-between;
}
/* Vector rules, one per cable. See the comment where these are emitted: a
   repeating gradient becomes a full-page tiling pattern in the exported PDF. */
.cover__cables {
  position: absolute;
  inset: 0;
  display: flex;
  justify-content: space-between;
  pointer-events: none;
}
.cover__cables i { width: 0.5pt; background: ${t.cover.hairline}; }
.cover__lockup { position: relative; display: flex; align-items: center; gap: 13pt; }
.cover__mark { width: 40pt; height: 40pt; flex: none; }
.cover__wordmark {
  font-family: ${t.font.display};
  font-size: 21pt;
  font-weight: bold;
  letter-spacing: 4pt;
  color: ${t.cover.titleColor};
}
.cover__stack { position: relative; margin-bottom: 96pt; }
.cover__title--light {
  font-family: ${t.font.display};
  font-size: 33pt;
  font-weight: normal;
  line-height: 1.12;
  letter-spacing: -0.4pt;
  margin: 0;
  color: ${t.cover.titleColor};
}
.cover__title--light b { display: block; font-weight: bold; }
.cover__rule { width: 52pt; height: 2.4pt; background: ${t.cover.accent}; margin: 15pt 0 13pt; }
.cover__lede {
  margin: 0;
  font-size: 10.5pt;
  line-height: 1.55;
  max-width: 290pt;
  color: ${t.cover.ledeColor};
}
.cover__meta {
  position: relative;
  margin: 0;
  padding-top: 11pt;
  border-top: 0.6pt solid ${t.cover.accentSoft};
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  color: ${t.cover.metaColor};
  font-size: ${t.runningFooter.textSize};
}
.cover__ver { font-family: ${t.font.mono}; color: ${t.cover.accent}; }

/* ---- table of contents ------------------------------------------------ */

.toc { break-after: page; padding-top: ${t.space.lg}; }
.toc__title {
  font-family: ${t.font.display};
  font-size: 26pt;
  font-weight: normal;
  letter-spacing: -0.5pt;
  color: ${t.cover.background};
  margin: 0 0 ${t.space.sm};
  padding-bottom: ${t.space.sm};
  border-bottom: 1.5pt solid ${t.sectionHeader.accent};
}
.toc__entry {
  display: flex;
  align-items: baseline;
  gap: ${t.space.sm};
  text-decoration: none;
  border-bottom: 0.5pt solid ${t.runningFooter.rule};
  padding: 4pt 0;
  break-inside: avoid;
}
.toc__entry--l1 {
  font-family: ${t.font.display};
  color: ${t.cover.background};
  font-size: ${t.prose.size};
  font-weight: bold;
  margin-top: ${t.space.xs};
}
.toc__entry--l2 {
  color: ${t.prose.color};
  font-size: ${t.table.cellSize};
  padding-left: ${t.space.xl};
}
.toc__text { flex: 1 1 auto; }
.toc__entry::after {
  content: target-counter(attr(href), page);
  font-family: ${t.font.display};
  font-weight: bold;
  color: ${t.detailHeader.color};
}

/* ---- section opener: the pier ------------------------------------------ */

.section-header {
  background: ${t.cover.background};
  padding: ${t.sectionHeader.pad};
  margin: 0 0 ${t.space.lg};
  position: relative;
  overflow: hidden;
  break-after: avoid;
  break-inside: avoid;
}
.section-header__kicker {
  font-family: ${t.font.display};
  font-size: ${t.space.sm};
  letter-spacing: 2.4pt;
  text-transform: uppercase;
  color: ${t.sectionHeader.subtitleColor};
  margin: 0 0 5pt;
}
.section-header__title {
  font-family: ${t.font.display};
  color: ${t.sectionHeader.titleColor};
  font-size: ${t.sectionHeader.titleSize};
  font-weight: bold;
  letter-spacing: -0.2pt;
  margin: 0;
}
.section-header__title::after {
  content: attr(data-number);
  position: absolute;
  right: 12pt;
  top: -6pt;
  font-family: ${t.font.display};
  font-size: ${t.sectionHeader.ghostSize};
  font-weight: bold;
  letter-spacing: -3pt;
  color: ${t.sectionHeader.ghost};
  pointer-events: none;
}
.section-header__subtitle {
  color: ${t.sectionHeader.subtitleColor};
  font-size: ${t.sectionHeader.subtitleSize};
  margin: 4pt 0 0;
}

.subsection-header {
  font-family: ${t.font.display};
  background: ${t.subsectionHeader.background};
  border-left: 2.5pt solid ${t.subsectionHeader.accent};
  color: ${t.subsectionHeader.titleColor};
  font-size: ${t.subsectionHeader.titleSize};
  font-weight: bold;
  padding: 6pt 10pt;
  margin: ${t.space.lg} 0 ${t.space.sm};
  break-after: avoid;
}
.detail-header {
  font-family: ${t.font.display};
  color: ${t.detailHeader.color};
  font-size: ${t.detailHeader.size};
  font-weight: bold;
  margin: ${t.space.md} 0 ${t.space.xs};
  break-after: avoid;
}

/* ---- prose and blocks -------------------------------------------------- */

.prose {
  color: ${t.prose.color};
  font-size: ${t.prose.size};
  line-height: ${t.prose.lineHeight};
  text-align: ${t.prose.align};
  margin: 0 0 ${t.space.md};
}
strong { color: ${t.cover.background}; }

table.tbl {
  border-collapse: collapse;
  width: 100%;
  margin: 0 0 ${t.space.md};
  font-size: ${t.table.cellSize};
  break-inside: auto;
}
table.tbl th {
  font-family: ${t.font.display};
  background: ${t.cover.background};
  color: ${t.table.headColor};
  font-size: ${t.table.headSize};
  letter-spacing: 0.5pt;
  text-align: left;
  padding: 6pt 8pt;
}
table.tbl td {
  color: ${t.table.cellColor};
  padding: 6pt 8pt;
  border-bottom: 0.5pt solid ${t.table.rule};
  vertical-align: top;
}
table.tbl tr:nth-child(even) td { background: ${t.table.rowAltBackground}; }
table.tbl td.tbl__label { color: ${t.table.labelColor}; font-weight: bold; }
td.tbl__icon { width: 34pt; text-align: center; }
td.tbl__icon img { max-width: 26pt; max-height: 26pt; }
td.tbl__icon--pending img { max-width: 24pt; max-height: 24pt; opacity: 0.75; }
table.tbl--data th { background: ${t.dataTable.headBackground}; }
table.tbl--data tr:nth-child(even) td { background: ${t.dataTable.rowAltBackground}; }

/*
 * The change log, in this theme's idiom: the zebra is painted on the CELLS
 * here, not on the row, because the table.tbl td rule above sets a cell
 * background and a row-level fill would lose to it.
 *
 * No backticks in this comment, deliberately. The whole sheet is one template
 * literal, so a backtick quoting a selector ends the string and the file stops
 * parsing — which is exactly how this comment was written the first time.
 *
 * Value columns pinned for the same reason as in the default sheet — this is
 * the document's last table and its columns should not move between builds.
 */
table.tbl--change-log th { background: ${t.dataTable.headBackground}; }
table.tbl--change-log tr:nth-child(even) td { background: ${t.dataTable.rowAltBackground}; }
table.tbl--change-log td.tbl__version {
  width: 62pt;
  color: ${t.table.labelColor};
  font-weight: bold;
  white-space: nowrap;
}
table.tbl--change-log td.tbl__date { width: 72pt; white-space: nowrap; }

figure { margin: ${t.space.sm} 0 ${t.space.md}; text-align: center; break-inside: avoid; }

/*
 * THE FIGURE BOX IS PINNED, and the image fits inside it.
 *
 * A figure's width is declared in content (\`widthPercent\`) and never moves. Its
 * HEIGHT used to come from whatever proportions the delivered file happened to
 * have, and nothing held it — so a 4:3 screenshot dropped into a slot whose
 * placeholder is 8:5 changed that block's height, moved the page break, and the
 * document needed re-laying-out by hand. That happened repeatedly on the first
 * product, one image at a time.
 *
 * \`320 / 200\` is the placeholder's own viewBox — see \`packages/cli/assets/_pending.svg\`,
 * and the test in \`packages/cli/src/images.test.ts\` that fails if the two ever
 * disagree. Pinning to THAT ratio means the box is the one the reader has been
 * looking at all along, because every undelivered slot renders the placeholder.
 *
 * \`contain\` letterboxes rather than crops: an image that does not match the box
 * loses nothing, it just sits in it. A wrongly cropped control is a control the
 * reader cannot recognise, which is worse than empty margin beside it.
 *
 * Table icons are deliberately untouched — \`td.tbl__icon img\` above bounds them
 * on both axes already, so a delivery there could never move the page.
 */
figure img { max-width: 100%; aspect-ratio: 320 / 200; object-fit: contain; }
figure.figure--item img { max-width: 70%; }
figcaption {
  margin-top: ${t.space.xs};
  color: ${t.figure.captionColor};
  font-size: ${t.figure.captionSize};
  font-style: ${t.figure.captionStyle};
}

.pair { display: flex; gap: ${t.space.md}; align-items: flex-start; break-inside: avoid; }
.pair__text { flex: 1 1 auto; }
.pair__figure { flex: 0 0 38%; }
.pair__figure figure { margin: 0; }

.procedure { margin: 0 0 ${t.space.md}; }
.step { margin: 0 0 ${t.space.md}; break-inside: avoid; }
.step__marker {
  font-family: ${t.font.display};
  color: ${t.procedure.markerColor};
  font-size: ${t.space.sm};
  font-weight: bold;
  letter-spacing: 1.6pt;
  text-transform: uppercase;
}
.step__title {
  font-family: ${t.font.display};
  color: ${t.procedure.stepTitleColor};
  font-size: ${t.procedure.stepTitleSize};
  font-weight: bold;
  margin: 1pt 0 3pt;
}

.field { margin: 0 0 ${t.space.md}; break-inside: avoid; }
.field__label {
  font-family: ${t.font.display};
  color: ${t.fieldList.labelColor};
  font-size: ${t.fieldList.labelSize};
  font-weight: bold;
  margin: 0 0 2pt;
}
.term { margin: 0 0 ${t.space.sm}; font-size: ${t.termList.size}; }
.term__word { font-family: ${t.font.display}; color: ${t.termList.termColor}; font-weight: bold; }

.callout {
  background: ${t.callout.info.background};
  border-left: 2.5pt solid ${t.callout.info.accent};
  color: ${t.callout.color};
  font-size: ${t.callout.size};
  padding: 8pt 11pt;
  margin: 0 0 ${t.space.md};
  break-inside: avoid;
}
.callout--important {
  background: ${t.callout.important.background};
  border-left-color: ${t.callout.important.accent};
}
.callout__label { font-family: ${t.font.display}; font-weight: bold; font-size: ${t.callout.labelSize}; }

/* ---- draft only -------------------------------------------------------- */

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
  word-break: break-all;
}
.shot__file { white-space: nowrap; word-break: normal; }
table.tbl .shot__name { display: block; margin-top: ${t.space.xs}; }
`;
}
