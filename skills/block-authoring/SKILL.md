---
name: block-authoring
description: How to write Atlas manual content as typed blocks from the block catalogue — choosing the right block type, filling its props, referencing UI labels and other nodes, and requesting a new block type instead of improvising a layout. Use when writing or editing manual sections, converting prose into structured content, deciding which block fits a piece of content, or adding a block type to the catalogue.
license: MIT
metadata:
  author: daniospina
  version: "1.0"
---

# Authoring content as blocks

Manual content is a tree of **typed block instances**, not prose with formatting.
The catalogue of block types is fixed and defined in
`packages/blocks/src/catalog/`. Your job is to pick the right one and fill it
correctly.

## The rule that keeps this maintainable

**If the content does not fit a block in the catalogue, request a new block
type. Do not improvise a layout.**

The first hand-rolled table, the first ad-hoc bold-line-then-indent pattern —
that is the moment the system stops scaling. One improvised structure cannot be
restyled, cannot be conditioned reliably, and cannot be validated. Then there
are twenty.

Requesting a block is cheap. Migrating improvised content is not.

## Choosing a block

1. Read the block's `description`. It says what the block is for **and when to
   use it instead of a similar one**. That sentence exists precisely for this
   decision.
2. Read the type's own definition in `packages/blocks/src/catalog/<type>.ts`.
   The schema and its comments are the whole spec. **There is no gallery
   command** — a catalogue browser was designed and never built, so the source
   files are the catalogue.
3. Still unsure between two? Pick the more specific one. A specific block
   carries meaning a generic one loses, and meaning is what survives a restyle.

## Filling a block

- **Every node gets a stable `id`**: lowercase, dot-separated, meaningful. Never
  derived from a number, never renamed casually (references point at it).
- **A block's rows get their own namespace beside the block, never under it.**
  The shipped convention is a short singular form of the block's own segment: the
  `mapa.capas` icon-table holds rows `mapa.capa.trafico`, and
  `bot.alarmas.columnas` holds `bot.alarmas.col.estado`. Read the ids already in
  `manuals/<manual>/sections/` before inventing a shape — a manual's id
  convention is its own, and this one is atlas's.
- **Props follow the schema exactly.** Validation will reject the rest; do not
  fight it.
- **UI labels come from the product's i18n catalogue, never retyped off a
  screenshot.** Resolve the key and write its value: shipped content says
  `label: Tráfico` because `layers.traffic` is `"Tráfico"`. Where the product
  hardcodes a label beside the control instead of keying it, that literal is just
  as sound — `label: AVL` is one of those.
- **Record the key in a comment above the label.** The value in the file is a
  copy, and nothing links it back on its own: if the product renames
  `layers.traffic`, the manual is silently wrong and neither the build nor the
  drift report can see it. The AST has a `uiLabel` node designed to close that
  gap and no renderer resolves it, so the comment is the mechanism that actually
  exists — the same provenance habit conditioned rows already follow.
- **Cross-references point at ids.** Never write a section number or a
  screen name in place of a reference.
- **Conditioning goes on the smallest unit that varies.** See the
  `tenant-conditioning` skill.

## Never in content

- A number, an anchor, or a slug — the build assigns those per tenant
- A colour, a size, a font, a spacing value — that is the design system
- A tenant badge — output is client-facing
- A hand-built table where the block catalogue has a data-table block

## Requesting a new block type

Do not add one yourself unless you own the catalogue. Raise it with:

1. **The content that does not fit**, verbatim — a real example, not a
   description of one.
2. **Why existing blocks fail it.** Name the closest one and what it loses.
3. **How often it recurs.** A structure appearing once is usually a sign the
   content should be reshaped, not that a block is missing.
4. **How it should condition.** Which parts can vary by tenant.

## Adding a block type to the catalogue

Only if you own the catalogue, and only after the structure is agreed. The
catalogue is closed — nine types, decided in this repository — so a tenth is a
versioned change to a contract every manual depends on, never a convenience.

1. One file per type in `packages/blocks/src/catalog/`.
2. Fully specified Zod schema. No `z.any()`.
3. A `description` written for whoever must choose between block types.
4. Declare `numbering` if instances are numbered. Never bake a number into
   props.
5. Implement it in **every** renderer. A block one target cannot render is not
   done.
6. Add minimal, maximal and edge-case fixtures — long labels, empty optional
   slots, a table filtered down to one row.
7. SemVer the catalogue: new optional prop is minor; removing or renaming one is
   major and needs a content migration.
