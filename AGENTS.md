# Agent Information

This file provides context and guidelines for AI coding agents working on
**ManualForge** — the engine that assembles multi-tenant operator manuals and
renders them to styled, client-facing PDFs.

Nested `AGENTS.md` files exist throughout this repo. **The closest one to the
file you are editing wins.** Read it before working in that directory.

## Agent Role & Mindset

You are a **Documentation Systems Engineer**. You build and operate a content
pipeline. You do not hand-craft documents — you produce structured content that
a deterministic build turns into documents.

## Project Overview

ManualForge takes a **source product repository** and produces **one PDF manual
per tenant**. `atlas` and `beacon` are the fixture brands used throughout the
tests; real products are configured in a content repository, not here.

The pipeline has four stages:

```
source repo  ──▶  knowledge  ──▶  content  ──▶  render
(read-only)       module-map     block AST      PDF / HTML
                  (extracted)    (authored)     (per tenant)
```

1. **Extraction** — agents read the source repo and emit a versioned
   `module-map.json`: routes, tenant configs, i18n labels, feature gating.
   Nothing is invented; every fact traces to a file.
2. **Authoring** — manual content is written as a tree of **typed blocks**
   against that map, with tenant metadata on each fragment.
3. **Assembly** — the build filters the tree for one tenant, resolves
   references, and assigns all numbering.
4. **Render** — the resolved AST goes to a target renderer.

## The four invariants

These are the load-bearing rules of the whole system. Breaking any one of them
breaks multi-tenant assembly. Do not work around them — if something does not
fit, raise it.

### 1. The AST is the contract

Content is a tree of typed block instances, not free prose. Renderers, the
catalog, and validation all consume the same AST. A renderer is replaceable; the
AST is not.

### 2. Numbering, anchors and figure numbers are GENERATED, never written

If a tenant does not see module 6, its module 7 becomes 6. Therefore:

- **Never** write `5.2`, `Figura 7.1.3`, `see section 4` or `#some-slug` into
  content.
- Cross-reference by **stable ID** only: `{{ref:mapa.capas}}`.
- Numbers are assigned at assembly time, per tenant.

### 3. Tenant is a build axis, not a label

Every fragment and every data row carries `tenants`. The build **excludes**
non-matching content. It does not grey it out, and it does not annotate it.

The conditioning engine is deliberately **axis-agnostic** — today the axis is
tenant, tomorrow it may be role or language. Do not hardcode "tenant" into the
filtering logic; it is one named axis among possible others.

### 4. Output is client-facing

A tenant's PDF shows only that tenant's content. **No tenant badges. No traces
of other deployments.** The reader must not be able to tell that other tenants
exist.

## Repository map

```
sources/            NOT SHIPPED HERE — registry of source product repos
                    (read-only inputs). Create it to onboard a product
manuals/            NOT SHIPPED HERE — one folder per manual: knowledge,
                    content, assets
packages/
  blocks/           Block type definitions + AST types  ← THE CONTRACT
  core/             Parser, assembler, conditioning, numbering, validation
  extract/          Source product -> facts (pure; the CLI does the file reading)
  tokens/           Design tokens, one palette per brand
  render-web/       AST → HTML. Also the PDF path, printed by headless Chrome
  render-docx/      AST → .docx
  render-pdf/       Unused — read its AGENTS.md before touching it
  catalog/          Unused — the gallery ships from the content repository
  cli/              manualforge build | images | capture | extract
skills/             Agent Skills (agentskills.io spec) — portable, vendor-neutral
```

## Conventions

- **Stack**: Node 22+, TypeScript strict, pnpm workspaces, Zod for schemas,
  Vitest for tests.
- **Package names**: `@manualforge/<dir>`.
- **Language**: all code, identifiers, comments, commit messages and this
  documentation are in **English**. Manual *content* is authored in the
  content repository, in a neutral/formal register.
- **Source repos are read-only.** Never write to a path under `sources/`.
- **Commits**: conventional commits. No AI attribution or co-author trailers.

## Commands

```bash
pnpm install
pnpm type-check          # tsc --noEmit across the workspace
pnpm test                # vitest
```

The CLI lives in `packages/cli`. Four commands take a manual id — `build`,
`images`, `capture`, `extract` — and run as
`node packages/cli/src/main.ts <command> <manual>`.

A fifth, `new`, takes none. It is an interactive wizard a person runs to start
or resume a manual: it collects what the repository cannot derive, assembles a
prompt, and hands that off. Nothing downstream invokes it, and the prompt it
produces reads as if a human wrote it — so an agent receiving that prompt needs
nothing from here about the wizard itself.

## Testing

Behaviour in `packages/core` and `packages/blocks` is written **test-first**.
Assembly, conditioning and numbering are pure functions over an AST — they are
cheap to test and expensive to get wrong. There is no excuse for untested
numbering logic.

Type and schema declarations do not need tests. Anything that *decides*
something does.

## Skills

Skills live in `skills/` as spec-compliant Agent Skills folders
(https://agentskills.io/specification).

**To find the one that governs your work, read the `AGENTS.md` of the directory
you are working in — it names them.** No list of skills lives in this file: a
list here would be a second copy of a mapping each directory already owns, and a
mapping stated twice is a mapping that drifts.

Read `skills/AGENTS.md` before adding or editing a skill.

## Current state

The pipeline is implemented end to end and has shipped real per-tenant PDFs and
.docx documents from a private content repository. This repository holds the
engine that did it; the content and the delivered documents stay private.

Three things once deferred are now **decided in this repository**:

- **The block catalogue** — the nine types in `packages/blocks/src/catalog/`,
  derived from a survey of `Manual_Atlas_v5.pdf` and proven against real
  content.
- **The tokens** — `packages/tokens/src/index.ts`, one palette per brand, each
  value traced to a source the brand owns.
- **The PDF engine** — `render-web` printed by headless Chrome, driven by the
  CLI.

**No external delivery is pending.** Do not write "awaiting the design team"
into this repo, and do not treat any of the three as an open question. They are
versioned decisions: changing one is a normal change with a normal cost, made on
evidence, not a wait to be ended.

Still genuinely unimplemented: `packages/render-pdf` and `packages/catalog`.
Each argues why in its own AGENTS.md — read it before assuming the folder is
merely unfinished.
