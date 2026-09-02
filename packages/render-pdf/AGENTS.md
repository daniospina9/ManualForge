# Agent Information — `@manualforge/render-pdf`

## The engine was chosen, and it is not this package

The PDF ships from `render-web` printed by headless Chrome, driven by the CLI.
Four tenant PDFs have been delivered that way.

This file used to say the decision was deferred until the design team delivered
fixed visual structures. **That dependency no longer exists** — the visual
structures are the nine block types in `packages/blocks/src/catalog/` and the
palettes in `packages/tokens`, both decided in this repository. What was once
recorded here as "evidence, not a verdict" has been promoted: HTML + CSS Paged
Media is the verdict.

## Why this package still exists

The alternative it was going to hold is still coherent, and deleting the folder
would delete the reasoning with it:

| Candidate | Wins when |
|---|---|
| **HTML + CSS Paged Media** *(chosen)* | One code path shared with `render-web` and `render-docx`. Costs a headless browser in the pipeline. |
| **Typst** | Print-native typography, grid and pagination; single binary; faster across N tenant builds. Would win if a manual outgrows what paginated CSS can hold. |

Reviving this package means **re-opening a closed decision**. Do not start it
because the folder looks empty. Bring the reason first: a concrete layout the
current path cannot produce, or a build cost that has become unacceptable.

## Rules, if a second PDF engine is ever built

These are engine-independent and apply to any renderer over the AST.

- **The interface is `(manual: ResolvedManual, tokens: Tokens) => Buffer`**, and
  the block fixtures are the acceptance criteria.
- **One function per block type.** A block's visual structure lives in exactly
  one place. No conditionals on tenant, no per-manual special cases.
- **Read the AST, do not reinterpret it.** Numbering, references and
  conditioning are already resolved. A renderer that recomputes them will drift
  from the other targets.
- **Every value comes from `tokens`.** A hex code or a magic pixel value in this
  package is a bug.
- **The output is client-facing.** No tenant badges, no internal annotations, no
  "not applicable to your deployment". Excluded content is gone, not marked.
- **Visual regression tests per block**, run across every target so the PDF and
  `render-web` cannot diverge silently.
