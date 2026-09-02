# Agent Information — `@manualforge/tokens`

The single source of visual truth: colours, typography, spacing, borders, and
the named roles that map them to meaning.

## Why this is its own package

Swapping this package changes how every manual looks, in every target, without
touching a line of content or a block definition. That is the whole point. A
second product with different branding is a new token set, not a fork.

## Rules

- **Tokens are data, not code.** Plain values, no logic, no conditionals.
- **No token names a block.** `color.accent`, not `color.warningBlockBorder`.
  Blocks *consume* tokens; tokens must not know who consumes them.
- **No renderer-specific values.** A token holds `#1B4D8F`, not a CSS custom
  property and not a Typst colour literal. Renderers translate.
- **Nothing is authored here by guesswork.** Every value traces to a source the
  brand owns — a vector content stream, a product's own theme block. Never a
  colour sampled off a screenshot, never one invented to unblock a build.

## Structure

One file, `src/index.ts`. The two layers are a type and a function, not folders:

```
interface Brand      Raw values one brand supplies — palette, type, a few
                     composition choices, and optionally its own scale
const defaultScale   The type scale and spacing ramp a brand gets by saying
                     nothing about it
function build(brand) Named roles and per-block specs, the layer everything
                     else reads. Merges brand.scale over defaultScale per rung
themes               build() applied to each brand
```

Content, blocks and renderers reference the **built theme** only. `Brand` and
`defaultScale` are inputs to it and are not exported.

### Overriding the scale

`Brand.scale` is optional and merged **per rung**, so a brand that needs one
different heading size keeps the other twelve values shared. Neither shipping
brand declares it today, and both themes are byte-for-byte what they were before
the field existed.

It was opened because palette and type alone could not carry a second manual's
identity — rhythm is most of what makes a design read as its own, and it was the
one thing closed. Two things to know before using it:

- **Points only.** The values reach CSS, which accepts any unit, and Word, where
  `pt()` in `render-docx/src/measure.ts` throws on anything that is not
  `<number>pt`. A `--docx` build is what catches a wrong unit; the PDF will
  render it silently.
- **An overridden rung stops being fixed once for everybody.** That is the trade
  the shared ramp was buying. Override what the design genuinely needs, not what
  is merely different.

## Status

Two brands are defined and shipping, each traced to a source:

| Brand | Source |
|---|---|
| Atlas | The vector content stream of `Manual_Atlas_v5.pdf` — exact values, not sampled pixels |
| Beacon360 | The product's own `@theme` block in `src/app/App.css` |

Both are decisions, not placeholders, and nothing external is pending on them.

A third brand is a new palette — and, where it needs one, its own scale — fed
into the same semantic layer. Not a fork, and not a second renderer.

Two things a brand still cannot bring, and they are the next wall a fully
independent design hits: `coverStyle` and `sheet` are closed unions
(`"band" | "mark"`, `"atlas" | "beacon"`). A third cover arrangement or a
third stylesheet means editing those types and adding a stylesheet file — the
markup and CSS carry arrangement, tokens cannot express it.
