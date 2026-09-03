# ManualForge

Assembles multi-tenant operator manuals from a single source of content and
renders them to styled, client-facing PDF, Word and HTML — one document per
tenant.

```
source repo  ──▶  knowledge  ──▶  content  ──▶  render
(read-only)       module-map     block AST      PDF / DOCX / HTML
                  (extracted)    (authored)     (per tenant)
```

## Why

A multi-tenant product rarely differs screen by screen. It differs *inside*
shared screens — a map layer only one tenant sees, a filter another has, a
report column specific to a third. A single packed document cannot serve them
all, and keeping one document per tenant duplicates every correction until the
copies disagree.

Here, content is authored once as tenant-tagged typed blocks, and each tenant's
manual is assembled from it. Conditioning happens at assembly time, so a
sentence written once stays correct in every document that includes it.

## What is in this repository

The **engine** — the block contract, the assembler, the design tokens, the
renderers, and the agent instructions that drive them. It carries no manual
content: no source-product registry, no authored sections, no captured figures,
no delivered documents.

| Path | Purpose |
|---|---|
| `packages/blocks` | Block type definitions and AST types — the contract |
| `packages/core` | Parser, assembler, conditioning, numbering, validation |
| `packages/extract` | Reads a product repository into a module map |
| `packages/tokens` | Design tokens — one palette per brand |
| `packages/render-pdf` | AST → PDF |
| `packages/render-docx` | AST → Word |
| `packages/render-web` | AST → HTML preview |
| `packages/catalog` | Live gallery of every block, variant and tenant |
| `packages/cli` | `manualforge` command line |
| `skills/` | Agent Skills used to operate the pipeline |
| `sources/AGENTS.md` | How a source product repository is onboarded and read |
| `manuals/AGENTS.md` | How a manual is laid out and authored |

`sources/registry.yaml` points the extractor at the product repositories you
own. It is yours to write, and a fresh clone has none: the entry is recorded
after a product is surveyed, not before, so the wizard asks for a path instead
of a pick until one exists.

**Extraction is optional.** `extract` reads a product's own code into cited
facts so content can be written against them faster, and it is written per
product shape — `EXTRACTORS` in `packages/extract` lists the ones a reader
exists for, today `react-vite-ts` alone. A source declaring anything else is
refused by name rather than parsed by the wrong reader, because a wrong fact
about which deployment sees what is the one defect a reader of the finished
manual cannot detect.

That refusal is a detour, not a dead end. `build` never reads the module map: a
manual is assembled from content, and content is written against facts cited
from the source by file and line, whether a parser produced those citations or a
person did. Three of the four manuals this engine has shipped were authored with
no map at all, one of them delivered to a client. Adding a reader for your own
stack is additive — a finder returning the same types, registered in
`EXTRACTORS` — and `packages/extract/AGENTS.md` describes the seam.

`manuals/<id>/` holds one folder per manual. `manuals/demo/` ships as a worked
example — two deployments of a fictional product, conditioned at both the
section and the row level — so `build` has something to render before you have
written anything. Delete it once you have a manual of your own.

## Getting started

```bash
pnpm install
pnpm type-check
pnpm test
```

The test suite is the documentation that runs: 690 tests over the block
contract, conditioning, numbering, delivery state and every renderer.

Then build the bundled example, which needs no configuration:

```bash
node packages/cli/src/main.ts build demo
```

```
tenant=north     2 section(s), 4 numbered node(s), 3 page(s) -> manual-operador-north-…pdf
tenant=south     2 section(s), 3 numbered node(s), 3 page(s) -> manual-operador-south-…pdf
```

Two documents from one source of content, and Sur's is a node shorter because a
section and a table row name Norte and only Norte. That difference is the point
of the whole pipeline. Both land in `manuals/demo/output/`.

```bash
# Start a manual of your own, or pick up one already under way
pnpm manuales

# Build one deployment
node packages/cli/src/main.ts build <manual-id> --tenant <tenant>
```

`pnpm manuales` is an interactive wizard. It asks only what the repository
cannot work out for itself — which product, what to call its manual, how much to
attempt — and hands the assembled prompt to an agent. It writes no manual of its
own.

Rendering shells out to Chrome or Edge. Set `CHROME_PATH` if neither is found in
the usual locations.

Skills live in `skills/` and are agent-agnostic. To let your coding agent
discover them, link that folder into its skills directory — see
`skills/AGENTS.md`. The link is local and gitignored.

## Fixtures

Tests and examples use two fictional brands, `atlas` and `beacon`, whose tenants
are `north`, `south`, `metro`, `lite` and `demo`. They stand in for real
deployments and mean nothing outside this repository. The vendor wordmark
printed on a cover and running header is the placeholder `VENDOR`; it is passed
in, not baked into the renderers.

## Status

Extracted from a private production system where it assembles and ships real
operator manuals. The block catalogue, the design tokens and the PDF engine are
all decided here — see `AGENTS.md` before changing one.

Agent instructions live in `AGENTS.md` files throughout the repo; the closest
one to a file takes precedence.

## Licence

MIT — see [LICENSE](LICENSE).
