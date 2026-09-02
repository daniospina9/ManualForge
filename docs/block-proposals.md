# Block type proposals

Staging document. These are **candidates**, not catalogue entries.

They were derived by surveying all 50 pages of `Manual_Atlas_v5.pdf` and
recording which visual structures actually recur, with page evidence for each.
They exist so the decision starts from the structures the content already
demands, rather than from invented ones.

Nothing here is implemented. Each candidate gets confirmed, reshaped or dropped
on its own evidence, by the procedure in `packages/blocks/AGENTS.md` — and only
then becomes a file in `packages/blocks/src/catalog/`. A candidate that never
earns that is not a backlog item; it is a structure the content did not need.

## Survey summary

Structures already covered by the catalogue:

| Existing block | Seen on |
|---|---|
| `prose` | everywhere |
| `icon-table` | p7 (map controls), p8 (top bar) |
| `figure` | ~40 captioned figures across the document |
| `detail-header` | p9, p10, p13, p42, p44 |
| `note` | p49 (but the design has a second variant — see P5) |

Structures **not** covered, in order of how often they appear:

---

## P1 — `field-list`

**The most common structure in the manual, and the biggest gap.**

Evidence: pp. 15, 16, 17 (filter components), 31, 32, 33 (dashboard filters),
35, 36 (dashboard widgets), 41, 44.

A run of named UI elements, each with a teal bold label ending in a colon, a
justified paragraph, and usually a centred screenshot of that one element. On
p35 the same shape documents dashboard widgets; on p16 it documents filter
fields. Same structure, different content.

```yaml
- id: filtros.componentes
  type: field-list
  props:
    items:
      - id: filtros.origen-reporte
        label: Origen del Reporte
        text: Permite filtrar los incidentes según su origen de creación...
        image: filtros/origen-reporte.png    # optional
        when: { tenant: [north, demo] }         # per ITEM
```

- Conditioning: **per item.** This is the whole point — a filter only SOUTH has is
  one item, not a whole section.
- Numbering: none. Items are named, not numbered.
- `image` optional so a module can be written before its screenshots exist.

Today this content would have to be faked with alternating `detail-header` +
`prose` + `figure` triples, which cannot be conditioned as a unit and inflates
the figure counter for illustrations that are not numbered figures in the source.

---

## P2 — `procedure`

Evidence: p28 (agent report update, "Paso 1 / Paso 2"), p23 (dispatch step by
step), p29 (report lifecycle).

An ordered sequence. Each step has a title, prose, an optional image, and
sometimes a nested ordered or bulleted list of sub-actions.

```yaml
- id: reporte.actualizacion
  type: procedure
  props:
    lead: El proceso de actualización consta de dos pasos.
    steps:
      - id: reporte.paso.recepcion
        title: Observación y Recepción de los Datos
        text: Cuando existe una actualización proveniente del reporte...
        image: reporte/notificacion.png
        actions:                              # optional ordered sub-list
          - Haga clic en la flecha ubicada al lado del ícono de Reporte.
          - Despliegue la placa del o los agentes.
        when: { tenant: [north] }                # per STEP
```

- Conditioning: **per step**, and per action inside a step.
- Numbering: steps are numbered **by position after conditioning**. A tenant that
  skips step 2 sees its step 3 as step 2. The title must never contain "Paso 1" —
  the renderer supplies it.
- Note the source writes `Paso 1:` into the heading text. That is exactly the
  hardcoded numbering this architecture forbids; the importer must strip it.

---

## P3 — `term-list`

Evidence: p16 (`Entrante:` / `Saliente:`), p49 (`Protocolos Sugeridos:` /
`Recursos Cercanos:` / `Guiones Dinámicos:`), p26, p27.

Compact bold-term-plus-inline-definition pairs, indented, no images. Distinct
from `field-list`: it is a tight glossary run, not a documented UI element, and
it is frequently nested inside another block's explanation.

```yaml
- id: llamada.tipos
  type: term-list
  props:
    terms:
      - id: llamada.tipo.entrante
        term: Entrante
        definition: Filtra por llamadas que realiza un usuario.
      - id: llamada.tipo.saliente
        term: Saliente
        definition: Filtra por llamadas salientes desde operación.
        when: { tenant: [north, metro] }
```

- Conditioning: per term.
- Numbering: none.

---

## P4 — `data-table`

Evidence: p49 (module capabilities), p2 (table of contents rows), p50 (change
history).

A two-column table with a **teal** header row — visually distinct from
`icon-table`, whose header is navy and which carries an icon column and per-row
item numbers. This one is label + description, no icons, no numbering.

```yaml
- id: callai.capacidades
  type: data-table
  props:
    labelHeader: Capacidad
    descriptionHeader: Descripción
    rows:
      - id: callai.cap.resumen
        label: Análisis y Resumen Inteligente
        description: La IA escucha activamente la llamada y genera un resumen...
        when: { tenant: [north] }
```

Open question for the design meeting: is this genuinely a second table type, or
is it `icon-table` with the icon column and numbering switched off? Merging them
would mean one block with variants; keeping them apart means two simpler blocks.
Worth deciding deliberately rather than by accident.

---

## P5 — `callout`, with variants — **IMPLEMENTED**

Evidence: p49 (`IMPORTANTE:` in an amber box with a left bar).

Shipped as `packages/blocks/src/catalog/callout.ts`, with the closed variant set
`info | important`. Kept here for the evidence trail; it is no longer a
candidate.

```yaml
- id: observaciones.bloqueo
  type: callout
  props:
    variant: important        # info | important
    text: Este campo se bloquea durante la llamada en vivo...
```

Proposed as a rename and extension of `note`, not a second block: one type with
a declared, closed set of variants. Two nearly identical block types is how a
catalogue starts rotting.

---

## Smaller candidates, deliberately not proposed as separate types

- **Uncaptioned inline screenshot.** Many images in the source carry no
  `Figura N` caption — they illustrate the paragraph above them. Suggest handling
  as a `figure` with numbering suppressed, not a new type, so the distinction is
  a property rather than a fork.
- **Closing statement.** p49 ends with centred italic teal text between rules.
  Appears once. One occurrence is usually a sign the content should be reshaped,
  not that a block is missing — revisit if it recurs.
- **Table of contents.** p2. This is *generated*, not authored: it is a renderer
  feature driven by the section tree and the numbering map, so it must not become
  a block type. Authoring a TOC by hand would reintroduce hardcoded numbering.

## Cross-cutting requirements

Every proposal above shares three constraints, which are not negotiable:

1. **Conditioning at the item level**, never only at the block level. Atlas
   tenants diverge inside shared screens — that is the finding this whole system
   is built around.
2. **Every item carries a stable `id`**, so it can be referenced and so its
   screenshot can be named after it.
3. **No numbering in authored text.** Where a structure is numbered
   (`procedure`), the number comes from position after conditioning.

Two of them (`field-list`, `procedure`) also need an **optional image**, so a
module can be written before its screenshots exist. That is the placeholder
capability tracked separately as a pipeline gap.
