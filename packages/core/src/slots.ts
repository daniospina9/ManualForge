import { declaredRef, slotFor } from "@manualforge/blocks";
import type {
  BlockCatalog,
  BlockNode,
  ImageConvention,
  ImageSlotPolicy,
  ManualNode,
  ResolvedManual,
} from "@manualforge/blocks";
import { ContentError } from "./load.ts";

/**
 * One place in the manual that needs an image.
 *
 * Collected from a manual that has ALREADY been conditioned, which is the whole
 * point: a control this deployment does not have is gone by now, so nobody is
 * ever asked to produce a screenshot that no reader will see.
 */
export interface ImageSlotUse {
  /** The slot the image is delivered under. */
  readonly slot: string;
  /** The node or item that declares it. */
  readonly nodeId: string;
  readonly blockType: string;
  /** What the image shows, in the manual's own words. Also the figure caption. */
  readonly shows: string;
  /** Which of the manual's two image conventions this one follows. */
  readonly convention: ImageConvention;
}

function useOf(
  source: Readonly<Record<string, unknown>>,
  id: string,
  blockType: string,
  images: ImageSlotPolicy,
): ImageSlotUse | undefined {
  const ref = declaredRef(source, images);
  if (ref === undefined) return undefined;
  let slot: string;
  try {
    slot = slotFor(ref, id);
  } catch (error) {
    // A derivation failure is a content problem — an id that cannot become a
    // filename — so it must arrive with the node id attached, not as a bare
    // internal error.
    throw new ContentError(
      `block ${blockType}`,
      id,
      error instanceof Error ? error.message : String(error),
    );
  }
  const shows = source[images.showsProp];
  return {
    slot,
    nodeId: id,
    blockType,
    shows: typeof shows === "string" ? shows : "",
    convention: images.convention,
  };
}

function slotsOfBlock(node: BlockNode, images: ImageSlotPolicy): ImageSlotUse[] {
  if (images.itemsProp === undefined) {
    const use = useOf(node.props, node.id, node.type, images);
    return use ? [use] : [];
  }

  const items = node.props[images.itemsProp];
  if (!Array.isArray(items)) return [];

  const uses: ImageSlotUse[] = [];
  for (const item of items) {
    if (typeof item !== "object" || item === null) continue;
    const record = item as Record<string, unknown>;
    const id = record["id"];
    if (typeof id !== "string" || !id) {
      throw new ContentError(
        `block ${node.type}`,
        node.id,
        `an item in \`${images.itemsProp}\` has no \`id\`, so the image slot it ` +
          `needs cannot be named. Every item carrying an image needs a stable id.`,
      );
    }
    const use = useOf(record, id, node.type, images);
    if (use) uses.push(use);
  }
  return uses;
}

function walk(node: ManualNode, catalog: BlockCatalog, out: ImageSlotUse[]): void {
  if (node.kind === "section") {
    for (const child of node.children) walk(child, catalog, out);
    return;
  }
  const images = catalog.get(node.type)?.images;
  if (images) out.push(...slotsOfBlock(node, images));
  for (const child of node.children ?? []) walk(child, catalog, out);
}

/**
 * Every image slot a resolved manual needs, in document order.
 *
 * This is what the image manifest is built from, and therefore what the area
 * producing the screenshots is asked for. It reads the per-type
 * `ImageSlotPolicy` rather than switching on block type, so a new block that
 * carries images is picked up by declaring one field.
 */
export function collectSlots(
  manual: ResolvedManual,
  catalog: BlockCatalog,
): readonly ImageSlotUse[] {
  const out: ImageSlotUse[] = [];
  for (const child of manual.children) walk(child, catalog, out);
  return out;
}
