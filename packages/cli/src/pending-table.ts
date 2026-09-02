import type { ImageSlotUse } from "@manualforge/core";

/** Where one image slot ended up once the document was paginated. */
export interface SlotPlacement {
  readonly slot: string;
  /** The page as the reader sees it printed, not the PDF's sheet index. */
  readonly page: number;
}

/** One line of the review table: an image, where to find it, room to answer. */
export interface PendingRow {
  readonly slot: string;
  /** What the manual says the image shows. The caption the reviewer reads. */
  readonly shows: string;
  /** Every page it appears on, ascending. Empty when the paginator saw none. */
  readonly pages: readonly number[];
}

/**
 * What the reviewer is being asked to write in the third column.
 *
 * NOT a constant, because the answer differs by how the manual was made. One
 * imported from a legacy document is answered by EXTRACTION — a page of the old
 * PDF. One written against a running product is answered by CAPTURE — where on
 * screen to find it. Printing the first sentence over a manual of the second
 * kind sends whoever fills the table to a document that does not describe their
 * product.
 */
export const DEFAULT_PENDING_INSTRUCTION =
  "Complete la tercera columna con la instrucción de extracción desde `Manual_Atlas_v5.pdf`.";

export interface PendingImageTable {
  readonly rows: readonly PendingRow[];
  readonly markdown: string;
  /** Instructions recovered from a previous edition of the table. */
  readonly carriedOver: number;
}

/**
 * A pipe inside a cell splits it, shifting every column to its right. Captions
 * are prose written by whoever authored the section, so this is not paranoia.
 */
const cell = (text: string): string => text.replace(/\|/g, "\\|").trim();

/** The inverse of `cell`, so an instruction survives any number of rebuilds. */
const uncell = (text: string): string => text.replace(/\\\|/g, "|").trim();

/**
 * The instructions already written into a previous edition, keyed by slot.
 *
 * Matched on the SLOT in the first cell, never on row position: the whole reason
 * the table is regenerated is that rows move. Anything unparseable is skipped
 * rather than thrown on — a half-edited table must still regenerate, and the
 * cost of a missed row is one instruction to retype, visibly blank.
 */
function previousInstructions(markdown: string): Map<string, string> {
  const found = new Map<string, string>();
  for (const line of markdown.split("\n")) {
    if (!line.trimStart().startsWith("|")) continue;
    // Split on the pipes that are CELL BOUNDARIES, not on the escaped ones a
    // caption or an instruction may contain. Splitting naively cuts such a row
    // one cell short, which silently drops the instruction written in it.
    const cells = line.split(/(?<!\\)\|/).slice(1, -1);
    if (cells.length < 3) continue;
    const slot = /^\s*`([^`]+)`/.exec(cells[0] ?? "")?.[1];
    const instruction = uncell(cells[2] ?? "");
    if (slot && instruction) found.set(slot, instruction);
  }
  return found;
}

/**
 * The pending images of one built target, in the order they are read.
 *
 * One row per SLOT, not per use: a slot is delivered as a single file, so a
 * shared image used in three places must not invite three different extraction
 * instructions for one filename. Its row simply carries all three pages.
 *
 * Order comes from the slot collection (document order), never from the
 * placements — the paginator reports in layout order, which is the same thing
 * until an image is pushed to the next page and overtakes its neighbour.
 */
export function pendingTable(
  uses: readonly ImageSlotUse[],
  pending: ReadonlySet<string>,
  placements: readonly SlotPlacement[],
  previous = "",
  instruction: string = DEFAULT_PENDING_INSTRUCTION,
): PendingImageTable {
  const answered = previousInstructions(previous);
  const pagesBySlot = new Map<string, Set<number>>();
  for (const { slot, page } of placements) {
    const seen = pagesBySlot.get(slot);
    if (seen) seen.add(page);
    else pagesBySlot.set(slot, new Set([page]));
  }

  const rows: PendingRow[] = [];
  const emitted = new Set<string>();
  for (const use of uses) {
    if (!pending.has(use.slot) || emitted.has(use.slot)) continue;
    emitted.add(use.slot);
    rows.push({
      slot: use.slot,
      shows: use.shows,
      pages: [...(pagesBySlot.get(use.slot) ?? [])].sort((a, b) => a - b),
    });
  }

  // The third column starts empty on purpose: it is the reviewer's, filled one
  // row at a time with what to extract from the source PDF. Everything else on
  // the line is what they need in order to answer it. An answer already given
  // comes back, because regenerating for fresh page numbers must never cost the
  // work already done.
  const carried = rows.filter((r) => answered.has(r.slot));
  const lines = [
    "# Imágenes pendientes",
    "",
    `${rows.length} imágenes pendientes, en el orden en que aparecen en el manual.`,
    instruction,
    "",
    "Los números de página valen para la última construcción del manual. Regenere la tabla" +
      " (`build --pending-table`) después de cambiar contenido: las instrucciones ya escritas" +
      " se conservan.",
    "",
    // "Cómo obtenerla" rather than "Instrucción de extracción": the column is
    // answered by extraction in an imported manual and by capture in one
    // written against a running product, and one heading has to be true of
    // both. The sentence above it is where the manual says which.
    "| Imagen | Pág. | Cómo obtenerla |",
    "| --- | --- | --- |",
    ...rows.map((r) => {
      const shows = r.shows ? ` — ${cell(r.shows)}` : "";
      const pages = r.pages.length === 0 ? "—" : r.pages.join(", ");
      const instruction = answered.get(r.slot);
      return `| \`${r.slot}\`${shows} | ${pages} | ${instruction ? cell(instruction) : ""} |`;
    }),
    "",
  ];

  return { rows, markdown: lines.join("\n"), carriedOver: carried.length };
}
