import { z } from "zod";
import { selectorSchema } from "../conditioning.ts";
import type { BlockDefinition } from "../definition.ts";
import { imageRefSchema } from "../image.ts";

export const termListEntry = z.object({
  id: z.string().min(1),
  term: z.string().min(1),
  definition: z.string().min(1),
  /** Illustration for this one entry. Opt-in — most entries need none. */
  image: imageRefSchema.optional(),
  when: selectorSchema.optional(),
});

export const termListProps = z.object({
  entries: z.array(termListEntry).min(1),
});

export type TermListProps = z.infer<typeof termListProps>;

export const termList: BlockDefinition<TermListProps> = {
  type: "term-list",
  version: "0.4.0",
  description:
    "A tight run of term-and-definition pairs, one line each — the options of a " +
    "single control, a short glossary. Entries normally carry no image; one that " +
    "does renders as a numbered figure like any other, which interrupts the " +
    "list, so prefer field-list when an entry needs a full paragraph or a " +
    "screenshot. Use data-table when the entries are numerous enough that a " +
    "reader will scan rather than read them.",
  schema: termListProps,
  children: { kind: "none" },
  images: {
    prop: "image",
    itemsProp: "entries",
    showsProp: "term",
    policy: "optional",
    convention: "figure",
  },
  // `term` is what the screen calls it; `definition` is the manual's own words.
  labels: { itemsProp: "entries", itemProps: ["term"] },
};
