---
name: tenant-conditioning
description: Rules for tagging manual content so each tenant's PDF contains only what that tenant sees. Covers choosing the right granularity, tagging table rows and individual steps, avoiding cross-tenant references, and why numbering and anchors must never be written by hand. Use when authoring or editing manual content, tagging fragments for a deployment, reviewing tenant coverage, or fixing a manual that shows the wrong content for a tenant.
license: MIT
metadata:
  author: daniospina
  version: "1.0"
---

# Conditioning manual content

Each tenant gets its own PDF containing only its own content. No badges, no
"not available in your deployment", no trace that other deployments exist. The
reader must not be able to tell.

Everything below follows from that.

## Rule 1 — tag at the smallest unit that varies

This is the rule that matters most, and the one most often broken.

Tenant divergence in Atlas products is mostly **element-level inside shared
screens**: a map layer only NORTH sees, a filter only SOUTH has, a report column
specific to METRO. Every tenant opens the same screen.

So:

- ❌ Tagging a whole section because one table row differs
- ✅ Tagging that row

Over-tagging is how a manual ends up either hiding content from tenants who need
it, or — the usual outcome — being written once with everything packed together
because separating it got too hard. That packed document is exactly what this
system replaces.

**Every unit can be tagged**: a section, a fragment, a step in a procedure, a
row in a data table, a single figure.

## Rule 2 — never write a number, an anchor or a slug

If a tenant does not see module 6, its module 7 becomes 6.

Therefore any of these, written by hand, is broken for someone:

- ❌ `5.2`, `Figura 7.1.3`, "consulte la sección 4"
- ❌ `#52-semforos-y-ars` or any slug
- ✅ reference by stable id — the build resolves it to that tenant's number

There is no exception. Not "just this once", not in a caption, not in a
sentence. A number typed into content is a number that is wrong for at least one
tenant.

## Rule 3 — never reference across a boundary

A reference from content one tenant sees to content it does not is a dangling
link in that tenant's PDF.

Before referencing another node, ask: **is that node visible to every tenant
that can see this one?** If not, either widen the target's tenants or restate
the information locally.

**Nothing catches this today.** The `ref` node is defined in the AST and is
resolved by no renderer, so a reference across a boundary is not rejected — it
reaches the deployment's PDF. Until that check exists you are the validation, and
the only way to see it is to read the built output for each deployment.

What IS enforced, at build time: a literal number, an outline reference or an
anchor written into content is rejected outright (`core/load.ts`). Rule 2 has
teeth. Rule 3 does not.

## Rule 4 — default to "all", narrow deliberately

Untagged content applies everywhere. That is the right default: most content is
shared.

Narrow only with evidence from the module map. **Never narrow because it "feels
tenant-specific"** — that guess is how content silently disappears from a
client's manual, and nobody notices until the client does.

## Rule 5 — the module map decides, not the legacy manual

Tenant metadata in the legacy manual — for atlas, `docs/manual-usuario.md`
inside the **source product repository**, not in this one — is mostly
`_(por definir)_` or `Todos`. It is not evidence. Rebuild tagging from the
manual's own `knowledge/module-map.json`.

## Data tables

A table whose rows vary by tenant is **data**, not prose. Each row carries its
own selector and the table renumbers itself after filtering. This is the shape
that ships, copied from `manuals/atlas/sections/07-interfaz-general.yaml`:

```yaml
rows:
  - id: mapa.capa.trafico
    label: Tráfico
    description: >-
      Muestra el estado del tráfico en tiempo real sobre la vía.
  # LayersMap.tsx:76 — the entry only exists when
  # `config.name === "NORTH" || config.name === "DEMO"`.
  - id: mapa.capa.avl
    label: AVL
    description: >-
      Muestra la ubicación en tiempo real de los vehículos con
      seguimiento automático.
    when:
      tenant: [north, demo]
```

Three things in there are not optional:

- **The key is `when`, and it holds a map of axis to a LIST of values.** Not
  `tenants: [north]`, not a bare scalar `tenant: north`. `conditioning.ts` rejects the
  scalar on purpose: unvalidated it turns `Array#includes` into `String#includes`,
  which matches substrings instead of values and **leaks content across tenants**.
- **An untagged row needs no `when` at all.** Omitted means "every value of every
  axis" — that is the default, and `[all]` is not something you write to get it.
- **Every tagged row carries a provenance comment above it**, naming the file, the
  line, and the literal expression in the product that gates it. That comment is
  Rule 4 made practice: it is how the next author checks the tag instead of
  trusting it, and how a drift report proves the tag still matches the code.

Hand-written Markdown tables with tenant-varying rows are not maintainable.
Do not create them.

## Before you finish

**There is no `coverage` command.** The CLI accepts `build`, `images`, `extract`
and `capture` — nothing else. A coverage report was designed to answer the three
questions below and was never built, so today you answer them by hand, from one
build per deployment. Answer them anyway; these are the checks that catch a tag
that is wrong rather than merely invalid:

- **Dead content** — tagged so narrowly no tenant sees it. Either the tag is
  wrong or the content should go.
- **Thin tenants** — a tenant with far less content than its peers. Usually
  over-tagging, not a genuinely smaller product.
- **Cross-target references** — must be zero, and **nothing checks this for
  you**. See Rule 3.

Then read one tenant's build end to end. Numbering gaps, dangling references and
paragraphs that assume missing context are obvious in the output and invisible
in the source.
