---
name: source-extraction
description: Extracts a module map from a Atlas product repository into knowledge/module-map.json with file-and-line provenance for every fact. The map names the axis it describes; the command emits that axis's values, the capability matrix, and every line of code that decides along it; routes, screens and i18n labels are specified in this skill and not yet emitted. Use when onboarding a new source product, regenerating a module map, investigating how a product's deployments or permission profiles differ, or checking a manual for drift against the code it documents.
license: MIT
metadata:
  author: daniospina
  version: "1.3"
---

# Extracting a module map from a source product

The module map is the **only** bridge between product code and manual content.
Content is written against the map, never against source code read ad hoc. If a
fact is not in the map, it does not go in the manual — you add it to the map
first.

## What the map carries today

`manualforge extract <manual>` emits five keys, and only these:

| Key | Content |
|---|---|
| `source` | the source id, from the registry |
| `axis` | which axis this map describes, derived from the manual's own config |
| `values` | one row per axis value the product declares |
| `capabilities` | flag → which values declare it, plus `absentFrom` |
| `references` | every line of code that decides along that axis |

**The map NAMES its axis; it does not assume tenant.** `tenant` is one named
axis among possible others (invariant 3), and a manual conditioned on permission
profiles gets `"axis": "permission"` with its own values under the same keys.
Calling those values deployments — in the map, or in the drift report the map
produces — is the mislabelling invariant 3 exists to prevent, and the drift
report is read by whoever decides what content gets tagged with.

A map written before the axis was named carries `tenants` and `tenantReferences`
instead. `normalizeMap` (`packages/cli/src/extract.ts:123`) reads either, so the
rename is not itself a drift report; an absent `axis` is left absent rather than
defaulted to `tenant`, because that default is the assumption being removed.

**Steps 3 and 5 below — routes and screens, UI labels — are specified here and
not implemented.** Hand-adding them to the file is not a workaround: `extract`
rewrites the whole map on every run, so a hand-authored key is deleted by the
next extraction. Growing the map means growing the extractor.

Until it does, routes and labels are the one class of fact a manual cannot trace
to the map. That gap is recorded rather than papered over: closing it is a
change to the extractor and to how content references a label, not a decision to
take again in each section.

## Hard rules

1. **Read-only.** Never write anything inside the source repository. No fixes,
   no formatting, no installs.
2. **Provenance or it does not exist.** Every fact carries the file and line it
   came from. A fact you cannot point at is a guess.
3. **Never infer gating from a screen name.** `ReportsPage` tells you nothing
   about who sees it. Only code decides.
4. **Never retype a UI label.** Pull it from the i18n catalogue by key, so the
   manual quotes what the screen actually renders. If a product has no
   catalogue and renders literals, say so in the map and record the file and
   line of each literal — the label is then a quotation, not a reference, and
   the manual will not follow the product when it changes.
5. **Uncertainty is recorded, not resolved.** Emit `confidence: "low"` with a
   note. A confident wrong fact is far worse than a flagged unknown.
6. **Every shape below is one product's shape.** The examples in this skill are
   drawn from `atlas`. They are here because a concrete shape is
   teachable and an abstract one is not — never because the next product will
   match them. Establish this product's shape first (step 1); each step then
   tells you what to look for once you know what you are looking at.

## Procedure

### 1. Establish the product's shape, then read the registry

`sources/registry.yaml` gives the path and the extraction points for this
product. Paths differ per product — do not carry assumptions between them. For a
product not yet in the registry, see `sources/AGENTS.md`: the entry is written
after this survey, not before it.

Answer these before running any step below. Each one decides whether the step
that assumes it applies at all:

| Question                                         | If the answer is not the expected shape                                                                   |
| ------------------------------------------------ | --------------------------------------------------------------------------------------------------------- |
| Is it multi-tenant, and how is tenancy resolved? | Steps 2 and 4 change target, or drop entirely for a single-tenant product                                 |
| Is there an i18n catalogue?                      | Step 5 changes: labels become quoted literals with provenance (hard rule 4)                               |
| Are there declared routes?                       | Step 3 changes: without a router, map screens by entry point instead                                      |
| Does `packages/extract` handle this shape?       | See `packages/extract/AGENTS.md`. If not, extraction is manual for this product until an extractor exists |

Record the answers. They are findings, and the reviewer of the map needs them to
judge what the map does not say.

### 2. Build the tenant registry

Find the authoritative list of deployments: whatever the product treats as the
complete set, the map treats as the complete set — exactly those, no more.

_In `atlas` that is one config file per tenant, under
`src/render/config/`, and the id comes from the filename._ Another product may
resolve tenancy by subdomain, by an environment variable, by a table. Find where
the product itself enumerates them; if nothing does, that is a
`confidence: "low"` finding, not a gap to fill by guessing.

### 3. Map routes and screens

Collect route path, component, lazy entry, and any route-level gating.

_This assumes declared routes, as in `atlas`'s `AppRoutes.tsx`._ A
product without a router still has screens — map them by whatever does decide
what the user sees, and record which mechanism that was.

### 4. Find element-level tenant gating — the part that matters

**The general rule: find where divergence actually lives in THIS product, and do
not stop at the first mechanism you find.** Products rarely gate in one place,
and the visible mechanism is rarely the one carrying most of the difference.

_In `atlas`, route gating is the visible tip — exactly one route uses
it. The real differences are inline comparisons against the active tenant config
scattered through components: a map layer, a filter option, a report column, a
header action._ Elsewhere the weight may sit in route gating alone, in
server-driven feature flags, in per-tenant themes or config payloads, or in
roles rather than deployments.

So: identify every mechanism the product uses to show one user something another
does not see, then search each. For `atlas` that means direct config
name comparisons, membership checks and tenant-keyed lookups. Record, for each
finding:

- the screen and the element affected
- the tenants for which it is present
- file and line
- which mechanism it came from

**An extraction that reports only the mechanism it noticed first will claim every
tenant sees everything.** That is the failure this whole system exists to
prevent, and it is silent: the map parses, the build succeeds, and the manual
tells four deployments about a screen one of them has.

### 5. Collect UI labels

Index the i18n keys used by each screen so content can reference labels by key.

_This assumes a catalogue, as in `atlas`'s
`locales/translations/es.json`._ Without one, follow hard rule 4: record each
label as a literal with its file and line, and flag in the map that labels here
are quotations. That distinction matters downstream — a keyed label follows the
product when it changes, a quoted one does not.

**A quotation is CHECKED, not trusted, and the check is not part of this map.**
Content declares where each label came from, in the declaring section's `labels`
list, and `manualforge labels <manual>` holds every one against its line —
reporting a label that moved, and a label that is gone. That last one is the
failure this exists for: the manual telling an operator to press a control the
product renamed, while every other stage of the pipeline succeeds.

It lives there rather than here because it needs no map. The citation names a
file and a line, so the check is a substring test against that line — no
extractor, no classification, and nothing to build before it works. Which is why
a product with no catalogue can have its labels checked today, and this step's
index still is not emitted.

### 6. Emit and diff

Write `manuals/<manual>/knowledge/module-map.json`. If a previous map exists,
diff it and report:

- **added** — new modules or elements, likely undocumented
- **removed** — content documenting something gone
- **gating changed** — tenant tagging in content may now be wrong

The diff is the drift report. It is the point of regenerating the map.

`diffMaps` (`packages/cli/src/extract.ts`) compares deployments, capability
flags, and deployment gates. A gate is identified by file, deployment codes and
kind — **never by line or text**, so moving a gate down the file or rewording a
line that decides the same thing reports nothing. What it reports is a gate
appearing, disappearing, or changing polarity, which is the case that most
directly invalidates tenant tagging already written.

Modules and elements are not compared, because they are not emitted.

## Output shape

**This is the target shape, not today's file.** `modules` and everything under
it comes from steps 3 and 5, which the command does not emit — see "What the map
carries today". The block is kept because it is the contract a new extractor is
written against; deleting it would delete the specification.

The keys are the contract; the values below are `atlas`'s. `axis`,
`kind`, `i18nKey` and the value ids are that product's vocabulary — a product
conditioned on permissions has a different `axis`, one with no map layers has no
`"kind": "map-layer"`, and one with no catalogue carries a literal label plus its
source instead of an `i18nKey`.

There is deliberately **no timestamp**: the map is regenerated constantly, and a
clock would make every regeneration a diff, drowning the drift the file exists
to show (`packages/cli/src/extract.ts:385`).

```jsonc
{
  "source": "atlas",
  "axis": "tenant",
  "values": [{ "id": "north", "code": "NORTH", "source": "src/…/north.config.ts:2" }],
  "modules": [
    {
      "id": "mapa",
      "screen": "…",
      "route": "/…",
      "values": ["all"],
      "source": "src/…/AppRoutes.tsx:120",
      "elements": [
        {
          "id": "mapa.capa.semaforos",
          "kind": "map-layer",
          "label": { "i18nKey": "map.layers.traffic_lights" },
          "values": ["north"],
          "source": "src/…/LayersMap.tsx:98",
          "confidence": "high",
        },
      ],
    },
  ],
}
```

## Verify before handing off

- Every value in the map traces to wherever this product enumerates them — a
  config file in `atlas`, whatever step 1 established elsewhere.
- `axis` is the axis the manual actually declares, not `tenant` by habit.
- No element claims `["all"]` while its source line shows a comparison.
- Every `i18nKey` resolves in the catalogue; every quoted literal has a file and
  line.
- Every fact has a `source`.
- **Every mechanism found in step 1 was actually searched in step 4.** Finding a
  second gating mechanism and searching only the first is how a map ends up
  confidently wrong.
- The step 1 answers are recorded, including what could not be determined.

A map nobody reviewed is a set of confident claims nobody verified.
