# Agent Information — `@manualforge/blocks`

**This package is the contract.** Everything else in the repo depends on it and
must not contradict it. Changes here ripple to every manual, so they are
deliberate, versioned, and never casual.

## Scope

- The manual AST (`ast.ts`)
- The conditioning model (`conditioning.ts`)
- How a block type is declared (`definition.ts`)
- The block catalogue itself (`catalog/`) — **nine types, and closed**

## What does NOT belong here

- Rendering, styling, colours, spacing — that is `tokens` and the renderers.
- Parsing an authoring format into the AST — that is `core`.
- Conditioning or numbering *logic* — the model lives here, the algorithm lives
  in `core`.

If you find yourself importing a renderer here, stop. The dependency runs the
other way.

## The catalogue is closed

`src/catalog/` holds one file per block type, each exporting a
`BlockDefinition`. There are nine. They were derived by surveying every page of
`Manual_Atlas_v5.pdf` for the structures the content actually recurs on, and
proven against two delivered manuals.

**This is the catalogue.** There is no other one arriving, and nothing here is
waiting on anyone outside this repository.

Closed does not mean frozen — it means a tenth type is added deliberately, by
the rules below, and never by guessing what might be needed. Inventing a
half-right block means migrating content later, the exact cost this architecture
exists to avoid.

## Rules for adding a block type

1. One file per type in `src/catalog/`, named after the type.
2. Every block gets a `description` written for whoever must choose between
   block types. Say what it is for **and when to use it instead of a similar
   one**. This field is what stops authors from improvising layout.
3. `props` is fully described by a Zod schema. No `z.any()`, no escape hatches
   — an untyped prop is a hole in the contract.
4. If instances are numbered, declare `numbering`. Never bake a number into
   props.
5. Bump `version` per SemVer. Adding an optional prop is a minor; removing or
   renaming one is a major and requires a content migration.
6. Every new type must render in **all** targets before it is usable. A block
   only `render-web` supports is a broken block.

## Invariants this package protects

- Content never carries a number, anchor or slug. Only stable `id`s.
- Content never carries a filename or a path. Images are **slots** — see
  `src/image.ts`. A path cannot vary by deployment and gives the area that
  delivers the images no key to synchronise against.
- A block that carries images declares `images: ImageSlotPolicy`, so slots can
  be enumerated for the manifest without any consumer switching on block type.
- Cross-references are `{ kind: "ref", target: NodeId }` — never literal text.
- UI labels quoted from the product use `{ kind: "uiLabel", i18nKey }`, so the
  manual always says what the screen says.
- Nothing here names a concrete tenant. Axis values are manual configuration,
  not code.

## Testing

Type and schema declarations need no tests. Anything that *decides* something —
a refinement, a custom validator — is written test-first with Vitest.
