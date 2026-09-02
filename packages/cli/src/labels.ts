import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { checkLabel, type LabelVerdict } from "@manualforge/extract";
import type { LabelCitation } from "@manualforge/core";

/**
 * Check every UI label the manual quotes against the product it quoted from.
 *
 * Its own command, not part of `build`, for the reason `capture` is: it needs
 * the source product checked out beside this repository, and a build must never
 * depend on that. A manual whose product is not on this machine still builds.
 *
 * Reports rather than blocks. A moved citation is a stale line number, and a
 * label that is gone is either a product rename or a mis-transcription — which
 * of those it is, and what the manual should now say, is a judgement about the
 * product, not something a command decides.
 */

/** One citation, held against the source. */
export interface CheckedLabel extends LabelCitation {
  readonly verdict: LabelVerdict;
}

/**
 * Verify a manual's citations.
 *
 * Files are read once each and cached: five sections cite the same components
 * repeatedly, and re-reading a 2000-line component per label is the difference
 * between a check somebody runs and one they do not.
 */
export function checkLabels(
  sourceRoot: string,
  citations: readonly LabelCitation[],
): readonly CheckedLabel[] {
  const cache = new Map<string, string | undefined>();
  const read = (file: string): string | undefined => {
    if (cache.has(file)) return cache.get(file);
    const path = join(sourceRoot, file);
    const text = existsSync(path) ? readFileSync(path, "utf8") : undefined;
    cache.set(file, text);
    return text;
  };

  return citations.map((c) => ({ ...c, verdict: checkLabel(read(c.file), c.text, c.line) }));
}

/** Everything wrong, grouped so the report reads in the order things get fixed. */
export interface LabelReport {
  readonly total: number;
  readonly ok: number;
  readonly moved: readonly CheckedLabel[];
  readonly gone: readonly CheckedLabel[];
  readonly noFile: readonly CheckedLabel[];
}

export function labelReport(checked: readonly CheckedLabel[]): LabelReport {
  return {
    total: checked.length,
    ok: checked.filter((c) => c.verdict.state === "ok").length,
    moved: checked.filter((c) => c.verdict.state === "moved"),
    gone: checked.filter((c) => c.verdict.state === "gone"),
    noFile: checked.filter((c) => c.verdict.state === "no-file"),
  };
}

/**
 * The report as lines to print.
 *
 * `gone` comes first: a stale line number costs a lookup, while a label that no
 * longer exists is the manual telling an operator to press something that is not
 * there.
 */
export function labelLines(report: LabelReport): readonly string[] {
  const out: string[] = [];

  for (const c of report.gone) {
    out.push(
      `  GONE  "${c.text}" — not anywhere in ${c.file}. Cited from ${c.declaredIn} ` +
        `at ${c.at} (${c.prop}). Either the product renamed it, or the manual ` +
        `mis-transcribed it; both need a decision, not a guess.`,
    );
  }
  for (const c of report.noFile) {
    out.push(`  NO FILE  ${c.file} — cited by ${c.at} in ${c.declaredIn}, and not there.`);
  }
  for (const c of report.moved) {
    const at = c.verdict.state === "moved" ? c.verdict.foundAt.join(", ") : "";
    out.push(`  moved  "${c.text}" — cited at ${c.file}:${c.line}, now on line ${at}.`);
  }

  return out;
}
