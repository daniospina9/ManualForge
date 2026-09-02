import { createHash } from "node:crypto";
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";

/**
 * Promoting a build to an official delivery.
 *
 * Everything here is DETERMINISTIC and that is the point of the split: copying
 * files, hashing bytes, stamping a row. Not one decision in it. The judgement —
 * what to tell the client changed — belongs to an agent reading the commit
 * range, and the two meet at the row this leaves behind.
 *
 * Nothing in this module writes prose.
 */

/** SHA-256 of a file's bytes, lower-case hex. */
export function hashFile(path: string): string {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

/** One target's artefacts, as the delivery found them. */
export interface DeliverableFile {
  /** Axis value this file belongs to, e.g. `north`. */
  readonly axisValue: string;
  readonly path: string;
  readonly sha: string;
}

export interface DeliveryPlan {
  readonly version: string;
  readonly files: readonly DeliverableFile[];
  readonly commit: string;
}

/**
 * Why a delivery cannot go ahead.
 *
 * Returned rather than thrown so the caller — a wizard mid-conversation, or a
 * command — decides how to say it. A refusal here is always about the delivery
 * being WRONG, never about it being inconvenient.
 */
export type DeliveryRefusal =
  | { readonly kind: "dirty-tree" }
  | { readonly kind: "no-commit" }
  | { readonly kind: "missing-files"; readonly axisValues: readonly string[] }
  | { readonly kind: "already-delivered"; readonly axisValues: readonly string[] }
  | { readonly kind: "not-the-newest"; readonly newest: string };

/**
 * The files an official delivery of `version` would consist of.
 *
 * DRAFTS ARE EXCLUDED BY CONSTRUCTION, not by filtering: the expected name is
 * built from the same template the build used, so a `-BORRADOR` or a
 * `-NO-ENTREGADO` file simply is not the name being looked for. A draft carries
 * internal slot paths and must never reach a client.
 */
export function planDelivery(
  outDir: string,
  version: string,
  expectedNames: ReadonlyMap<string, readonly string[]>,
): { plan: readonly DeliverableFile[]; missing: readonly string[] } {
  const plan: DeliverableFile[] = [];
  const missing: string[] = [];
  for (const [axisValue, names] of expectedNames) {
    let found = false;
    for (const name of names) {
      const path = join(outDir, name);
      if (!existsSync(path)) continue;
      plan.push({ axisValue, path, sha: hashFile(path) });
      found = true;
    }
    if (!found) missing.push(axisValue);
  }
  return { plan, missing };
}

/**
 * Copy the planned files into the archive.
 *
 * REFUSES TO OVERWRITE. A file already sitting in `deliveries/` is one a client
 * received; replacing it would destroy the only copy of the thing the proof in
 * the repository refers to. If a name is already there, the delivery is either
 * a mistake or a repeat, and both want a human rather than a silent overwrite.
 */
export function archive(
  deliveriesDir: string,
  manualId: string,
  files: readonly DeliverableFile[],
): { readonly copied: readonly string[]; readonly refused: readonly string[] } {
  const dest = join(deliveriesDir, manualId);
  mkdirSync(dest, { recursive: true });
  const copied: string[] = [];
  const refused: string[] = [];
  for (const file of files) {
    const target = join(dest, basename(file.path));
    if (existsSync(target)) {
      refused.push(basename(file.path));
      continue;
    }
    copyFileSync(file.path, target);
    copied.push(basename(file.path));
  }
  return { copied, refused };
}

const indentOf = (line: string): number => (line.match(/^\s*/)?.[0] ?? "").length;

/**
 * The row declaring `version`, and its `delivered:` block if it has one.
 *
 * Bounded to that ONE row. Scanning past its end would find the next row's
 * proof and let a stamp or an undo land on a delivery nobody mentioned.
 */
function locateRow(
  lines: readonly string[],
  version: string,
): { readonly at: number; readonly indent: number; readonly delivered: number } | null {
  const at = lines.findIndex((l) =>
    new RegExp(`^\\s*version:\\s*${version.replace(/\./g, "\\.")}\\s*$`).test(l),
  );
  if (at === -1) return null;
  const indent = indentOf(lines[at] ?? "");

  for (let i = at + 1; i < lines.length; i++) {
    const line = lines[i] ?? "";
    if (line.trim() === "") continue;
    if (indentOf(line) < indent) break;
    if (indentOf(line) === indent && /^\s*-\s/.test(line)) break;
    if (indentOf(line) === indent && /^\s*delivered:\s*$/.test(line)) {
      return { at, indent, delivered: i };
    }
  }
  return { at, indent, delivered: -1 };
}

/** Where a block starting at `from` ends: the first line indented no deeper. */
function blockEnd(lines: readonly string[], from: number, indent: number): number {
  let end = from + 1;
  while (end < lines.length) {
    const line = lines[end] ?? "";
    if (line.trim() !== "" && indentOf(line) <= indent) break;
    end += 1;
  }
  return end;
}

/**
 * Write the proof onto the row that already declares this version.
 *
 * EDITS THE YAML AS TEXT, deliberately. Round-tripping the file through a YAML
 * parser would reformat every section it touches — losing the comments that
 * carry this repository's reasoning, which are the most valuable thing in those
 * files. The insertion is anchored on the row's own `version:` line and its
 * indentation is taken from it.
 *
 * MERGES INTO AN EXISTING BLOCK rather than adding a second one. The first
 * version of this only ever inserted, so delivering the same version to a
 * second target wrote two `delivered:` keys into one mapping — and YAML rejects
 * duplicate keys, so the manual stopped parsing. That failure landed AFTER the
 * files were archived and committed, which is the worst possible moment: the
 * irreversible half had already happened.
 *
 * Each target carries its OWN commit, which is why merging is safe. Two targets
 * delivered from two commits is normal — a target can be handed a version
 * months after another one got it — and a single row-level commit could only
 * have described one of them.
 *
 * Returns `null` when no row declares that version: that is the caller's signal
 * that this is not a stamp but a new row, which is an agent's job to write.
 */
export function stampProof(
  yaml: string,
  version: string,
  proof: { readonly commit: string; readonly files: readonly DeliverableFile[] },
): string | null {
  const lines = yaml.split("\n");
  const found = locateRow(lines, version);
  if (found === null) return null;
  const indent = " ".repeat(found.indent);

  // Grouped by target, then by filename. A target receives a SET — the PDF and
  // the Word file — and an early version of this wrote one line per FILE under
  // the target's own key. The two collided, YAML kept the last, and the PDF's
  // hash vanished without a word. Grouping is what makes that collision
  // impossible rather than merely unlikely.
  const byTarget = new Map<string, DeliverableFile[]>();
  for (const f of proof.files) {
    const bucket = byTarget.get(f.axisValue);
    if (bucket) bucket.push(f);
    else byTarget.set(f.axisValue, [f]);
  }

  const entries = (pad: string): string[] =>
    [...byTarget.entries()].flatMap(([axisValue, files]) => [
      `${pad}${axisValue}:`,
      `${pad}  commit: ${proof.commit}`,
      `${pad}  files:`,
      ...files.map((f) => `${pad}    ${basename(f.path)}: ${f.sha}`),
    ]);

  if (found.delivered !== -1) {
    // Merged in at the END of the existing block, so the reading order matches
    // the order things were handed over.
    const end = blockEnd(lines, found.delivered, found.indent);
    return [
      ...lines.slice(0, end),
      ...entries(`${indent}  `),
      ...lines.slice(end),
    ].join("\n");
  }

  // After the row's `date:` when there is one, so the human-facing fields stay
  // together at the top of the row and the machinery sits below them.
  let insertAt = found.at + 1;
  while (insertAt < lines.length && /^\s*date:\s/.test(lines[insertAt] ?? "")) insertAt += 1;

  return [
    ...lines.slice(0, insertAt),
    `${indent}delivered:`,
    ...entries(`${indent}  `),
    ...lines.slice(insertAt),
  ].join("\n");
}

/** Write the stamped YAML back, or throw if the row vanished between reads. */
export function stampFile(
  sectionFile: string,
  version: string,
  proof: { readonly commit: string; readonly files: readonly DeliverableFile[] },
): boolean {
  const stamped = stampProof(readFileSync(sectionFile, "utf8"), version, proof);
  if (stamped === null) return false;
  writeFileSync(sectionFile, stamped, "utf8");
  return true;
}

/**
 * Take one target's proof back off a row.
 *
 * THE INVERSE OF `stampProof`, and text surgery for the same reason: a YAML
 * round-trip would reformat every section it touches and lose the comments that
 * carry this repository's reasoning.
 *
 * PER TARGET, because the proof is per target. Removing the whole `delivered:`
 * block to undo one document would erase the record of the OTHER one — which
 * still went out, and whose bytes are still in the archive. The block itself is
 * removed only when the last target leaves it: an empty `delivered:` would say
 * "handed over, nothing handed", and `deliveryProofFor` already treats that as
 * a lie worth guarding against.
 *
 * Returns null when there is nothing to undo — no such row, no proof, or no
 * entry for that target. Null is not a failure to report as an error; it is the
 * caller's signal that this document was never delivered at that version.
 */
export function unstampProof(
  yaml: string,
  version: string,
  axisValue: string,
): { readonly yaml: string; readonly files: readonly string[] } | null {
  const lines = yaml.split("\n");
  const found = locateRow(lines, version);
  if (found === null || found.delivered === -1) return null;
  const { delivered, indent: rowIndent } = found;

  const afterBlock = blockEnd(lines, delivered, rowIndent);
  const body = lines.slice(delivered + 1, afterBlock);
  const targetIndent = rowIndent + 2;

  const targetAt = body.findIndex(
    (l) => indentOf(l) === targetIndent && l.trim() === `${axisValue}:`,
  );
  if (targetAt === -1) return null;

  let afterTarget = targetAt + 1;
  const named: string[] = [];
  while (afterTarget < body.length) {
    const line = body[afterTarget] ?? "";
    if (line.trim() !== "" && indentOf(line) <= targetIndent) break;
    const file = /^\s*([^\s:]+):\s*[0-9a-f]{64}\s*$/.exec(line);
    if (file?.[1] !== undefined) named.push(file[1]);
    afterTarget += 1;
  }

  // Was that the only target? Then the block goes, not just the entry.
  const remaining = body.filter(
    (l, i) =>
      (i < targetAt || i >= afterTarget) && l.trim() !== "" && indentOf(l) === targetIndent,
  );

  const kept =
    remaining.length === 0
      ? [...lines.slice(0, delivered), ...lines.slice(afterBlock)]
      : [
          ...lines.slice(0, delivered + 1),
          ...body.slice(0, targetAt),
          ...body.slice(afterTarget),
          ...lines.slice(afterBlock),
        ];

  return { yaml: kept.join("\n"), files: named };
}

/** Take the proof off on disk. Null when there was nothing to take off. */
export function unstampFile(
  sectionFile: string,
  version: string,
  axisValue: string,
): readonly string[] | null {
  const undone = unstampProof(readFileSync(sectionFile, "utf8"), version, axisValue);
  if (undone === null) return null;
  writeFileSync(sectionFile, undone.yaml, "utf8");
  return undone.files;
}
