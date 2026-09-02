import { z } from "zod";
import type { BlockDefinition } from "../definition.ts";

/**
 * A closed set. Adding a variant is a design decision, not an authoring one —
 * an open string here is how a document ends up with six shades of aside.
 */
export const calloutVariant = z.enum(["info", "important"]);

export const calloutProps = z.object({
  variant: calloutVariant.default("info"),
  text: z.string().min(1),
});

export type CalloutProps = z.infer<typeof calloutProps>;

export const callout: BlockDefinition<CalloutProps> = {
  type: "callout",
  version: "0.1.0",
  description:
    "A short aside the reader must not miss — a precondition, a caveat, a " +
    "consequence. `info` for context worth highlighting, `important` for " +
    "something that will cost the reader if ignored. Use sparingly: a page of " +
    "callouts is a page with no emphasis at all.",
  schema: calloutProps,
  children: { kind: "none" },
};
