/**
 * The manual AST — the contract every part of the pipeline agrees on.
 *
 * Authoring formats parse INTO this. Renderers consume it. Validation runs
 * against it. A renderer is replaceable; this is not.
 *
 * Two properties of this model carry the whole multi-tenant design:
 *
 *  - Every node has a stable `id`. References point at ids, never at numbers.
 *  - No node carries a number. Numbering is assigned during assembly, after
 *    conditioning has removed content the target does not see.
 */

import type { Conditioned } from "./conditioning.ts";

/**
 * Stable, author-assigned identifier, unique within a manual.
 *
 * Lowercase alphanumerics, hyphens and dots. The dots are namespaces the author
 * chooses; nothing in the pipeline parses them or attaches meaning to a segment.
 *
 * How a given manual structures its ids is an authoring convention, and it lives
 * with that manual — see `manuals/AGENTS.md`. Nothing in this file names a
 * product: the AST is the one contract every product shares, and an example
 * borrowed from one manual gets copied outward as if it were the rule.
 */
export type NodeId = string;

/** Discriminator of a block type, matching a `BlockDefinition.type`. */
export type BlockType = string;

/** Inline content: text with lightweight marks and references. */
export type Inline =
  | { readonly kind: "text"; readonly value: string }
  | { readonly kind: "emphasis"; readonly children: readonly Inline[] }
  | { readonly kind: "strong"; readonly children: readonly Inline[] }
  | { readonly kind: "code"; readonly value: string }
  /** A cross-reference. Resolved to a label and a number during assembly. */
  | { readonly kind: "ref"; readonly target: NodeId }
  /**
   * A UI label sourced from the product's i18n catalogue rather than typed by
   * hand, so the manual always quotes what the screen actually says.
   */
  | { readonly kind: "uiLabel"; readonly i18nKey: string };

/**
 * An instance of a block type from the catalogue.
 *
 * `props` is validated against that type's schema — this interface stays
 * deliberately open so the catalogue can grow without touching the AST.
 */
export interface BlockNode extends Conditioned {
  readonly kind: "block";
  readonly id: NodeId;
  readonly type: BlockType;
  readonly props: Readonly<Record<string, unknown>>;
  readonly children?: readonly ManualNode[];
}

/** A titled division of a manual. Sections nest to form the outline. */
export interface SectionNode extends Conditioned {
  readonly kind: "section";
  readonly id: NodeId;
  readonly title: readonly Inline[];
  readonly subtitle?: readonly Inline[];
  readonly children: readonly ManualNode[];
}

export type ManualNode = SectionNode | BlockNode;

/** A complete manual before conditioning: every axis value still present. */
export interface ManualDocument {
  readonly manualId: string;
  /** SemVer of the manual content itself. */
  readonly version: string;
  readonly children: readonly ManualNode[];
}

/**
 * A manual after conditioning and numbering, ready to render.
 *
 * `numbers` maps node id to its rendered ordinal (`"7.1.3"`). It exists only
 * here: the same node has different numbers in different builds, which is
 * precisely why authored content must never contain one.
 */
export interface ResolvedManual {
  readonly manualId: string;
  readonly version: string;
  readonly target: Readonly<Record<string, string>>;
  readonly children: readonly ManualNode[];
  readonly numbers: ReadonlyMap<NodeId, string>;
  /**
   * Figure ordinals, keyed by the node or item that carries the image.
   *
   * Separate from `numbers` because one node can need both: a procedure step is
   * "Paso 2" AND carries "Figura 1.7". One map cannot hold two ordinals for one
   * id, and merging them would make the renderer guess which it was handed.
   *
   * One counter per top-level section, shared by every figure in it whatever
   * block produced it — so a standalone figure and a step's screenshot
   * interleave in reading order instead of running two competing sequences.
   */
  readonly figures: ReadonlyMap<NodeId, string>;
}
