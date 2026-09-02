import type {
  BlockCatalog,
  BuildTarget,
  ManualDocument,
  ResolvedManual,
} from "@manualforge/blocks";
import { conditionNodes } from "./condition.ts";
import { assignNumbers } from "./number.ts";

/**
 * Turn an authored document into one ready to render for a single target.
 *
 * The order is the contract: condition, THEN number. Never the reverse.
 */
export function assemble(
  doc: ManualDocument,
  target: BuildTarget,
  catalog: BlockCatalog,
): ResolvedManual {
  const children = conditionNodes(doc.children, target);
  const { numbers, figures } = assignNumbers(children, catalog);
  return {
    manualId: doc.manualId,
    version: doc.version,
    target,
    children,
    numbers,
    figures,
  };
}
