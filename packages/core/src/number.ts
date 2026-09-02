import { declaredRef } from "@manualforge/blocks";
import type { BlockCatalog, ImageSlotPolicy, ManualNode, NodeId } from "@manualforge/blocks";

/** Every ordinal one build target needs. */
export interface AssignedNumbers {
  /** Sections and numbered blocks, keyed by node id. */
  readonly numbers: ReadonlyMap<NodeId, string>;
  /**
   * Figure ordinals, keyed by whichever node or item carries the image.
   *
   * Kept apart from `numbers` because a procedure step needs both: its step
   * ordinal and its figure number. One map, one ordinal per id.
   */
  readonly figures: ReadonlyMap<NodeId, string>;
}

/**
 * Counter key for figures.
 *
 * A `labelKey` in the same section-scoped counter map, so it cannot collide with
 * a block type's own counter (`row`, `step`) while still resetting per top-level
 * section exactly like those do.
 */
const FIGURE_COUNTER = "figure";

/** Ids that carry a figure-convention image, in the order they appear. */
function figureBearers(
  node: { readonly id: NodeId; readonly props: Readonly<Record<string, unknown>> },
  images: ImageSlotPolicy,
): NodeId[] {
  if (images.convention !== "figure") return [];

  if (images.itemsProp === undefined) {
    return declaredRef(node.props, images) === undefined ? [] : [node.id];
  }

  const items = node.props[images.itemsProp];
  if (!Array.isArray(items)) return [];
  const ids: NodeId[] = [];
  for (const item of items) {
    if (typeof item !== "object" || item === null) continue;
    const record = item as Record<string, unknown>;
    const id = record["id"];
    // `declaredRef` is shared with slot collection on purpose: if numbering and
    // rendering disagreed about which items carry an image, a figure number
    // would be assigned to something that draws no figure, and every figure
    // after it would be off by one.
    if (typeof id === "string" && declaredRef(record, images) !== undefined) ids.push(id);
  }
  return ids;
}

/**
 * Assign every node its rendered ordinal for one build target.
 *
 * Runs AFTER conditioning, never before: the whole point is that a target
 * which cannot see a section has its following sections shift up.
 *
 * - Sections take their position in the tree: `1`, `1.2`, `1.2.3`.
 * - A numbered block counts against a counter chosen by the block type's
 *   `numbering.scope`:
 *     - `document` — one counter for the whole manual, never reset. Ordinal
 *       is the bare counter (`1`, `2`, `3`).
 *     - `section` — resets at each TOP-LEVEL section and keeps counting
 *       through every subsection nested under it, however deep. Ordinal is
 *       `<top-level section number>.<n>`.
 *     - `subsection` — resets at EVERY section, at any depth. Ordinal is
 *       `<full section path>.<n>`.
 *     - `block` — resets at every instance. Bare ordinal.
 * - A block that declares `numbering.itemsProp` numbers the items in that prop
 *   instead of itself, so a filtered table or procedure renumbers from one.
 */
export function assignNumbers(
  nodes: readonly ManualNode[],
  catalog: BlockCatalog,
): AssignedNumbers {
  const numbers = new Map<NodeId, string>();
  const figures = new Map<NodeId, string>();

  // `document`-scoped counters span the whole manual and are never reset,
  // regardless of how many sections or recursion frames the walk crosses.
  const documentCounters = new Map<string, number>();

  /**
   * Where each block instance's own count ended, so a later block can continue
   * it. Only ever written for blocks that number something, and only ever read
   * through `continuesProp`.
   */
  const endedAt = new Map<NodeId, number>();

  /**
   * The seed for a `block`-scoped counter that continues another instance.
   *
   * Throws rather than starting from zero. A `continues` pointing at nothing
   * would renumber a fourteen-step procedure as 1..9 then 1..5 — a wrong manual
   * that builds cleanly, passes every test, and is only caught by someone
   * reading the page.
   */
  const continuedCount = (
    node: { readonly id: NodeId; readonly props: Readonly<Record<string, unknown>> },
    labelKey: string,
    continuesProp: string | undefined,
  ): Array<[string, number]> => {
    if (continuesProp === undefined) return [];
    const target = node.props[continuesProp];
    if (typeof target !== "string") return [];
    const reached = endedAt.get(target);
    if (reached === undefined) {
      throw new Error(
        `"${node.id}" continues the numbering of "${target}", but "${target}" ` +
          `has not been numbered. Either it does not exist, or it comes after ` +
          `"${node.id}" — a count can only continue something already counted.`,
      );
    }
    return [[labelKey, reached]];
  };

  const walk = (
    children: readonly ManualNode[],
    prefix: readonly number[],
    /** Ordinal prefix of the enclosing TOP-LEVEL section, for `section` scope. */
    topLevelPrefix: readonly number[],
    /** `section`-scoped counters for the current top-level section — shared
     * by every subsection nested under it, no matter the depth. */
    sectionCounters: Map<string, number>,
  ): void => {
    let sectionIndex = 0;
    // `subsection`-scoped counters, reset for every section frame.
    const subsectionCounters = new Map<string, number>();

    for (const node of children) {
      if (node.kind === "section") {
        sectionIndex += 1;
        const path = [...prefix, sectionIndex];
        numbers.set(node.id, path.join("."));
        const isTopLevel = prefix.length === 0;
        walk(
          node.children,
          path,
          isTopLevel ? path : topLevelPrefix,
          isTopLevel ? new Map() : sectionCounters,
        );
        continue;
      }

      const def = catalog.get(node.type);
      if (!def) continue;

      // Figures first, and against ONE counter per top-level section shared by
      // every block type that produces them, so a standalone figure and a
      // procedure step's screenshot interleave in reading order. `section`
      // scope, matching what the `figure` block declared when it was the only
      // block that could produce one.
      if (def.images) {
        let n = sectionCounters.get(FIGURE_COUNTER) ?? 0;
        for (const id of figureBearers(node, def.images)) {
          n += 1;
          figures.set(id, [...topLevelPrefix, n].join("."));
        }
        sectionCounters.set(FIGURE_COUNTER, n);
      }

      if (!def.numbering) continue;

      const { scope, labelKey, itemsProp, continuesProp } = def.numbering;
      // `block` scope gets a throwaway counter map: nothing outside this one
      // block instance may share or continue its count — unless the block names
      // the instance it continues, which is the only way to interleave a table
      // between two steps without restarting at 1.
      const counters =
        scope === "document"
          ? documentCounters
          : scope === "section"
            ? sectionCounters
            : scope === "subsection"
              ? subsectionCounters
              : new Map<string, number>(continuedCount(node, labelKey, continuesProp));
      const ordinalPrefix =
        scope === "section" ? topLevelPrefix : scope === "subsection" ? prefix : [];

      // A container numbers its items; anything else numbers itself. Which one
      // it is comes from the block's own declaration, never from prop names.
      const items = itemsProp === undefined ? undefined : node.props[itemsProp];

      if (Array.isArray(items)) {
        let n = counters.get(labelKey) ?? 0;
        for (const item of items) {
          if (typeof item !== "object" || item === null || !("id" in item)) continue;
          n += 1;
          numbers.set(String((item as { id: unknown }).id), [...ordinalPrefix, n].join("."));
        }
        counters.set(labelKey, n);
        endedAt.set(node.id, n);
        continue;
      }

      const n = (counters.get(labelKey) ?? 0) + 1;
      counters.set(labelKey, n);
      endedAt.set(node.id, n);
      numbers.set(node.id, [...ordinalPrefix, n].join("."));
    }
  };

  walk(nodes, [], [], new Map());
  return { numbers, figures };
}
