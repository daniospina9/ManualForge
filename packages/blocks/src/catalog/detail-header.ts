import { z } from "zod";
import type { BlockDefinition } from "../definition.js";

export const detailHeaderProps = z.object({
  text: z.string().min(1),
});

export type DetailHeaderProps = z.infer<typeof detailHeaderProps>;

export const detailHeader: BlockDefinition<DetailHeaderProps> = {
  type: "detail-header",
  version: "0.1.0",
  description:
    "Names one element of the surrounding subsection — a single control, a " +
    "single panel — when it needs its own short explanation. It is a label, " +
    "NOT a division of the document: it takes no number and figures under it " +
    "keep counting against the enclosing subsection. Use a nested section " +
    "instead when the content really is a numbered part of the manual.",
  schema: detailHeaderProps,
  children: { kind: "none" },
};
