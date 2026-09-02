import type { BlockCatalog, BlockNode, ManualNode } from "@manualforge/blocks";

/**
 * UI labels the manual QUOTES from the product, and where each was quoted from.
 *
 * Beacon360 has no i18n catalogue, so a label cannot be referenced by key the
 * way `uiLabel` does for a product that has one — it is copied, and a copy does
 * not follow the thing it copied. Five sections hold 222 such quotations, each
 * with its origin written in a YAML comment that nothing reads. If the product
 * renames a control, every one of them is silently wrong, and no other stage of
 * the pipeline can notice: the build succeeds, the PDF is produced, and the
 * manual tells the operator to press something that is not there.
 *
 * A citation is checked, not trusted. The check is exactly the practice the
 * authoring notes already prescribe by hand — print the cited line back and see
 * whether it still says what the manual claims — which caught four wrong
 * citations on a single section, one of them a wrong DESCRIPTION rather than a
 * wrong line.
 *
 * The citation points at an ID rather than repeating the label text. Repeating
 * it would put the same string in the file twice, and the copy that exists to
 * detect drift would be free to drift from the content it guards.
 */

/** One place in content holding a label quoted from the product. */
export interface LabelSite {
  /** The node or item id that carries it. */
  readonly at: string;
  /** Which prop the text sits in. */
  readonly prop: string;
  readonly text: string;
}

/** A citation, resolved against the content it points at. */
export interface LabelCitation {
  readonly at: string;
  readonly prop: string;
  /** The quoted text, read from content — never authored twice. */
  readonly text: string;
  /** Path in the source repository, `sourceBase` already applied. */
  readonly file: string;
  readonly line: number;
  /** The content file that declared it. */
  readonly declaredIn: string;
}

function sitesOfBlock(node: BlockNode, catalog: BlockCatalog): LabelSite[] {
  const policy = catalog.get(node.type)?.labels;
  if (!policy) return [];

  const out: LabelSite[] = [];

  for (const prop of policy.props ?? []) {
    const value = node.props[prop];
    // Absent is routine, not an error: a two-column table declares no third
    // header, and requiring one would have the author invent a heading the
    // product never showed.
    if (typeof value === "string" && value) out.push({ at: node.id, prop, text: value });
  }

  if (policy.itemsProp !== undefined) {
    const items = node.props[policy.itemsProp];
    if (Array.isArray(items)) {
      for (const item of items) {
        if (typeof item !== "object" || item === null) continue;
        const record = item as Record<string, unknown>;
        const id = record["id"];
        if (typeof id !== "string" || !id) continue;
        for (const prop of policy.itemProps ?? []) {
          const value = record[prop];
          if (typeof value === "string" && value) out.push({ at: id, prop, text: value });
        }
      }
    }
  }

  return out;
}

/**
 * Every label a subtree quotes, in document order.
 *
 * Reads each type's `LabelPolicy` rather than switching on block type, so a new
 * block that quotes labels is covered by declaring one field — and one that does
 * not is covered by declaring nothing.
 */
export function labelSites(node: ManualNode, catalog: BlockCatalog): readonly LabelSite[] {
  if (node.kind === "section") {
    return node.children.flatMap((c) => labelSites(c, catalog));
  }
  return [
    ...sitesOfBlock(node, catalog),
    ...(node.children ?? []).flatMap((c) => labelSites(c, catalog)),
  ];
}
