/**
 * How a block type is declared.
 *
 * The catalogue of concrete block types is defined in `./catalog/`, one file
 * per type. This file describes the shape those declarations take.
 */

import type { ZodType, ZodTypeDef } from "zod";
import type { BlockType } from "./ast.ts";

/**
 * A block's props schema.
 *
 * The input type is left open because a schema may transform — `.default()`,
 * `.coerce`, `.transform()` — so what an author writes is not always what the
 * renderer receives. Only the OUTPUT type is pinned.
 */
export type PropsSchema<TProps> = ZodType<TProps, ZodTypeDef, unknown>;

/** What a block may contain. */
export type ChildPolicy =
  /** Leaf block — content lives entirely in `props`. */
  | { readonly kind: "none" }
  /** A single run of inline content. */
  | { readonly kind: "inline" }
  /** Other blocks, restricted to the listed types. */
  | { readonly kind: "blocks"; readonly allowed: readonly BlockType[] };

/**
 * Where a block's counter resets, for block types that are numbered.
 *
 * - `document` — one counter for the whole manual, never reset. Bare ordinal.
 * - `section` — resets at each top-level section, keeps counting through every
 *   subsection nested under it. Ordinal is `<top-level number>.<n>`.
 * - `subsection` — resets at every section, at any depth. Ordinal is
 *   `<full section path>.<n>`.
 * - `block` — resets at every instance of the block. Bare ordinal. For items
 *   that only make sense relative to their own container, such as the steps of
 *   one procedure.
 */
export type NumberingScope = "document" | "section" | "subsection" | "block";

export interface NumberingPolicy {
  readonly scope: NumberingScope;
  /** Caption prefix, e.g. `"Figura"`. Rendered per the manual's language. */
  readonly labelKey: string;
  /**
   * Name of the prop holding the items to number, when the block is a
   * container rather than a single numbered thing.
   *
   * Declared, never inferred. Guessing from a prop happening to be called
   * `rows` silently mis-numbers the first block that owns an unrelated array
   * by that name.
   */
  readonly itemsProp?: string;
  /**
   * Name of the prop by which one instance continues another's count.
   *
   * Only meaningful under `block` scope, which is otherwise sealed: a
   * throwaway counter is exactly what makes a procedure's steps local to that
   * procedure. But a step sometimes needs a table or a callout between it and
   * the next step, and that is only expressible as a sibling node — which ends
   * the block and would restart the count at 1 in the middle of a procedure the
   * reader is following.
   *
   * The author writes the id of the block to continue, not a starting number.
   * A number would go stale the moment a step is inserted above it, and the
   * failure would be a silently misnumbered manual rather than an error.
   */
  readonly continuesProp?: string;
}

/**
 * Whether a block's image slot is expected to exist.
 *
 * - `always` — the block is about something the reader must recognise on
 *   screen, so the slot is declared even before the image exists and renders
 *   the pending placeholder until it arrives. A figure with no image, or a step
 *   that does not show the control to press, is unfinished content.
 * - `optional` — an illustration that carries information only sometimes. No
 *   declaration, no slot: filling a manual with placeholders nobody asked for
 *   would drown the ones that are genuinely awaited.
 */
export type ImagePolicy = "always" | "optional";

/**
 * How an image presents itself. The manual has exactly TWO, and no third.
 *
 * - `figure` — a captioned, numbered figure, so the text can refer back to it.
 *   Every image outside a table is one of these, wherever it sits: a step's
 *   control, an element's screenshot, a standalone illustration.
 * - `icon` — a control's icon inside an icon table's first column. Not
 *   numbered as a figure and not captioned: the row's label names it.
 *
 * Declared per block type rather than decided by the renderer, because "these
 * two and no others" is a rule about the MANUAL, and a rule the renderer holds
 * privately is a rule the next block type will quietly break.
 */
export type ImageConvention = "figure" | "icon";

/**
 * Where a block keeps its image references, so slots can be enumerated for the
 * manifest without re-implementing the renderer's per-type knowledge.
 *
 * Declared, never inferred — the same reason `NumberingPolicy.itemsProp` is
 * declared. A walker guessing which props hold images would silently miss the
 * first block that names its own differently.
 */
export interface ImageSlotPolicy {
  /** Prop holding the reference — on the block, or on each item. */
  readonly prop: string;
  /** Prop holding the items that each carry a reference, when it is a container. */
  readonly itemsProp?: string;
  /**
   * Prop whose text says what the image shows — a caption, a control's label, a
   * step title.
   *
   * Serves two readers from one fact. It is the figure's CAPTION on the page,
   * and it is the description in the image manifest, which is the only thing the
   * area producing the screenshots ever sees. A manifest row reading just
   * `barra.busqueda` is not a request anyone can fulfil, and a figure with no
   * caption cannot be referred to.
   */
  readonly showsProp: string;
  readonly policy: ImagePolicy;
  readonly convention: ImageConvention;
}

/**
 * Which of a block's props hold a UI LABEL — text quoted from the product
 * because the operator reads it on screen.
 *
 * Only labels. Not prose about a control, not a step's instruction, not a
 * caption: those are the manual's own words and the manual is free to reword
 * them. A label is the product's word, and if the product changes it the manual
 * is quoting something that no longer exists — which nothing else in the
 * pipeline can notice.
 *
 * This is deliberately NOT `ImageSlotPolicy.showsProp`. That prop is the caption
 * source, which for a `procedure` step is its title — an instruction like
 * "Presione Guardar", not a label. Borrowing it would have this checker verify
 * the manual's own sentences against the product's source and report every one
 * of them as drifted.
 *
 * Declared, never inferred, for the reason `numbering.itemsProp` is: a walker
 * guessing that a prop called `label` holds a label is right until the first
 * block whose `label` is the manual's own heading.
 */
export interface LabelPolicy {
  /** Props on the block itself — a table's column headers. */
  readonly props?: readonly string[];
  /** Prop holding the items, when labels live one per item. */
  readonly itemsProp?: string;
  /** Props on each item. */
  readonly itemProps?: readonly string[];
}

export interface BlockDefinition<TProps = unknown> {
  readonly type: BlockType;
  /** SemVer. Manuals pin a catalogue version; a breaking change bumps major. */
  readonly version: string;
  /**
   * What this block is for and when to use it, addressed to whoever — human or
   * agent — is choosing between block types. This is the text that keeps
   * authors from improvising layout.
   */
  readonly description: string;
  readonly schema: PropsSchema<TProps>;
  readonly children: ChildPolicy;
  /** Present only if instances of this block are numbered. */
  readonly numbering?: NumberingPolicy;
  /** Present only if this block carries images. */
  readonly images?: ImageSlotPolicy;
  /** Present only if this block quotes UI labels from the product. */
  readonly labels?: LabelPolicy;
}

/** The full set of block types available to a manual. */
export type BlockCatalog = ReadonlyMap<BlockType, BlockDefinition>;
