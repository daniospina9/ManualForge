# Agent Information — `@manualforge/cli`

The `manualforge` command line. **The only package allowed to touch the
filesystem, the network or the clock** — for anything that belongs to a manual:
content, config, knowledge, figures, output.

One exception exists and it is not a precedent: `render-web/src/polyfill.ts`
reads `pagedjs`'s bundled `paged.min.js` out of `node_modules` to inline it into
the HTML. That is a package reading its own dependency's shipped asset, not a
renderer reaching for the manual's data. A renderer that opens anything under
`manuals/` is a bug.

## Commands

There are **four**. The dispatch is `main.ts:854` — treat it, not this table, as
the authority if they ever disagree.

| Command | Does |
|---|---|
| `build <manual>` | Assemble and render every configured target, named by the next working number (`…-trabajo-08.pdf`) — a new one per run, never overwriting the last |
| `deliver <manual> --version <N.N.N>` | Promote to an official delivery: render the version-named document, archive it in `deliveries/`, stamp the commit and each file's hash onto the change-log row. Refuses on a dirty tree. The only command that produces a version-named file |
| `undeliver <manual> --version <N.N.N> --not-handed-over` | Undo a delivery **that never left the building**: delete the archived files, take that target's proof off the row, commit the undo. The flag is the caller ASSERTING nobody received the document — the repository cannot know, and without it the command refuses. Never rewrites history |
| `images <manual>` | Export the image request document for the area that produces the screenshots |
| `capture <manual> --tenant <id>` | Shoot pending figures off the **running** product, per `manuals/<manual>/capture-recipes.yaml` |
| `extract <manual>` | Read the source product and regenerate `knowledge/module-map.json`, reporting what changed since the last map |
| `awaiting <manual>` | Write `awaiting-product.json`: the parts of the product that are on screen but unfinished, which the manual documents around without naming. Declared by a section's `pending` list — never rendered |
| `labels <manual>` | Hold every UI label the manual QUOTES against the line it was copied from, per a section's `labels` list. Needs the source checked out; reports, never blocks |

Every command takes the axis filters `[--tenant <id>] [--axis <name>=<value> …]`
except `extract`, which is per-manual and not per-target.

| Flag | On | Does |
|---|---|---|
| `--draft` | `build` | Internal build: prints the filename each pending image must be delivered under. Never distribute one. |
| `--pending-table` | `build` | Also write `imagenes-pendientes-<tenant>.md` — every pending image in reading order, with the page it landed on and a blank column to fill in |
| `--docx` | `build` | Also write the manual as a Word document beside the PDF |
| `--out <path>` | `images` | Where to write the request document |
| `--only <slot,…>` | `capture` | Restrict the run to named slots |

### Commands this file used to claim, and where they went

`validate` and `coverage` were never built. `drift` was folded into `extract`,
which reports the diff against the previous map. `catalog` was to serve the
block gallery; the gallery ships instead as the manual `manuals/_catalog`, built
by `build` like any other.

Do not re-add any of them to this table before the code exists. A command table
that lists intentions is how an agent ends up invoking a command that is not
there.

## Rules

- **Thin.** Read inputs, call `core`, write outputs, format errors. Any decision
  made here is a decision in the wrong package — pipeline logic belongs in
  `core`, where it can be tested without a filesystem.
- **Never write under `sources/`.** Source product repositories are read-only
  inputs. Enforce it; do not merely intend it.
- **Build output goes to `manuals/<manual>/output/`**, which is gitignored.
  Generated PDFs are never committed.
- **A working build is never named after a version.** `build` names its output by
  a working number and `deliver` is the only thing that writes a version-named
  file, so a `…-v1.0.1.pdf` on disk always means a delivery happened. The
  counter is `naming.ts`; the reasoning is in `manuals/AGENTS.md`, "Two kinds of
  build".
- **`--draft` is the only build allowed to print a slot path.** A slot path is a
  pipeline internal and invariant 4 keeps those out of client-facing output. The
  draft is marked in its filename (`-BORRADOR`), its cover and its running
  header, because two PDFs that differ only in their contents will eventually be
  sent to the wrong place. The plain build is the default — though it is not the
  client's document either: only `deliver` renders that one.
- **The image request document is NOT build output.** It leaves the repository
  for another team, so `images` writes it outside `output/` (default
  `manuals/<manual>/image-requests.json`) and it is committed. `build` reports
  image counts but never writes it: handing work to another team is an explicit
  act, not a side effect of rendering a PDF.
- **Non-zero exit on validation failure.** This runs in CI.
- **Errors are actionable**: file, node id, what to do. A stack trace is not an
  error message.
- `--tenant` is shorthand for the general axis form. Keep the general form
  available so a second axis does not require a new CLI surface.

## Testing

Command wiring and argument parsing are tested. Pipeline behaviour is tested in
`core` — do not re-test it through the CLI, and do not push logic here to avoid
writing those tests.
