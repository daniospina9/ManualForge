import { z } from "zod";
import { selectorSchema } from "../conditioning.ts";
import type { BlockDefinition } from "../definition.ts";

/**
 * What ONE TARGET received, and the commit it was built from.
 *
 * `commit` is the anchor everything downstream needs. Without it, "what changed
 * since the last delivery" has no starting point and has to be remembered; with
 * it, the answer is `git log <commit>..HEAD` and there is nothing to remember.
 *
 * `files` is by FILENAME, because a target receives a SET — the PDF and the Word
 * file, and one day perhaps more. An earlier schema had one hash per target and
 * the two artefacts collided on the same YAML key: duplicates collapse
 * silently, last one wins, and the PDF's hash was simply gone.
 */
export const targetProof = z.object({
  /** The commit this target's delivered files were built from. Short or full SHA. */
  commit: z.string().regex(/^[0-9a-f]{7,40}$/, "commit must be a hex git SHA"),
  files: z
    .record(
      z.string().min(1),
      z.string().regex(/^[0-9a-f]{64}$/, "must be a SHA-256, 64 hex characters"),
    )
    .refine((f) => Object.keys(f).length > 0, {
      message: "a target with no files proves nothing — record one hash per file",
    }),
});

/**
 * Proof that a version was actually handed to the client, and of exactly what.
 *
 * ITS PRESENCE IS THE STATE. A row carrying this was delivered and is now a
 * historical FACT — what the client holds, not what we think we sent. A row
 * without it is a version declared but not yet handed over. Modelling the state
 * as the absence of proof rather than as a `delivered: true` flag is deliberate:
 * a flag is a claim somebody typed, and a claim can be wrong. A hash cannot.
 *
 * KEYED BY AXIS VALUE, ALL THE WAY DOWN, and the whole shape turns on that. A
 * delivery is per target: one round can hand `north` 1.1.0 and `south` 1.0.0, and a
 * target can be handed a version months after another target got it.
 *
 * `commit` used to sit here, ONE per row, above a `files` map keyed by target.
 * That single field could not describe two targets delivered from two commits,
 * and it broke three ways at once: a second delivery of the same version wrote
 * a duplicate `delivered:` key and made the manual unparseable; merging into the
 * existing block instead would have anchored the second target to the first
 * one's commit, sending its next summary to diff from the wrong point; and every
 * reader asking "was this delivered?" got a row-level answer, so a target that
 * had received NOTHING was told the version was already handed over.
 *
 * One shape fixes all three, because all three were the same mistake: the proof
 * is per target, so nothing about it belongs above the target.
 *
 * The bytes themselves live in `deliveries/`, outside git — see its README for
 * why. This is the part that survives forever.
 */
export const deliveryProof = z
  .record(z.string().min(1), targetProof)
  .refine((p) => Object.keys(p).length > 0, {
    message: "a delivery with no targets proves nothing",
  });

export type DeliveryProof = z.infer<typeof deliveryProof>;

/**
 * One delivered version of the manual.
 *
 * `version` is the version DELIVERED TO THE CLIENT, which is not the same
 * number as `manual.contentVersion` in `manual.config.yaml`. That one moves
 * with internal work — a corrected figure, a reworded paragraph. This one moves
 * only when something reaches the client, and only when the owner says so.
 * Keeping them apart is the whole reason this block exists.
 *
 * `date` is ISO `YYYY-MM-DD` in the source and is FORMATTED on the way out, so
 * that a typo is a validation error rather than a wrong date printed with
 * confidence. See `formatChangeLogDate`.
 *
 * `when` is what lets one row belong to some targets and not others. A version
 * delivered to one tenant and not another is the normal case, not the
 * exception: the manuals are conditioned, so their delivery histories diverge.
 */
export const changeLogRow = z.object({
  id: z.string().min(1),
  version: z
    .string()
    .regex(
      /^\d+\.\d+\.\d+$/,
      "version must be MAJOR.MINOR.PATCH — the delivered version is derived by " +
        "comparing these numerically, and a free-form string cannot be ordered",
    ),
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "date must be ISO YYYY-MM-DD"),
  description: z.string().min(1),
  /** Present once the version has actually been handed over. See above. */
  delivered: deliveryProof.optional(),
  when: selectorSchema.optional(),
});

export const changeLogProps = z.object({
  versionHeader: z.string().min(1),
  dateHeader: z.string().min(1),
  descriptionHeader: z.string().min(1),
  rows: z.array(changeLogRow).min(1),
});

export type ChangeLogProps = z.infer<typeof changeLogProps>;

/**
 * ISO `YYYY-MM-DD` -> `DD/MM/YYYY`, which is what a Spanish-language manual
 * prints.
 *
 * Lives here rather than in each renderer because two copies of a date format
 * are two copies that drift, and the block is the one thing both renderers
 * already import. Deliberately NOT `Intl.DateTimeFormat`: that reads the host's
 * timezone, and a date with no time in it can come back a day early west of
 * UTC — a delivery date is a fact, not an instant.
 */
export function formatChangeLogDate(iso: string): string {
  const [year, month, day] = iso.split("-");
  return `${day}/${month}/${year}`;
}

export const changeLog: BlockDefinition<ChangeLogProps> = {
  type: "change-log",
  // 0.2.0: `delivered` added. A new optional prop is a MINOR.
  version: "0.2.0",
  description:
    "The manual's own delivery history: one row per version handed to the " +
    "client, with the date and a short statement of what that delivery " +
    "changed. Belongs in the final module of a manual and nowhere else. Not " +
    "data-table, whose two columns quote the PRODUCT and feed the label " +
    "citation check — every word in a change log is the manual's own, and a " +
    "version number is not a UI label. Rows condition individually, because " +
    "a version delivered to one target and not another is normal. A row may " +
    "carry `delivered`, the proof of what the client actually received; that " +
    "proof is metadata and never reaches the page.",
  schema: changeLogProps,
  children: { kind: "none" },
  // No `numbering`: the version column IS the row's identity, and a second
  // ordinal beside it would be a number the reader has to ignore.
  //
  // No `images`: this is the one block in the catalogue about the manual rather
  // than about a screen, so there is nothing to photograph. The overview-figure
  // rule in `module-completeness` does not reach the module built from it.
  //
  // No `labels`: nothing here is quoted from the product. Declaring one would
  // send the label checker looking for `1.4.7` in the source and report the
  // manual's own delivery history as drifted.
};
