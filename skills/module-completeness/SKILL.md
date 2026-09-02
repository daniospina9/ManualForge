---
name: module-completeness
description: Defines when a manual module is finished — every submodule covered, each opening with an overview figure of the whole screen and then stating what it does, how to reach it, its main functions, its step-by-step procedures and the control the operator must press. Also covers the image rule: content declares image slots, never file paths, and every declared slot always renders — the delivered image, or one temporary placeholder holding its place until an external team supplies it. Use when writing a new module, extending an existing one, reviewing a module before it ships, deciding whether a section is complete, naming images so they can be synchronised from an external folder, or working out which images an external team must produce. Also covers the third kind of gap: a screen the PRODUCT has not finished, which the manual documents around without naming and declares in the section's `pending` list for the `awaiting` queue.
license: MIT
metadata:
  author: daniospina
  version: "2.3"
---

# When a module is finished

A module is not finished when it reads well. It is finished when an operator
who has never opened the product can do their job with it.

That is the standard everything below serves.

## The coverage rule

**Every submodule the product offers must be covered. No exceptions, no
"the main ones".**

A module that names six sections and explains two is not a partial module — it
is a broken one. The reader cannot tell that four sections were skipped; they
conclude those sections do not matter, or that the manual is wrong.

Before writing, list the submodules from `knowledge/module-map.json` (or, until
the map exists, from the product's own navigation). That list is the checklist.
Cover it or state explicitly why an item is out of scope.

## Every module and every submodule opens with an overview figure

**Before any table, any procedure, any detail: one image of the whole thing.**

A reader arriving at a module has no picture of it. Text alone forces them to
assemble the screen in their head from a paragraph, and they will assemble it
wrong. The company's manuals have always opened this way, and it is the first
thing an operator uses to confirm they are looking at the right screen.

It applies at BOTH levels, and the second is the one that gets forgotten:

- **The module** — the whole screen, so the reader recognises where they are.
- **Each submodule** — the section as it appears once opened, before its detail.

A module that goes straight from one paragraph into its first submodule has
skipped this. So has a submodule that names what it does and then drops the
reader into a nine-column table.

Placement is fixed: after *what it does* and *how to reach it*, before the first
table, list or procedure. The reader learns what it is, how to get there, sees
it, and only then works through it.

The figure is a `figure` block with `widthPercent: 90` and a caption saying what
the image shows — not the section's own title again, which the heading above it
already gave. The slot stays pending until someone captures it, like any other,
and that is fine: it is declared, the manifest asks for it, and the placeholder
holds its place.

## What every submodule needs

Six things. Skip one and the operator is left guessing.

### 1. What it does

One or two sentences. Its purpose, not its contents. `field-list` item text, or
a `prose` paragraph under a subsection.

> *La sección Monitoreo muestra el estado de comunicación de cada panel
> desplegado en la vía.*

### 2. How to reach it

The path from where the operator is standing, in the product's own words.

> *Diríjase a **PMV › Programación** desde el panel lateral.*

If you cannot establish the route from source, **say nothing** rather than
guessing. A wrong route costs more than a missing one.

### 3. What it looks like

The overview figure described above, in its fixed position: after the route,
before the detail.

### 4. Main functions

What the operator can actually do there. A `field-list` when each function
needs a paragraph and a screenshot; a `term-list` when one line each is enough;
a `data-table` when the reader will scan rather than read.

### 5. Step by step

Every procedure the operator performs, as a `procedure` block. Each step names
**the control to press** and carries its image.

Never write the ordinal into a step title: numbering is assigned after
conditioning, so a deployment that skips a step sees the rest shift up.

#### Where the step's image goes

A step declares `layout: below` (the default) or `layout: beside` — text on the
left, image on the right. Use `beside` when the explanations are short: an image
stacked under two lines of prose leaves a band of empty page beside it, and a
procedure of those is mostly white.

**An image made of more than one screenshot never goes beside the text.** A
composite — a collapsed row with its open panel, three views of a control side by
side — carries several times the detail of a single capture, and the beside column
is 42% of the page. Measured on this manual: a 369x139 composite of case ids
rendered there is unreadable, while a plain 369x101 audio bar at a *wider* ratio
reads fine. Aspect is not the signal and neither is file size; the number of
screenshots is. Put it below the paragraph at full width and take the exception to
the rule below.

**Within one procedure, every step uses the same layout.** This is not a
preference. A sequence with one step's figure right-aligned and the next two
centred makes the eye jump, and the odd one out reads as a different kind of
thing — tried, looked wrong, and that is why the rule exists. Pick per procedure
by looking at its shortest step, then apply it to all of them.

A `field-list` takes the same prop and is NOT bound by that rule: its items are
independent of each other, not a sequence, so one item may sit beside its image
while another does not. A composite image is the one case where a single step may
break its procedure's rhythm — an unreadable figure is worse than an uneven page.

### 6. What to expect

Where the operator lands and what changed. A procedure that ends without
telling the reader whether it worked is unfinished.

> *Al guardar, la plataforma lo redirige a **PMV › Gestión**, donde el mensaje
> queda listado.*

## When the PRODUCT has not finished it

A third kind of gap, and it is neither of the other two. A pipeline defect is
fixed in `packages/`; a content defect is fixed in `manuals/`. This one is a
screen that is **on display and showing fabricated data**.

Not an empty screen — an empty screen is easy, you describe the empty state. The
hard case is the one that fills itself with plausible content: a status dot whose
colour comes from the row's index, a "last connection" time that is a literal
string, seven integration cards with no query behind them.

**Both ways of writing about it are statements about the product, not about the
manual:**

- Document the control as working → the manual lies to the reader, who will make
  operational decisions on it.
- Document it as not working → the manual publishes a product defect list inside
  a document marked Confidential.

Neither is the author's call, so **the manual waits.**

### What to do

1. **Document everything around it, in full.** The real parts of that screen get
   the same treatment as anything else.
2. **Name none of the broken part.** Not with a warning, not with "will be
   documented later" — a promise in a client PDF is still a leak that something
   is unfinished.
3. **Declare it** in the section's `pending` list, with `covers`, `missing`,
   `because` (file and line in the source product) and `settles`. Every field is
   required.
4. **Export the queue** with `manualforge awaiting <manual>`, which writes
   `awaiting-product.json` beside the manual, and commit it.

The declaration never reaches the AST, so no renderer can print it. That is the
load-bearing property, not a filing preference: the whole policy is that the
manual names none of this, and a declaration that could render would publish
exactly what it exists to withhold.

### Why declared and not narrated

This is the coverage rule's own escape hatch — *"cover it, or state explicitly
why an item is out of scope"* — with a shape a command can read. The statement
used to be a comment in the section header and a question in `ESTADO.md`, and
that did not hold: two gaps were recorded that way and two more sections were
written over them before either was chased.

`awaiting-product.json` is the sibling of `image-requests.json` and works the
same way. Content DECLARES, the pipeline DERIVES, and neither list is maintained
by hand. It is likewise **not build output** — `build` reports the count and
writes nothing, because a queue only whoever last ran a build can see is not a
queue.

### Closing an entry

An entry leaves the queue when somebody **deletes its declaration**, having
written the content it withheld. Nothing detects that the product was fixed:
that needs a check against the source — whether a fixture became a query — and
for a product with no extractor there is no such check yet. Until there is, the
two checks that surface these by hand are `grep` for `MOCK`, and reading the
mapping between the query and what is rendered. English placeholder copy in a
Spanish product is the loudest tell.

**A section with an entry in that queue is NOT complete**, and must not be
counted as done.

## The image rule

**A declared slot always renders. The delivered image, or the placeholder
holding its place. Never a blank gap.**

Images are produced and updated by a different area of the company and arrive
later, so a module is normally written before a single capture exists. That is
not a reason to leave the page empty: a gap reads as finished content and the
reader has no way to detect the lie.

| State | Renders as |
|---|---|
| Delivered | The image |
| Pending | `_pending.svg` — one temporary image, identical in every slot |

The placeholder is deliberately the same everywhere. It is a *shape held open*,
not a description of what is missing: every slot sits directly under the thing
it depicts — a field's label, a step's title, a figure's caption, a row's label
— so the page already says which image is coming.

Never write a slot id into content. The PDF is client-facing (invariant 4) and a
slot id is a trace of the pipeline.

### Two builds, because two people read this document

Whoever captures the screenshots works from the PDF in hand and has no other way
to know what to call the file. Whoever receives the manual must not see a path
from our repository in a document marked Confidential. Both are true, so there
are two builds of the same content:

| Build | Named | Pending images render as | For |
|---|---|---|---|
| `build <manual>` | `…-trabajo-08.pdf` | The placeholder, nothing else | Us, checking our own work |
| `build <manual> --draft` | `…-trabajo-08-BORRADOR.pdf` | The placeholder **plus the exact filename to deliver it under** | Whoever takes the captures |
| `deliver <manual> --version <N.N.N>` | `…-v1.0.1.pdf` | The placeholder, nothing else | The client |

**No ordinary build is the client's document.** A build is named by its working
number and every run makes a new one; only a delivery writes a version-named
file, and it renders that file itself. So a `…-v1.0.1.pdf` on disk always means
a delivery happened. See `manuals/AGENTS.md`, "Two kinds of build".

The draft is marked at every level so it cannot be handed over by accident: its
filename gains `-BORRADOR`, its cover reads BORRADOR INTERNO, and its running
header says NO DISTRIBUIR. You have to ask for the draft; the plain build is the
default.

Give the capture team the draft PDF **and** the request document. The PDF shows
them where each image goes and what to name it; the document is the full list
with what each one shows and which deployments need it.

### Where an image belongs

- **A control the operator must press** — always. If clicking a button opens a
  panel, the button's image goes beside the instruction. This is the single
  most useful thing the manual does, and it is what the source manual does
  throughout.
- **The screen a module or submodule opens on** — always. That is the overview
  figure above, and it is the one image a reader looks for first.
- **Any other screen the operator must recognise** — usually.
- **Decoration** — never. An image that carries no information costs a page and
  a delivery request.

### Two conventions, and no third

**Every image in the manual is one of exactly two things.** There is no third
kind, and a bare centred screenshot with nothing under it is not one — it is the
absence of a convention, because nothing can refer to it.

| Convention | Looks like | Numbered |
|---|---|---|
| **Figure** | The image, with a caption underneath | `Figura <section>.<n>`, one sequence per top-level section |
| **Icon** | A control's icon in an icon table's first column | No — the row's label names it |

Everything outside a table is a figure: a standalone illustration, an element's
screenshot, the control a step tells the operator to press. They all share one
counter per top-level section, so a `figure` block and a procedure step's
screenshot interleave in reading order instead of running two sequences.

| Block | Image slot | Declared | Caption comes from |
|---|---|---|---|
| `figure` | The image itself | Always — omit the prop | its `caption` |
| `field-list` | One per item | Always — omit the prop | the item's `label` |
| `procedure` | One per step | Always — omit the prop | the step's `title` |
| `icon-table` | Icon column, one per row | Always — omit the prop | — (icon convention) |
| `term-list` | One per entry | Opt-in — write `image: true` | the entry's `term` |
| `prose` | **None** | — | — |

"Always" means the slot exists whether or not you write anything: leave the prop
out and it is derived. `prose` carries no image at all — an illustrated paragraph
is a paragraph followed by a `figure`, which is what `figure` is for.

You never write a caption for an item's image. It is the label or title already
there, so the caption cannot drift from the thing it captions.

## Content declares slots, never files

**Never write a filename or a path into content.** Not `home-overview.png`, not
`icons/search.png`. The build refuses it, and the refusal is the point.

A path cannot answer the two questions this pipeline exists to answer:

- The same screen does not look identical in every deployment, so one path
  cannot serve six tenants.
- The images arrive later, from somebody else, so there has to be a stable key
  to deliver and re-synchronise against. A path buried in a content file is not
  that key.

### The naming convention

**A slot's name is the id of the node that carries it.** Nothing to invent: node
ids already exist, are already unique, are already validated, and are never
positional — so a slot never shifts when a section moves.

Write an explicit slot name **only** to share one delivered image between two
places (`image: barra.busqueda`). Otherwise omit the prop.

A slot's dots become folders, so the delivered tree mirrors the manual:

```
barra.filtro.fig  ->  barra/filtro/fig.png
```

Resolution, per deployment, in order:

| Looked up | Meaning |
|---|---|
| `<tenant>/<slot path>.<ext>` | An image made for that one deployment |
| `_common/<slot path>.<ext>` | One image valid for every deployment — **prefer this** |
| `_pending.svg` | Not delivered yet |

Prefer `_common`: most controls look identical everywhere, and six copies of one
icon are six things to update when it changes. Use a tenant folder only when the
screen genuinely differs.

The extension is not part of the slot — `png`, `jpg`, `jpeg`, `svg`, `webp` and
`gif` all resolve. Two files claiming one slot is a build error, because nothing
can tell which delivery is current.

### The image request document

`manualforge images <manual>` writes `image-requests.json` next to the
manual: every slot, what it shows, which block uses it, which deployments need
it, which ones are still missing, and **the exact path each file has to be
dropped at**. That document is the contract with the delivering area. If an image
is not in it, nobody will produce it.

It is grouped by slot, not by deployment. A control that looks identical
everywhere is one photograph, and `deliverTo.shared` is where one copy serves
every deployment; `deliverTo.override` is the template for the rare screen that
genuinely differs.

Note what it is *not*: it is not build output. `build` reports the counts but
writes no document — it leaves the repository for another team, so producing it
is an explicit act. That is also why it does not live in `output/`, which is
gitignored: a contract only whoever last ran a build can see is not a contract.

It also reports the reverse — images sitting on disk that no slot asked for.
That is the failure this whole scheme exists to catch: a delivery named
`barra/buscar.png` when the slot is `barra.busqueda` leaves the page showing a
placeholder while the build reports success. Read that list; a name that appears
there is a name nobody is using.

A slot delivered for one deployment and missing for another is still **pending**,
and says so in `pendingFor`. Never treat a slot as done because some deployment
has it.

## Use the catalogue, always

Content is written by instantiating the structures in
`packages/blocks/src/catalog/` — read that folder for the current set rather than
trusting a count written here, which is one more thing that drifts as the
catalogue grows. Never compose layout by hand.

If the content does not fit any of them, **request a new block type** — see the
`block-authoring` skill. One hand-rolled table is where maintainability starts
to rot: it cannot be restyled, cannot be conditioned reliably, and cannot be
validated.

## Conditioning still applies

Everything here composes with the `tenant-conditioning` skill. Tag at the
smallest unit that varies — a row, a step, a field-list item — and never at
section level just because it is easier. Ground every tag in source code, never
in the legacy manual.

## Definition of done

A module ships when all of these hold:

- [ ] Every submodule the product offers is covered, or its absence is justified
- [ ] Anything left out because the PRODUCT has not finished it is declared in
      the section's `pending` list, and `awaiting` was re-exported — a gap
      recorded only in a comment is a gap nobody will chase
- [ ] Each one states what it does, how to reach it, and its main functions
- [ ] The module opens with an overview figure, and so does every submodule
- [ ] Every procedure is a `procedure` block, naming the control at each step
- [ ] All steps of one procedure share a layout — none mixes `below` and `beside`
- [ ] Every procedure says where the operator lands
- [ ] Every control the reader must press has an image slot, delivered or pending
- [ ] No image slot renders as a blank gap
- [ ] Every image is a figure or a table icon — there is no third convention
- [ ] No filename or path appears anywhere in the content
- [ ] Every claim traces to a file and line, or to the module map
- [ ] UI labels are taken from the i18n catalogue, not retyped, and each records
      the key it came from — the value alone cannot reveal label drift
- [ ] For a product with NO catalogue, every quoted label is cited in the
      section's `labels` list and `manualforge labels <manual>` reports it
      exact — a quotation in a comment is a quotation nothing checks
- [ ] No number, anchor or figure ordinal is written by hand
- [ ] Conditioning is tagged at the smallest unit that varies
- [ ] The build succeeds for every deployment
- [ ] `images` was re-exported, and reports no undeclared delivery

Anything unchecked is not a rough edge. It is the module not being done.
