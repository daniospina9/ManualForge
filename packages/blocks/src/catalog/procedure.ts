import { z } from "zod";
import { selectorSchema } from "../conditioning.ts";
import type { BlockDefinition } from "../definition.ts";
import { imageRefSchema } from "../image.ts";

export const procedureStep = z.object({
  id: z.string().min(1),
  /** Title WITHOUT an ordinal — "Paso 1:" is supplied by the renderer. */
  title: z.string().min(1),
  text: z.string().min(1),
  /**
   * The control this step tells the operator to press. Omit it: the slot is
   * this step's id. Showing the control is the single most useful thing the
   * manual does, so the slot is always declared and renders the pending
   * placeholder until the image arrives.
   */
  image: imageRefSchema.optional(),
  /**
   * How this item's text and image sit together.
   *
   * - `below` — the image under the text, full column width. The default, and
   *   right whenever the explanation is long enough to stand on its own.
   * - `beside` — text on the left, image on the right. For a short explanation
   *   whose image would otherwise leave a band of empty page beside two lines
   *   of prose.
   *
   * Declared per item, never inferred from how long the text happens to be:
   * every procedure here mixes short and long steps, and a layout that changed
   * because someone edited a word would be a layout nobody can rely on.
   */
  layout: z.enum(["below", "beside"]).default("below"),
  /**
   * Rendered width of this item's image, as a percentage of the space it sits in
   * — the text column when the layout is `below`, the figure column when it is
   * `beside`. Omit to let the stylesheet cap it.
   *
   * Declared per item because a control strip and a full screen do not want the
   * same width, and cropping the file instead would be undone by the next
   * delivery.
   */
  widthPercent: z.number().int().min(10).max(100).optional(),
  /** Sub-actions inside this step, in order. */
  actions: z.array(z.string().min(1)).optional(),
  when: selectorSchema.optional(),
});

export const procedureProps = z.object({
  /** Sentence introducing the sequence. Optional. */
  lead: z.string().optional(),
  steps: z.array(procedureStep).min(1),
  /**
   * Id of the procedure whose step numbering this one continues.
   *
   * For one sequence that has to be interrupted — a reference table belongs
   * after step 9, and a table can only be a sibling node, which ends the block.
   * Without this the reader sees step 9, a table, then step 1 again.
   *
   * Write the id of the procedure to continue, never a starting number: a
   * number goes stale the moment a step is inserted above it, and the result is
   * a misnumbered manual that builds without complaint.
   *
   * Do not use it to glue together two sequences that are genuinely different
   * activities. Those are two procedures and should each start at 1.
   */
  continues: z.string().min(1).optional(),
});

export type ProcedureProps = z.infer<typeof procedureProps>;

export const procedure: BlockDefinition<ProcedureProps> = {
  type: "procedure",
  version: "0.5.0",
  description:
    "An ordered sequence the reader performs: dispatch, login, updating a " +
    "report. Steps are numbered by position AFTER conditioning, so a target " +
    "that cannot see a step has the following ones shift up. Never write an " +
    "ordinal into a step title. Use field-list instead when the entries are " +
    "things to know rather than things to do, in no particular order.",
  schema: procedureProps,
  children: { kind: "none" },
  numbering: {
    scope: "block",
    labelKey: "step",
    itemsProp: "steps",
    continuesProp: "continues",
  },
  images: {
    prop: "image",
    itemsProp: "steps",
    showsProp: "title",
    policy: "always",
    convention: "figure",
  },
};
