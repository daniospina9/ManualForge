---
name: manual-import
description: Migrates an EXISTING legacy manual document into structured, tenant-conditioned block content — stripping hardcoded numbering and anchors, converting cross-references to stable ids, classifying prose into block types, and rebuilding tenant tagging from the module map instead of trusting the legacy badges. Use ONLY when such a document already exists and is the input: a packed single-file manual, one document carrying every deployment, SharePoint numbering and anchors to strip. Do NOT use it to start a manual from a product repository — that path begins at source-extraction and needs nothing here. Cold path: Atlas's own import is finished, and this skill's detail is unaudited beyond its step headings.
license: MIT
metadata:
  author: daniospina
  version: "1.0"
---

# Importing a legacy manual

The legacy document is a **seed**, not a target. It was written as one packed
file for all tenants, with numbering and anchors typed by hand. Almost none of
that survives the migration intact.

This is not a copy. Treat any step that feels like copying as a step you have
skipped.

## Before starting

- `knowledge/module-map.json` must exist and have been reviewed. Tenant tagging
  is rebuilt from it, and it is not optional input.
- The block catalogue must be open. Classification into block types cannot start
  before the block types exist.

## Procedure

### 1. Inventory before converting

Walk the whole document and catalogue the **content shapes** actually present —
step-by-step procedures, icon tables, notes, warnings, figures with captions,
field lists, FAQ pairs — with counts and one real example each.

This tells you which block types the content genuinely needs. Converting
section by section without this produces a different improvisation every few
pages.

### 2. Split into fragments

One fragment per unit that could vary independently. Err toward smaller: merging
two fragments later is trivial, splitting a paragraph whose halves belong to
different tenants is not.

### 3. Strip every number and anchor

Hardcoded numbering (`5.2`, `Figura 7.1.3`) and slugs (`#52-semforos-y-ars`) all
come out.

- Section numbers → the section's position in the tree
- Figure numbers → the owning block's id
- `[texto](#slug)` → a reference to a stable id
- "consulte la sección 4" → a reference, not a sentence with a number in it

**Grep the converted output for digits followed by a dot, and for `#`.** Every
hit is a bug until proven otherwise. This is the single most common way a
migration silently keeps the old model.

### 4. Classify into blocks

Map each fragment to a block type. Where nothing fits, collect the case — do not
improvise. A batch of unfitting content is a catalogue conversation, not twenty
individual workarounds.

Icon and UI tables become **data**, with per-row tenants, never hand-written
Markdown tables.

### 5. Rebuild tenant tagging from the map

**Discard the legacy tenant metadata.** In `atlas` it is mostly
`_(por definir)_` or `Todos` — it records that the question was deferred, not
its answer.

For each fragment, find the corresponding element in the module map and tag from
its gating. Where the map has nothing, mark the fragment for review rather than
defaulting to `all` and hoping.

### 6. Requote UI labels from i18n

Labels typed into the legacy text are a snapshot of what the screen said once.
Look each one up in the product's catalogue and replace it with the value that
catalogue holds today, recording the key in a comment above it. Not with a key
reference: the `uiLabel` node exists in the AST and no renderer resolves it, so a
keyed label renders as nothing. See `block-authoring`.

### 7. Review per tenant, in the output

Build every tenant and read them. Look for:

- numbering gaps or wrong ordinals
- dangling or cross-tenant references
- paragraphs that assume content the tenant cannot see
- figures whose caption no longer matches their number
- any surviving tenant badge — output is client-facing

## This is not fully automatable

Splitting, classifying and tagging need judgement. An agent does a strong first
pass; a human reviews it. Anyone who tells you an importer can finish this alone
has not read the legacy document.

Migrate **section by section**, reviewing each before moving on. A bad
convention applied across a whole document is far more expensive to undo than to
catch on the first section.
