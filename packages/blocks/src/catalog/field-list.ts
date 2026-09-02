import { z } from "zod";
import { selectorSchema } from "../conditioning.ts";
import type { BlockDefinition } from "../definition.ts";
import { imageRefSchema } from "../image.ts";

export const fieldListItem = z.object({
  id: z.string().min(1),
  /** Name of the element as the product shows it. */
  label: z.string().min(1),
  text: z.string().min(1),
  /**
   * Screenshot of this one element. Omit it: the slot is then this item's id,
   * and it renders the pending placeholder until the image is delivered — so a
   * module can be written long before its captures exist.
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
  when: selectorSchema.optional(),
});

export const fieldListProps = z.object({
  items: z.array(fieldListItem).min(1),
});

export type FieldListProps = z.infer<typeof fieldListProps>;

export const fieldList: BlockDefinition<FieldListProps> = {
  type: "field-list",
  version: "0.5.0",
  description:
    "A run of named UI elements, each with its own explanation and its own " +
    "screenshot — filter fields, dashboard widgets, panel controls. Use this " +
    "instead of alternating detail-header / prose / figure: only this block " +
    "conditions each element as a unit, and its screenshots illustrate the " +
    "element rather than becoming numbered figures. Prefer term-list when the " +
    "entries are short definitions with no screenshots.",
  schema: fieldListProps,
  children: { kind: "none" },
  images: {
    prop: "image",
    itemsProp: "items",
    showsProp: "label",
    policy: "always",
    convention: "figure",
  },
  // `label` is the element's name as the product shows it (see the schema).
  // `text` is the manual's own explanation and is not quoted from anywhere.
  labels: { itemsProp: "items", itemProps: ["label"] },
};
