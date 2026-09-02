import { z } from "zod";
import type { BlockDefinition } from "../definition.ts";

export const proseProps = z.object({
  /** Paragraph text. `**bold**` is the only inline markup. */
  text: z.string().min(1),
});

export type ProseProps = z.infer<typeof proseProps>;

export const prose: BlockDefinition<ProseProps> = {
  type: "prose",
  version: "0.4.0",
  description:
    "A body paragraph. Use for explanatory text between structured blocks. Do " +
    "not use it to fake a list, a table or a callout — those have their own " +
    "block types and only they condition and renumber correctly. It carries no " +
    "image: an illustrated paragraph is a paragraph followed by a `figure`, " +
    "because every image outside a table is a captioned, numbered figure.",
  schema: proseProps,
  children: { kind: "none" },
};
