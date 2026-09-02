# Agent Information — `@manualforge/extract`

Source product → facts. Pure functions over source text: this package never
opens a file. The CLI reads the disk and hands strings in
(`packages/cli/src/extract.ts`), which is what keeps the parsing testable
without a product checked out.

## This package is written for ONE product's shape

Everything here assumes `atlas`: React + TypeScript, one
`<id>.config.ts` per tenant, and route gating through an `allowedProjects` prop.
Those assumptions are in the code, not in configuration:

| Assumption | Where |
|---|---|
| Tenants are `<id>.config.ts` files | `tenant-config.ts` — the id comes from the filename |
| Route gating is a prop named `allowedProjects` | `tenant-references.ts` — `ROUTE_GATE` is a literal regex |
| Sources are `.ts/.tsx/.js/.jsx` | `packages/cli/src/extract.ts` — `SCANNED` |

**A second product does not "configure" its way in.** If it resolves tenancy by
subdomain, by a database table, or not at all, none of the above fires and the
extractor reports a product with one tenant, or none. That failure is silent:
the map parses, the build succeeds, and the manual asserts that every deployment
sees everything.

## The map names its axis; this package's parsing does not assume one

`ModuleMap` (`packages/cli/src/extract.ts`) carries `axis`, `values` and
`references` — not `tenants` and `tenantReferences`. `tenant` is one named axis
among possible others (invariant 3), and the map was the last place in the
pipeline still asserting otherwise after `condition` and `primaryAxis` had been
made agnostic.

That is why `AxisReference` is named for the axis and not for tenants: its
fields were always neutral — a file, a line, the codes named on it, what the line
does with them — and only the name claimed an answer. `CapabilityRow.values` is
keyed the same way, for the same reason.

The FINDER stays per product. `findTenantReferences` knows `atlas`'s
shape (`ROUTE_GATE` is a literal `allowedProjects` regex); a second product's
finder is a **new function returning the same type**, not a widening of that one.

## The seam that was anticipated and not built

`sources/registry.yaml` declares `framework: react-vite-ts` per source. **No
code reads that field.** It is the intended discriminator for choosing an
extractor and it is currently inert.

Adding a second product is therefore additive, not a restructure: dispatch on
`framework`, keep this implementation as the `react-vite-ts` case, and write a
new one beside it. Nothing downstream of `module-map.json` changes — `core`, the
renderers and the content layer never learn what a product is.

Do not generalise this code speculatively before a second product exists. One
concrete second shape teaches more about the right abstraction than any amount
of guessing, and a premature interface fitted to one example is just this
package with more indirection.

## Rules

- **Provenance or it does not exist.** Every fact carries the file and line it
  came from. A fact you cannot point at is a guess.
- **Uncertainty is recorded, not resolved.** Emit `confidence: "low"` with a
  note. A confident wrong fact is far worse than a flagged unknown.
- **Never infer gating from a name.** `ReportsPage` says nothing about who sees
  it. Only code decides.
- **Pure.** No `node:fs`, no network, no clock. The CLI owns all of that.

## Testing

Written test-first. Parsing decides what a manual is allowed to claim, so every
shape this package recognises — and every shape it deliberately refuses — is a
test. See `skills/source-extraction/SKILL.md` for the extraction procedure these
functions serve.
