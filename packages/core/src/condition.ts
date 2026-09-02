import {
  ALL,
  type BlockNode,
  type BuildTarget,
  type ManualNode,
  type Selector,
} from "@manualforge/blocks";

/**
 * Does a selector admit a build target?
 *
 * An axis the selector does not mention is unconstrained. An axis the TARGET
 * does not define is also unconstrained — a manual built without a `role` axis
 * must not lose content that happens to name one.
 */
export function matches(when: Selector | undefined, target: BuildTarget): boolean {
  if (!when) return true;
  for (const [axis, values] of Object.entries(when)) {
    // Defense in depth: `load.ts` validates every `when` against
    // `selectorSchema` before it reaches an AST, so this should never fire in
    // practice. But if something ever constructs a node without going
    // through that validation, a scalar here (`{ tenant: "north" }` instead of
    // `{ tenant: ["north"] }`) must fail loudly — silently falling through to
    // `String#includes` turns exact tenant matching into substring matching
    // and leaks content across tenants.
    if (!Array.isArray(values)) {
      throw new TypeError(
        `malformed selector: axis "${axis}" must be an array of values, got ${typeof values}`,
      );
    }
    const actual = target[axis];
    if (actual === undefined) continue;
    if (!values.includes(ALL) && !values.includes(actual)) return false;
  }
  return true;
}

/** An object in block props that carries its own conditioning — a table row. */
type ConditionedRow = { when?: Selector };

const isConditionedRow = (v: unknown): v is ConditionedRow =>
  typeof v === "object" && v !== null && !Array.isArray(v) && "when" in v;

/**
 * Filter conditioned rows nested anywhere in a block's props.
 *
 * Rows are data, not nodes, so they never reach `conditionNodes` on their own.
 * Anything shaped like `{ when }` inside props is treated as conditionable —
 * which is what lets a table drop a row and renumber without the table type
 * knowing anything about build targets.
 */
function conditionProps(value: unknown, target: BuildTarget): unknown {
  if (Array.isArray(value)) {
    return value
      .filter((item) => !isConditionedRow(item) || matches(item.when, target))
      .map((item) => conditionProps(item, target));
  }
  if (typeof value === "object" && value !== null) {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) {
      if (k === "when") continue;
      // A standalone nested object (not an array item) can carry its own
      // conditioning too. If the target cannot see it, drop the key
      // entirely — keeping it while merely stripping `when` would silently
      // serve the content to every target and erase the only evidence that
      // it was ever conditioned.
      if (isConditionedRow(v) && !matches(v.when, target)) continue;
      out[k] = conditionProps(v, target);
    }
    return out;
  }
  return value;
}

function conditionBlock(node: BlockNode, target: BuildTarget): BlockNode {
  const props = conditionProps(node.props, target) as BlockNode["props"];
  return { kind: "block", id: node.id, type: node.type, props };
}

/**
 * Remove everything the build target cannot see.
 *
 * Exclusion is inherited: a dropped section takes its subtree with it, and an
 * included parent never rescues an excluded child.
 *
 * This runs BEFORE numbering. Numbering first and filtering afterwards leaves
 * gaps and wrong ordinals — see the package AGENTS.md.
 */
export function conditionNodes(
  nodes: readonly ManualNode[],
  target: BuildTarget,
): ManualNode[] {
  const kept: ManualNode[] = [];
  for (const node of nodes) {
    if (!matches(node.when, target)) continue;
    if (node.kind === "block") {
      kept.push(conditionBlock(node, target));
      continue;
    }
    kept.push({
      kind: "section",
      id: node.id,
      title: node.title,
      ...(node.subtitle ? { subtitle: node.subtitle } : {}),
      children: conditionNodes(node.children, target),
    });
  }
  return kept;
}
