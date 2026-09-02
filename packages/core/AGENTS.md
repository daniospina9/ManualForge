# Agent Information — `@manualforge/core`

The pipeline engine: everything between authored content and a renderer.

## Scope

| Stage | Responsibility |
|---|---|
| `parse` | Authoring format → `ManualDocument` (AST) |
| `condition` | Drop nodes whose `when` selector excludes the build target |
| `resolve` | Assign numbering, resolve `ref` targets and `uiLabel` keys |
| `validate` | Enforce the invariants; report actionable errors |
| `drift` | Compare declared facts against the extracted `module-map.json` |

Output is a `ResolvedManual`. Renderers take it from there.

## Order matters

**Condition before numbering. Always.**

Numbering a document and then removing content leaves gaps and wrong ordinals —
the tenant that cannot see module 6 must see its next module as 6, not 7. Any
change that reorders these stages is a bug regardless of what the tests say.

## Everything here is a pure function

`(input, config) → output`. No filesystem access, no network, no clock, no
randomness. I/O belongs to `cli`.

This is not stylistic. It is what makes numbering, conditioning and reference
resolution testable in isolation — and those are exactly the parts where a
silent error produces a manual that looks perfect and is wrong.

## Validation must be actionable

An error names the node id, the file it came from, and what to do about it.
`"invalid reference"` is not a validation error, it is a shrug.

Checks this package owns:

- Unknown block type, or props failing the block's schema
- `ref` pointing at a node that does not exist
- `ref` pointing at a node the build target cannot see — **the classic
  multi-tenant failure**: a link into content the reader was never shown
- Literal numbering or anchors found in authored content
- Duplicate node ids
- A `uiLabel` whose i18n key is absent from the source product
- Declared axis values that contradict the extracted `module-map.json`
- Content no build target can ever reach (dead content)

## Testing

**Test-first, no exceptions.** These are pure functions over small ASTs; there
is no setup cost to hide behind.

Every one of these needs a test before its implementation:

- Conditioning: `all`, single value, multiple values, absent selector, nested
  exclusion (an included child inside an excluded parent stays excluded)
- Numbering: renumbering after exclusion, per-scope counter resets, nesting
- References: resolution, dangling target, cross-target leak
- Drift: agreement, disagreement, and a fact that vanished from the source
