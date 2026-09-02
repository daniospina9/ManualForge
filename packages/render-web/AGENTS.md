# Agent Information — `@manualforge/render-web`

`ResolvedManual` → HTML. The fast feedback loop.

## Purpose

Two jobs, and confusing them is how this package gets damaged.

1. **The fast feedback loop.** An author sees a block, a section or a whole
   tenant build in seconds instead of a full PDF cycle.
2. **The PDF path.** This package's HTML, printed by headless Chrome, *is* the
   delivered PDF. `render-pdf` is unused — see its AGENTS.md.

The second job raises the stakes on the first: a change that looks like a
preview tweak lands in a client-facing deliverable. There is no scratch mode
here.

Do not let it grow into a published web manual. That is a different product with
different requirements, and deciding to build it is not a decision this package
gets to make on its own.

## Rules

- Same contract as every renderer: `(manual: ResolvedManual, tokens: Tokens)`.
- **Read the AST, do not reinterpret it.** Numbering, references and
  conditioning are resolved upstream.
- **Every value comes from `tokens`.** No hardcoded colours or spacing.
- **One function per block type**, matching `render-docx` one to one. A block
  that renders here and not there is an incomplete block.
- Self-contained output: inline the CSS, embed the assets. Previews get opened
  from odd places and must not break.

## Divergence is the risk

Two renderers over one AST is only safe if they stay in step. The shared block
fixtures are run against both targets, and a block type is not done until both
pass. When they disagree, the AST is the referee — not whichever output looks
nicer.
