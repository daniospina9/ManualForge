# Agent Information — `@manualforge/render-docx`

`ResolvedManual` → .docx. A client-facing deliverable, beside the PDF.

## Why it exists

The contract asked for the manual in Word, looking like the PDF. Not as an
editing convenience — as a delivery format. That is a real second target, so it
is a real second renderer over the same AST, not a converter bolted onto the
first.

Converting was considered and rejected. A PDF has no logical structure left to
recover; a pass over the emitted HTML gets editable text but loses every page
construct the brand lives in.

## Rules

Same as every renderer in this repository:

- Contract is `(manual: ResolvedManual, options)`. It reads the AST and
  **reinterprets nothing** — numbering, figure ordinals, conditioning and
  cross-references are all resolved upstream.
- **One function per block type**, matching `render-web` one to one. An unknown
  type throws; a block that renders there and not here is an incomplete block.
- **Every value comes from `tokens`.** A hex code or a magic size in this package
  is a bug. `measure.ts` translates token units into Word's; `style.ts` restates
  the stylesheet as named faces.
- **No filesystem.** It is handed image bytes, never paths. Resolving, reading
  and converting assets is the CLI's job (`packages/cli/src/raster.ts`).
- **Client-facing output.** No slot names, no tenant badges, no annotations.

## What it cannot promise, and must not pretend to

**Page breaks do not match the PDF.** Word reflows with its own line-breaking
and table-splitting rules. Beacon is 73 pages as a PDF and 76 in Word. This is
not a bug to be fixed and no amount of `keepNext` closes it — keeping blocks
together *costs* pages, which is most of that difference.

The manual survives this only because **nothing in the content references a page
number**: cross-references are `{ kind: "ref" }` resolved to figure and section
ordinals. If page references are ever authored, this target breaks and the
authoring format is what has to change.

## Decisions worth not relitigating

- **The cover is a picture**, shot off the already-paginated first sheet by the
  CLI. A radial glow, twenty-two hairline rules and an inline SVG mark have no
  OOXML counterpart. It is the one page with no heading to navigate to and no
  figure to reference, so nothing is lost by flattening it — and it is exact
  rather than approximate. It is placed FLOATING and anchored to the page:
  Word shrinks an inline picture to the text column, which left a white margin
  on all four sides even at zero page margin.
- **Section openers are real text, not pictures.** A picture would be pixel-exact
  and would leave the document with no outline, no navigation pane and no working
  table of contents. The heading style is what those read.
- **The ghost ordinal rides the kicker's line, tab-aligned right.** The CSS
  positions it absolutely. A `framePr` paragraph is OOXML's equivalent and inside
  a table cell it turns the CELL into the frame — the pier came out 120pt wide,
  floating over the body with the prose wrapping around it. Never reach for
  `frame` inside `box()`.
- **A padded fill is a one-cell table.** Paragraph shading stops at the indents
  and does not cover vertical padding, so openers, subsection headings and
  callouts are all `box()`.
- **The contents is a Word field**, so its page numbers are Word's own. They are
  the only correct ones: the PDF's numbers describe a document that breaks
  elsewhere. A transcribed list would be confidently wrong.
- **Action lists are numbered as text**, not through a Word numbering definition.
  The ordinal is presentational and comes from list order, and Word deciding on
  its own whether the two-hundredth list continues or restarts is a real risk.
- **Fonts must ship with Office.** Word substitutes a missing family on the
  READING machine, so a webfont here silently makes the client's copy differ from
  ours. `family()` commits to the head of each CSS stack, which is only safe
  because the Beacon faces are frozen — see `font` in `packages/tokens`.

## Divergence is the risk

Three renderers over one AST is only safe if they stay in step. When two
disagree, the AST is the referee for CONTENT and the PDF is the referee for
APPEARANCE — that is what this target is measured against.

One consequence, already load-bearing: `term-list` renders its term unbolded,
because `.term__word` is a stylesheet rule the HTML renderer never emits. The PDF
shows a plain `dt`. Matching the CSS instead of the PDF would make this document
disagree with the delivered one.

## Verifying a change

Type-checking and the unit tests do not tell you it looks right. On a machine
with Word:

```
node packages/cli/src/main.ts build beacon-primera-entrega --docx
```

then open the .docx, update fields, export to PDF and **look at it** — cover,
an opener, a `beside` procedure, a table, and the last page.
