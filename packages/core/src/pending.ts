import type { ManualNode, NodeId, ResolvedManual } from "@manualforge/blocks";

/**
 * A part of the product the manual deliberately does not describe, because the
 * product has not finished it.
 *
 * This is the third kind of gap, and it is not the other two. A pipeline defect
 * is fixed in `packages/`; a content defect is fixed in `manuals/`. This one is
 * neither: the screen is on display and what it displays is fabricated, and both
 * ways of writing about it are statements about the product rather than about the
 * manual. Saying the control works lies to the reader. Saying it does not work
 * publishes a defect list inside a document marked Confidential.
 *
 * So the manual documents everything around it and names none of it — which is
 * the coverage rule's own escape hatch ("cover it, or state explicitly why an
 * item is out of scope"), except that the statement now has a shape a command
 * can read.
 *
 * WHY IT IS NOT AN AST NODE. The policy is that the manual never names the
 * unfinished part, so a declaration that could reach a renderer would publish
 * exactly what it exists to withhold. Kept out of the tree, that is impossible
 * rather than merely avoided: no renderer has to know it exists, and nothing has
 * to remember to carry it through conditioning. It travels beside the tree in
 * `LoadedSection`, which is already the channel for what a content file says
 * about itself rather than in itself.
 */
export interface PendingDeclaration {
  /** Stable key. The queue is diffed on it, so renaming one is losing one. */
  readonly id: string;
  /** The section that declared it. */
  readonly section: NodeId;
  /** The content file it was declared in. */
  readonly file: string;
  /**
   * Node ids in that same section whose content the gap sits inside.
   *
   * The join between the queue and the manual, and the reason the queue cannot
   * quietly rot: resolved within the declaring section at parse time, so an id
   * that stops existing is a content error rather than a dangling pointer.
   */
  readonly covers: readonly NodeId[];
  /** What is on screen and undocumented, in internal words. */
  readonly missing: string;
  /** The evidence, by file and line in the source product. */
  readonly because: string;
  /** What would close this — the exit condition. */
  readonly settles: string;
}

function idsOf(node: ManualNode, out: Set<NodeId>): void {
  out.add(node.id);
  for (const child of node.children ?? []) idsOf(child, out);
}

/** Every node id a resolved manual still contains, at any depth. */
export function reachableIds(manual: ResolvedManual): ReadonlySet<NodeId> {
  const out = new Set<NodeId>();
  for (const child of manual.children) idsOf(child, out);
  return out;
}

/**
 * The gaps that are really this target's gaps.
 *
 * Collected from a manual that has ALREADY been conditioned, for the same reason
 * image slots are: a control this target does not have is gone by now, so nobody
 * is owed work on a gap no reader of this document can reach. A declaration
 * whose covered content was all conditioned away is not a debt here.
 *
 * Declaration order is preserved. The queue is read by a person deciding what to
 * chase, and reading order is the order the manual was written in.
 */
export function collectPending(
  manual: ResolvedManual,
  declarations: readonly PendingDeclaration[],
): readonly PendingDeclaration[] {
  const reachable = reachableIds(manual);
  return declarations.filter((d) => d.covers.some((id) => reachable.has(id)));
}
