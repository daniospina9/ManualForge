import { z } from "zod";
import type { BlockDefinition } from "../definition.ts";
import { imageRefSchema } from "../image.ts";

export const figureProps = z.object({
  /**
   * Which image this figure shows. Omit it — the slot is then this node's own
   * id, which is the convention. Give a slot name only to share one delivered
   * image with another place in the manual. Never a filename: see `image.ts`.
   */
  image: imageRefSchema.optional(),
  /** Caption text WITHOUT a number — the number is assigned at build time. */
  caption: z.string().min(1),
  /** Rendered width as a percentage of the text column. */
  widthPercent: z.number().int().min(10).max(100).default(100),
});

export type FigureProps = z.infer<typeof figureProps>;

export const figure: BlockDefinition<FigureProps> = {
  type: "figure",
  version: "0.3.0",
  description:
    "A captioned image the text can refer back to. The caption must not " +
    "contain a figure number: numbers are assigned per build target, because " +
    "a target that skips a section shifts every figure number after it. The " +
    "image itself is a slot, not a file — it renders the pending placeholder " +
    "until the delivering area supplies it.",
  schema: figureProps,
  children: { kind: "none" },
  images: { prop: "image", showsProp: "caption", policy: "always", convention: "figure" },
};
