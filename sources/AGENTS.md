# Agent Information — `sources/`

Registry of the product repositories this system documents.

## READ-ONLY — no exceptions

Source repositories are **inputs**. Never create, edit, delete or move a file
inside one. Never run a command that mutates one — no `git` writes, no
installs, no formatters, no "harmless" fixes.

If documenting something reveals a bug in the product, **report it**. Fixing it
here is out of scope and silently couples two repositories that must stay
independent.

## What lives here

`registry.yaml` — one entry per source repo: id, path, framework, and where the
facts are extracted from. That is all. No copies of source code, no vendored
snapshots.

## Extraction, not interpretation

Everything read from a source repo lands in that manual's `knowledge/` folder as
data, with a file-and-line provenance for each fact. Content is then written
against that data.

Nobody authors a manual by reading source code directly. That is how a manual
ends up asserting things nobody can trace, and how it silently rots when the
code moves.

## Skills that govern work here

| Skill | Owns |
|---|---|
| `source-extraction` | Getting facts out of a product and into a module map |
| `source-assets` | Taking images from the product's own asset files |

Read `source-extraction` before onboarding a product. It owns the extraction
rules; this file does not restate them.

## Adding a source

**Investigate first. The registry entry is the OUTPUT of that investigation, not
its starting point.**

Every path in an existing entry — `src/render/config/*.config.ts`,
`AppRoutes.tsx`, a translations file — is true of *that* product and of no
other. Copying the shape of an existing entry onto a new product produces a map
that is confidently wrong, and every sentence written against it inherits the
error.

1. **Survey the product and report before touching this folder.** Framework and
   structure; whether it is multi-tenant at all and, if so, how tenancy is
   resolved, with file and line; where UI labels live. State what you could not
   determine rather than assuming it.
2. **Judge whether `packages/extract` fits.** It is written for one product's
   shape — read `packages/extract/AGENTS.md` before assuming it generalises. The
   answer is *fits*, *fits partly*, or *needs a new extractor*, and it is a
   finding to report, not a detail to work around.
3. Add an entry to `registry.yaml` reflecting what you actually found.
4. Create `manuals/<id>/` with a `manual.config.yaml`. Declare only the axes the
   product really has — a declared axis nothing varies on is noise in every
   build.
5. Run `manualforge extract <id>` — unless step 2 answered *needs a new
   extractor*. Then there is no map to generate yet, and the command refuses
   rather than emitting one: report that and stop, because whether to build the
   extractor or to author against cited facts meanwhile is a decision, not a
   workaround.
6. Review the generated `module-map.json` before writing a word of content.

Steps 1, 2 and 6 are not optional. An extraction nobody checked is a set of
confident claims nobody verified — and one run on a mis-shaped registry entry
will happily report a single tenant for a product that has five.

## After the map

The map is the input to authoring, not the end of the work. Content is written
against it under `manuals/<id>/` — continue in `manuals/AGENTS.md`, which owns
the authoring rules and names the skills that govern them.
