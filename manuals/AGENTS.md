# Agent Information — `manuals/`

One folder per manual. Everything here is **content and data**, never code.

## Anatomy

```
<manual-id>/
  manual.config.yaml   Axes, targets, versioning, catalogue pin
  ESTADO.md            What was DECIDED, and why — see below
  knowledge/           Extracted facts (GENERATED — never hand-edit)
  sections/            Authored content, a tree of fragments
  assets/figures/      Delivered images + the pending placeholder
    _pending.svg       Optional — overrides the placeholder the pipeline
                       ships for every slot not delivered yet
    _common/           One image valid for every deployment
    <tenant>/          Images made for one deployment only
  output/              Build output (gitignored)
```

Images are addressed by **slot**, never by path — content names which image a
place needs, the build decides where the file lives. See the
`module-completeness` skill for the rule and the naming convention.

## `ESTADO.md` — decisions, never progress

A manual is written across many sessions by agents that share no memory. This
file is the only thing that carries intent from one to the next, so what goes in
it is narrow on purpose.

**Progress is derivable, so it is never written down.** Which sections exist,
how many images are outstanding, which parts of the product the manual is waiting
on, what was committed — `sections/`, `knowledge/module-map.json`,
`image-requests.json`, `awaiting-product.json` and `git log` already answer
those, and they cannot be stale because they *are* the state.

That last one is the newest and the one most likely to be written here by habit.
A part of the product that is on screen but unfinished — which the manual
therefore documents around without naming — is **declared** in its section's
`pending` list and exported by `manualforge awaiting`. It is not narrated
here. Two of them were, as open questions, and two more sections were written
over them before either was chased; that is what a queue is for and prose is not.
What still belongs here is the DECISION about how such a part is handled, which
is not derivable from anything.

**Decisions are not derivable, so they go here:**

- Which module or section comes next, and **why that one**.
- What module inventory was agreed, if any was. Nothing in this repository
  declares a manual's full module list — the map emits tenants, capabilities and
  deployment references, never a list of modules — so an agreed scope exists
  only if it was written down.
- What was ruled out, and the reason. An option discarded without one gets
  proposed again next session.
- What is unresolved, and what would settle it.

Where this file and the disk disagree, **the disk wins**. This is text somebody
wrote, not a verified fact. A log that restates derivable progress goes stale on
the first revert and is believed anyway, which is worse than having no log.

Write or update it **at the end of a working session, before the turn ends** —
not as work happens, or it records intentions that were then abandoned.

It sits beside `AGENTS.md` rather than inside it because that file is timeless
product knowledge, and a status section rewritten every session would churn the
one file agents read for rules.

## Content language

Manual content is **Spanish**, neutral and formal ("Diríjase a…", "Haga clic
en…"). No regionalisms, no voseo, no second-person familiar.

**Ids and section filenames are Spanish too**, because they name this manual's own
subject matter: `mapa.capa.trafico`, `bot.alarmas.como-llegar`,
`10-fuerzas-en-campo.yaml`. Product acronyms and words the interface itself
borrows are written the way the product writes them — `cctv`, `ptz`, `avl`,
`barra.dashboard`. Whoever debugs a build reads an id beside the content it points
at, and a translated id makes that harder for no gain.

**The machinery is English**: config keys and block props (`when`, `rows`,
`widthPercent`), block type names, code comments, commit messages, and
infrastructure filenames (`manual.config.yaml`, `image-requests.json`). Those
belong to the pipeline, which is shared by every manual and every product, so
they cannot follow one manual's language.

## Skills that govern work here

Read these before writing content. They own their rules; this file does not
restate them, because a rule stated twice is a rule that drifts.

| Skill | Owns |
|---|---|
| `module-completeness` | When a module is finished, and the image rule |
| `block-authoring` | Choosing and filling a block type |
| `tenant-conditioning` | Tagging content per deployment |
| `source-extraction` | Getting facts out of the product |
| `source-assets` | Taking images from the product's own asset files |

Two more exist and are **not** part of that set, because they apply only when a
condition holds:

| Skill | Read it only when |
|---|---|
| `delivery-summary` | A version is being promoted to an official delivery and its change-log row has no description yet. The wizard invokes it and says which of its two modes applies; it is never read while authoring content, because it writes about the manual rather than about the product. |
| `manual-import` | The product ships a legacy manual that has to be migrated. A manual built from the product directly never needs it, and Atlas's own import is long done — so this is the cold path, and its detail has not been audited the way the five above have. Treat what it says beyond the seven step headings as unverified. |

## Authoring rules

These follow directly from the architecture. Breaking one does not produce a
warning; it produces a wrong manual for some tenant.

1. **Never write a number.** Not `5.2`, not `Figura 7.1.3`, not "see section 4".
   Numbering is assigned per build target. Reference by stable id.
2. **Never write an anchor or slug.** Same reason.
3. **Tag conditioning at the smallest unit that varies** — a fragment, a table
   row, a step. Tagging a whole section when one row differs is what produced
   the single packed document this system replaces.
4. **Quote UI labels from i18n, never by hand.** If the screen says it, the
   manual sources it from the product's translation catalogue.
5. **Use a block from the catalogue.** If the content does not fit one, request
   a new block type. Do not improvise a layout — one hand-rolled table and the
   scalability is gone.
6. **Never hand-edit `knowledge/`.** It is generated. Fix the extractor.
7. **Assert nothing untraceable.** If a claim cannot be traced to the module map
   or to a reviewed screenshot, it does not go in.

## Figures

Named by the id of the block that owns them, never by number. A figure whose
filename is `7-1-3.png` breaks the moment a tenant does not see module 7.

## Versioning

**The version is not yours to move. The owner authorises every bump, and says
so explicitly.**

This rule replaced the opposite one, so read it carefully if you remember the
old: this file used to say *"a content change bumps the version"*, and that is
exactly the behaviour being removed. An agent that corrected a figure, reworded
a paragraph or fixed a typo would raise `contentVersion` on its way past, and
the number came to mean "how much work happened here" — which is a fact about
us, not about the reader.

**A version marks a DELIVERY.** It moves when something reaches the client, and
not before. Internal work — a corrected figure, a rewritten section, a repaired
`AGENTS.md`, an entire module built over a week — moves nothing on its own. Ten
sessions of work and no delivery is ten sessions at the same version, and that
is correct, not an oversight.

So:

- **Never edit `contentVersion` on your own initiative.** Not to be tidy, not
  because the change felt big, not because the last one was long ago.
- Authorisation is the owner saying so, in the conversation, about this change.
  Silence is not authorisation. Neither is a large diff.
- When you believe a delivery has happened, **say so and stop.** Propose the
  number and what its row should read; let the owner decide.

When it does move, SemVer still applies:

- **major** — a new module, or a restructure
- **minor** — new functionality documented inside an existing module
- **patch** — a step tweak, a wording or typo fix

### Two kinds of build, and only one of them has a version

**An ordinary build is NOT a version.** It is named by a working number, and
every run makes a new one rather than overwriting the last:

```
manual-operador-beacon-todas-las-agencias-trabajo-08.pdf
```

Its running header says the same thing on every page:
`BEACON360  |  Manual de operador  |  v1.0.0 · trabajo 08`. The `v1.0.0` is the
version this content is an iteration OF — the last one written in the table —
and `trabajo 08` is what says this file is not it.

That split replaced a rule where every build was named after the highest
change-log row. It could not hold: work continues after a delivery, so the day
after one, every build carried a name that already belonged to the client's copy.
A marker called `-NO-ENTREGADO` existed to label the ones that were lying, and it
is gone along with the collision it covered.

- The counter is **per manual, allocated once per build run** —
  `nextWorkNumber` in `packages/cli/src/naming.ts`. Every target that run
  renders shares it, so **two files with the same number are always the same
  content**.
- It is read off the filenames in `output/`, which is gitignored and disposable.
  A fresh clone starts at 1, correctly: it has no working builds to be the ninth
  of.
- Expect **gaps**. `build --tenant north` spends a number on `north` alone, so `south`'s
  newest can sit at 08 while `north` is at 09. The gap is true — run 09 did not
  include `south`.

**An official build is named by a version, and only a delivery makes one.** No
`…-v1.0.1.pdf` exists until `deliver` renders it, which removes the whole class
of mistake where a file named after a version was built from different content.

### Running a build

`pnpm manuales` → "Construir un manual", or `manualforge build <manual>`
directly. The wizard asks two things: which document, and what to generate.

**Nothing but the PDF comes out by default.** The other two are opt-in and stay
that way, because both cost something a normal iteration should not pay:

| Choice | Flags | For |
|---|---|---|
| The document, nothing else | — | Us, checking our own work |
| The document and its Word | `--docx` | A review that needs the .docx; it is much slower |
| Draft for the capture team | `--draft --pending-table` | Whoever takes the screenshots |

The draft and the pending-image table travel **together**, deliberately: they go
to the same people, and both `COMO-ENTREGAR-IMAGENES.md` files tell them to use
both. Offering them separately invites handing over half of what those documents
describe.

Building the WHOLE manual is offered first, because the working number is
allocated once per run — so every target built together shares it, and equal
numbers meaning equal content is the one property the counter buys. A filtered
run is still offered; the gap it leaves in the other target's numbering is true,
not untidy.

### Where the printed version comes from

**The change log is the source of truth, not `manual.config.yaml`.** The cover,
the running header and an official build's FILENAME all print the highest row of
that target's change log — `deliveredVersion` in `packages/cli/src/main.ts`.

It has to work that way, because the delivered version is **per target** and
`contentVersion` is one scalar per manual. `atlas` proves it: its table
gives `north` a row at 1.1.0 that `south` never receives, so `south` stops at 1.0.0 and
the two deliver as `manual-operador-north-v1.1.0.pdf` and
`manual-operador-south-v1.0.0.pdf` off the same config. No single field can say
that.

Two consequences worth holding on to:

- **`contentVersion` is now only a FALLBACK**, used by manuals that have no
  change log at all (`_catalog`, `beacon-primera-entrega`). Editing it in a
  manual that has one changes nothing on the page. To move a delivered version
  you add a row — which is the authorisation made visible.
- **Change log rows must ASCEND**, and the build enforces it. The version is
  read from the highest row and the reader reads the last one; ascending order
  is what keeps those the same fact, so the cover always matches the bottom of
  the table.

### How a delivery actually runs

The order is not a preference. **The row is written and committed BEFORE the
official document renders**, because the version on the cover is read from the
highest row — so a row written afterwards would ship a PDF whose own history has
a blank description, which is the one place a client is certain to look.

Run it from the wizard (`pnpm manuales` → "Versionar un manual"), which asks two
questions and nothing more:

1. **Which document** — a manual narrowed to one target, because their delivery
   histories are independent. There is deliberately no question about *which
   build* to promote: the renderer reads `sections/`, not a PDF, so the only
   content it can render is the content that is there now.
2. **Which version**, TYPED, in `N.N.N` form. A new delivery is by definition a
   number nothing on disk has yet, so there is nothing to pick from.
   `checkTypedVersion` (`packages/cli/src/delivery-state.ts`) answers every way
   of being wrong and re-asks instead of exiting.

Then, after one confirmation that spells out everything that follows:

```
fila escrita y commiteada  ->  build oficial  ->  archivo en deliveries/  ->  sello commiteado
```

**The stamp commits itself**, and that is not a convenience. The stamp is the
only thing that makes an archived file verifiable, so leaving it uncommitted
opened a window where the delivery was permanent — `archive` refuses to
overwrite — while the proof of it could still vanish under a `git checkout`.
That window is what the proof exists to close.

It is safe there and would not be in general, for one reason: `deliver` refuses
to start on a dirty tree, so its own stamp is the only change in existence by
the time it commits. Nothing unrelated can be swept in. And of every step in a
delivery it is the least irreversible — a commit can be amended, an archived
file cannot be un-archived.

### Undoing a delivery, and the one question that decides it

`pnpm manuales` → "Deshacer una entrega que no salió". It deletes the archived
files, takes that target's proof off the row, and commits the undo.

**It asks whether the document reached anybody, and the answer is a gate, not a
warning.** The question is about the WORLD, because the repository cannot know
it — only the person who ran the delivery does.

- **It reached someone** → refused. A delivered document is superseded by a new
  version, never unpublished. Erasing its proof would leave this repository
  asserting that something a client is holding does not exist, and the next time
  anyone asks "which version does the client have?" the answer would be false.
  Offering an override here would make every other guard in the pipeline
  decorative.
- **It never left** → the only wrong record is about our own machinery, and that
  is worth removing rather than preserving.

Two properties worth holding on to:

- **It never rewrites history.** The stamp's commit stays and a commit undoing
  it is added, so a reader can tell "never delivered" from "delivered and
  undone". A clean history bought by erasing a commit answers that question
  wrong.
- **It is PER TARGET**, because the proof is. Undoing `north` leaves `south`'s proof
  and `south`'s archived bytes exactly where they were; the `delivered` block goes
  only when its last target does.

### The proof is keyed by target, all the way down

```yaml
delivered:
  todas-las-agencias:
    commit: 9348ddb
    files:
      manual-operador-beacon-todas-las-agencias-v1.0.0.pdf: ed8cb65f…
      manual-operador-beacon-todas-las-agencias-v1.0.0.docx: 4e05ad53…
  agencia-propia:
    commit: 274e66f
    files:
      manual-operador-beacon-agencia-propia-v1.0.0.pdf: aaaaaaaa…
```

`commit` sat above `files` once, ONE per row, and that single field broke three
ways at the same time — all three because it described the row when the fact it
describes belongs to a target:

- Delivering the same version to a second target wrote a **second `delivered:`
  key** into one mapping. YAML rejects duplicate keys, so the manual stopped
  parsing — and that failure landed *after* the files were archived and
  committed, which is the worst possible moment.
- Merging into the existing block instead would have **anchored the second
  target to the first one's commit**, sending its next summary to diff from a
  point it was never built at.
- Every reader asking "was this delivered?" got a **row-level answer**, so
  `agencia-propia` — which had received nothing — was told 1.0.0 "ya fue
  entregada". A refusal built on a false statement.

A target can be handed a version long after another one got it. Nothing about
the proof belongs above the target.

Afterwards that version is deliverable again with nothing else to do — the row
and its description are untouched, so `classifyDelivery` simply returns `stamp`
for it once more.

**A version that already has a row is the SIMPLEST delivery, not a rejection.**
Every manual in this repository sits in exactly that state — rows written, none
handed over — so the first delivery of each is a version its table already
declares. There is nothing to summarise and no agent runs; the row is stamped and
that is all. Only a version with NO row needs one written, and writing it is
judgement (`delivery-summary`).

### The change log is written by hand, and that is deliberate

This file used to say changelogs are generated from git history because
hand-maintained ones drift. That still holds — **for a log of commits**, which
is what that sentence was about.

The `change-log` block is a different object. It is the manual's DELIVERY
history: a handful of rows, one per version the client received, each carrying a
sentence the client can read. Git history cannot produce that, because git does
not know which commits were delivered — only the owner does, which is the same
fact that makes the authorisation rule necessary.

Every manual ends with it:

- It lives in the manual's **final module**, always, and there is exactly one
  per manual. The build enforces both.
- It is the **only** module that opens with no figure. Everything else in
  `module-completeness` still applies; that one rule does not reach a module
  about the manual rather than about a screen.
- Its rows condition per target, so one manual's two tenants can hold different
  delivery histories. A version delivered to one and not the other is normal.
