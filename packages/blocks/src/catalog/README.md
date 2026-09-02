# Block catalogue

Ten block types. Nine were derived by surveying every page of
`Manual_Atlas_v5.pdf` for the visual structures the content actually recurs
on, then proven against two delivered manuals.

**This is the catalogue.** No external one is pending, and no type here is a
placeholder for a shape someone else will decide.

Adding an eleventh follows the procedure in `../../AGENTS.md`. It is a versioned
change to a contract every manual depends on — deliberate, never casual.

## The tenth: `change-log`

The ninth type was the last one about a SCREEN. `change-log` is the first block
about the MANUAL — its own delivery history, one row per version handed to the
client. It was added because a three-column table of version, date and
description fits nothing that existed:

- `data-table` is two columns, and widening it was the wrong repair for a
  second reason. Its `labels` policy declares the headers and each row's label
  as text QUOTED FROM THE PRODUCT, feeding the citation checker. Every word in
  a change log is the manual's own, and a version number is not a UI label.
  Reusing it would have the checker hunting for `1.4.7` in a source repository.
- So `change-log` declares no `labels`, no `images` and no `numbering` — the
  one module in a manual that opens with no screenshot, because there is
  nothing to photograph.

Its rows condition individually, like `icon-table`'s. A version delivered to one
target and not another is the normal case: the manuals are conditioned, so their
delivery histories diverge.
