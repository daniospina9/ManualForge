import type { PendingDeclaration } from "@manualforge/core";
import { soleAxis } from "./axis.ts";
// Type-only: `main.ts` imports this module, so a value import would close a
// cycle. The axis rule itself is in `axis.ts` for exactly that reason.
import type { ManualConfig } from "./main.ts";

/**
 * The queue of things the manual is waiting on the PRODUCT for.
 *
 * A sibling of `image-requests.json`, and deliberately shaped like it, because
 * it does the same job for a different counterparty: that file is the contract
 * with the area producing screenshots, this one is the contract with whoever
 * finishes the product. Both are derived from content that DECLARES the gap, so
 * neither is a list anybody maintains by hand — and a hand-maintained list is
 * exactly what this replaces. The prose notes in `ESTADO.md` recorded two of
 * these and then two more sections were written over them.
 *
 * Like that file, it is NOT build output. It is committed next to the manual and
 * produced by an explicit command, for the reason `module-completeness` gives:
 * a contract only whoever last ran a build can see is not a contract.
 *
 * What it does NOT do is notice that the product fixed something. That needs a
 * check against the source — whether a fixture became a query — and that check
 * does not exist yet for a product with no extractor. Until it does, an entry
 * leaves this queue when a person deletes its declaration.
 */

/** One target's live gaps, after conditioning. */
export interface TargetPending {
  /** The axis value this document is built for. */
  readonly value: string;
  readonly entries: readonly PendingDeclaration[];
}

/** One gap, as the queue lists it. */
interface QueuedGap {
  readonly id: string;
  /** Axis values whose document actually reaches this gap. */
  readonly affects: readonly string[];
  readonly section: string;
  readonly declaredIn: string;
  readonly covers: readonly string[];
  readonly missing: string;
  readonly because: string;
  readonly settles: string;
}

/**
 * Build the queue.
 *
 * Grouped by GAP rather than by target, for the reason the image manifest is
 * grouped by slot: one unfinished screen is one thing to fix, and a per-target
 * dump would list it once per document and invite it being chased twice.
 * `affects` says which documents are waiting on it.
 */
export function awaitingProduct(
  config: ManualConfig,
  perTarget: readonly TargetPending[],
): Record<string, unknown> {
  const byId = new Map<string, { decl: PendingDeclaration; affects: string[] }>();

  for (const { value, entries } of perTarget) {
    for (const decl of entries) {
      const acc = byId.get(decl.id);
      if (acc) {
        acc.affects.push(value);
        continue;
      }
      byId.set(decl.id, { decl, affects: [value] });
    }
  }

  const awaiting: QueuedGap[] = [...byId.values()].map(({ decl, affects }) => ({
    id: decl.id,
    affects,
    section: decl.section,
    declaredIn: decl.file,
    covers: [...decl.covers],
    missing: decl.missing,
    because: decl.because,
    settles: decl.settles,
  }));

  const axis = soleAxis(Object.keys(config.axes));

  return {
    manual: config.manual.id,
    contentVersion: config.manual.contentVersion,
    axis,
    // Spelled out in the file itself: whoever opens it may never have read the
    // repository's documentation, and the one thing they must not conclude is
    // that these are defects in the manual.
    convention: {
      what:
        "Parts of the product that are on screen but not finished, which this " +
        "manual therefore documents around without naming.",
      why:
        "Describing such a control as working lies to the reader; describing it " +
        "as broken publishes a product defect inside a client-facing document. " +
        "Neither is the author's call, so the manual waits.",
      whoActs:
        "Whoever finishes the product. An entry is closed by deleting its " +
        "`pending` declaration from the section that declares it, once the " +
        "content it withheld has been written.",
      declaredIn:
        "the `pending` list of a section under manuals/<manual>/sections/ — " +
        "never in the rendered manual, which names none of this",
      notDone:
        "a section with an entry here is NOT complete by the module-completeness " +
        "standard, and must not be counted as done",
    },
    targetsCovered: perTarget.map((t) => t.value),
    targetsConfigured: config.targets.length,
    counts: {
      gaps: awaiting.length,
      sections: new Set(awaiting.map((g) => g.section)).size,
    },
    awaiting,
  };
}
