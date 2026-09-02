import { z } from "zod";
import type { BlockDefinition } from "../definition.js";
import { selectorSchema } from "../conditioning.ts";
import { imageRefSchema } from "../image.ts";

export const iconTableRow = z.object({
  /** Stable id. Referenceable, and the slot the row's icon is delivered under. */
  id: z.string().min(1),
  /**
   * The control's icon. Omit it: the slot is this row's id, and it renders the
   * pending placeholder until the icon is delivered.
   */
  icon: imageRefSchema.optional(),
  label: z.string().min(1),
  /**
   * Optional. Some tables are a legend and nothing more — six agent types with
   * their icons, no explanation to give. Requiring a description there would
   * force whoever ports the content to invent sentences the source never said.
   */
  description: z.string().min(1).optional(),
  /** Conditioning for this ROW. Omitted means every target sees it. */
  when: selectorSchema.optional(),
});

export const iconTableProps = z.object({
  /** Middle column header — the source manual's own label. */
  labelHeader: z.string().min(1),
  /**
   * Omit for a two-column table. Some legends carry an icon and a single line
   * and nothing else; a third header over an empty column is furniture.
   */
  descriptionHeader: z.string().min(1).optional(),
  rows: z.array(iconTableRow).min(1),
});

export type IconTableProps = z.infer<typeof iconTableProps>;

export const iconTable: BlockDefinition<IconTableProps> = {
  type: "icon-table",
  version: "0.4.0",
  description:
    "A table describing icon-based UI controls, one row per control. The first " +
    "column always shows something: the control's icon once it is delivered, " +
    "the pending placeholder until then. Never an empty cell — a blank reads " +
    "as 'no control here'. Rows are DATA and each carries its own " +
    "conditioning, so a target that lacks a control simply does not get its " +
    "row and the table renumbers itself. Use this — never a hand-written " +
    "table — whenever rows can vary by target. Use `data-table` when the rows " +
    "are concepts rather than controls the reader must recognise on screen.",
  schema: iconTableProps,
  children: { kind: "none" },
  // Rows stay numbered so prose can refer to one specific control. The number
  // is no longer the icon's stand-in: a pending image now renders the
  // placeholder, and the slot — not the ordinal — is what the delivering area
  // receives in the manifest.
  numbering: { scope: "subsection", labelKey: "row", itemsProp: "rows" },
  images: {
    prop: "icon",
    itemsProp: "rows",
    showsProp: "label",
    policy: "always",
    convention: "icon",
  },
  // The headers are the product's own column headings, and each row's `label`
  // names the control. `description` is the manual explaining it.
  labels: {
    props: ["labelHeader", "descriptionHeader"],
    itemsProp: "rows",
    itemProps: ["label"],
  },
};
