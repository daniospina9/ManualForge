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

The **engine** — the block contract, the assembler, the design tokens and the
renderers. It carries no manual content: no source-product registry, no authored
sections, no captured figures, no delivered documents.

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

Content lives in two directories at the repository root that this repository
does not ship: `sources/registry.yaml`, which points the extractor at the
product repositories you own, and `manuals/<id>/`, one folder per manual. The
CLI degrades gracefully when they are absent — the wizard scaffolds a manual,
and the registry is yours to write.

## Getting started

```bash
pnpm install
pnpm type-check
pnpm test
```

The test suite is the documentation that runs: 690 tests over the block
contract, conditioning, numbering, delivery state and every renderer.

```bash
# Start a manual, or pick up one already under way
pnpm manuales

# Build one tenant's manual
node packages/cli/src/main.ts build <manual-id> --tenant <tenant>

# Every configured tenant
node packages/cli/src/main.ts build <manual-id>
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
