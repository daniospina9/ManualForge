---
name: delivery-summary
description: Writes a new row of a manual's Historial de cambios and then runs the delivery it belongs to — the sentence a client reads to learn what a version changed, committed BEFORE the official document renders, because the cover prints the highest row. Two modes, chosen for you by the wizard that invokes it: a FIRST delivery describes what the manual covers, since there is nothing to diff against; a LATER one reads `git log <previous-delivery-commit>..HEAD` and reports only what changed for the READER. Use when promoting a manual to an official delivery, when a change-log row is missing its description, or when asked to summarise what a version changed for a client. Not needed when the row already exists: `deliver` stamps it with no agent involved.
license: MIT
metadata:
  author: daniospina
  version: "1.0"
---

# Writing a delivery's row

One row of the `change-log` block, in a manual's final module. You write the row
**whole** — `id`, `version`, `date`, `description` — and the field that takes
judgement is `description`. The `delivered` block underneath it is written by
`manualforge deliver`, afterwards, and is never yours to touch.

## The row comes first, and that ordering is not a preference

The version printed on the cover is read from the highest change-log row, so the
row has to exist and be **committed** before the official document renders.
Written afterwards, it would ship a PDF whose own history carries a blank
description — the one place a client is certain to look.

So when the wizard hands you a delivery, it is three steps in this order:

1. Write the row (this skill).
2. Commit it. The delivery's proof records the commit the document came from, and
   the row is part of the document. Step 3 refuses to start on a dirty tree, so
   without this commit there is no delivery at all.
3. Run the delivery. It builds the official PDF and Word file, archives them in
   `deliveries/`, stamps the hashes onto your row, and **commits the stamp
   itself** — there is no fourth step:
   `node packages/cli/src/main.ts deliver <manual> --version <N.N.N> --axis <axis>=<value>`

The two commits are not symmetric, which is why one is yours and one is not.
Your row carries judgement, so committing it is part of writing it. The stamp
carries none — version, commit, hashes, all derived — and it is the only thing
that makes the archived file verifiable, so leaving it for a step that can be
forgotten was the defect.

**The owner already authorised the delivery** in the wizard, with that version
and that document. Do not ask again. If any step refuses, STOP and report what it
said — a half-finished delivery is worse than none, because archived files are
never overwritten.

Nothing above applies when the row already exists: then `deliver` stamps it and
no agent is involved at all.

## The only question that matters

**Would the reader notice, opening the manual?**

That is the whole filter, and it is harsher than it sounds. Most of what a
delivery contains is invisible to a client, because most of our work is about
how we make manuals rather than about what a manual says.

A worked example, from a real session that produced twelve commits:

| Commit | Does the reader notice |
|---|---|
| a new module in the manual | **Yes** — there is a chapter that was not there |
| fifteen figures delivered | **Yes** — grey placeholders became screenshots |
| Word figures no longer overflow the page | **Yes** — they were unreadable |
| a new block type in the catalogue | No |
| the version now derives from the change log | No |
| the pending-image sheet for the capture team | No |
| an `AGENTS.md` that was telling the next agent something false | No |

**Three or four of twelve.** That ratio is normal. A row listing all twelve
would be a changelog of our repository, which is not what a client is holding.

## What a reader notices

- A module added, removed or restructured
- Procedures that changed — different steps, a different order, a control that
  moved
- Figures that appeared where a placeholder was, or that were replaced
- A correction to something the manual **said** that was wrong
- Content that was withdrawn, and this one is easy to forget: a reader who had
  a section and no longer has it deserves to be told

## What a reader does not

Block types, renderers, the build, the CLI, guards, skills, `AGENTS.md`, capture
tooling, the pending-image sheets, how versions are numbered. **A change to how
we work is not a change to the manual — even when it shows on the cover.**

## The two modes

The wizard tells you which. Do not choose.

### `summarise-since` — there is a previous delivery

Read `git log <commit>..HEAD`, where the commit is the one the prompt names. It
is the commit the last delivered file was built from, so that range is exactly
what the client has not seen.

Read the **diffs**, not only the subjects. A commit subject describes the work;
the diff shows whether a reader is affected. A commit titled as a fix to the
pipeline sometimes changes what a figure looks like, and a commit titled as
content sometimes only moves a comment.

Restrict yourself to that manual's own directory plus anything that visibly
changed its output. Another manual's commits are not this manual's history.

### `summarise-first` — nothing was delivered before

There is no diff to take, so do not manufacture one. Describe **what the manual
covers**: name its modules, in reading order, in one sentence. The reader is
opening this document for the first time and wants to know what is in it.

Read `sections/*.yaml` for the module titles. Do not read them off a build.

## How the sentence reads

- **Spanish**, neutral and formal, like the rest of the manual.
- **One or two sentences.** This is a table cell a reader scans, not a release
  note. If it needs three, you are listing instead of summarising.
- **In the past, about the document**: "Incorpora…", "Actualiza…", "Corrige…".
- Name modules as the manual names them — `Fuerzas en Campo`, not `forces`.
- No commit hashes, no filenames, no slot ids, no version numbers other than
  the row's own.
- Inline `**bold**` is available and is worth using on a module name.

Two rows already written, as the register to match:

> Versión actual documentada en este manual. Incluye mejoras en interfaz, Call
> AI, Fuerzas en Campo y Security Dashboard.

> Incorpora el módulo Atlas of Things, con la gestión de dispositivos en
> campo.

## Never invent a change

If the range holds nothing a reader would notice, **say so and stop** — report
it to whoever asked rather than writing a sentence to fill the cell. A delivery
that changed nothing visible is a real thing; a manufactured novelty in a
permanent record is not, and the record is what this whole flow exists to
protect.

Same if the range is empty, or the commit the prompt names is not in the
history. Both mean the anchor is wrong, and a summary written from a wrong
anchor is worse than none.

## Where it goes

The manual's final module, the section whose block is `type: change-log`. Find
it by reading — it sorts last, but its number differs per manual
(`08-historial-de-cambios.yaml` in beacon, `13-` in atlas).

Write into the row whose `version` matches the one the prompt names.

```yaml
- id: historial.tabla.1-1-0
  version: 1.1.0
  date: 2026-09-14
  delivered:
    # Keyed by target, all the way down. A target can be handed this version
    # long after another one got it, so each carries its own commit.
    north:
      commit: a65d448
      files:
        manual-operador-north-v1.1.0.pdf: 9ab5064e…
        manual-operador-north-v1.1.0.docx: 4e05ad53…
  description: >-
    Incorpora el módulo **Atlas of Things**, con la gestión de dispositivos
    en campo.
```

That `delivered` block is what step 3 adds. What YOU write is the row without it
— same `id` shape as its siblings, `version` from the prompt, `date` as today:

```yaml
- id: historial.tabla.1-1-0
  version: 1.1.0
  date: 2026-09-14
  description: >-
    Incorpora el módulo **Atlas of Things**, con la gestión de dispositivos
    en campo.
```

## Before you finish

- **Do not touch `delivered`.** Those hashes are the proof of what a client
  received; editing one silently breaks the only check that can ever verify it.
- **Do not touch other rows.** A delivered row is history.
- **Rows ascend.** A new row goes at the BOTTOM, and the build enforces it.
- Rebuild to confirm the row renders: `manualforge build <manual>`. A row
  that fails validation fails the whole manual.
- If the row belongs to some targets and not others, it needs a `when` — see
  `tenant-conditioning`. A version delivered to one target and not another is
  normal, not an edge case.
