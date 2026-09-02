import { describe, expect, it } from "vitest";
import { pendingTable, type PendingRow } from "./pending-table.ts";

const use = (slot: string, shows: string, nodeId = slot) => ({
  slot,
  nodeId,
  blockType: "figure",
  shows,
  convention: "figure" as const,
});

const rows = (
  uses: ReadonlyArray<ReturnType<typeof use>>,
  pending: ReadonlySet<string>,
  pages: ReadonlyArray<{ slot: string; page: number }>,
): readonly PendingRow[] => pendingTable(uses, pending, pages).rows;

describe("pendingTable", () => {
  it("keeps document order, which is the order the reviewer reads the manual in", () => {
    const r = rows(
      [use("a", "Primera"), use("b", "Segunda"), use("c", "Tercera")],
      new Set(["a", "b", "c"]),
      [
        { slot: "c", page: 9 },
        { slot: "a", page: 3 },
        { slot: "b", page: 5 },
      ],
    );
    expect(r.map((x) => x.slot)).toEqual(["a", "b", "c"]);
  });

  it("lists only pending slots — a delivered one needs no instruction", () => {
    const r = rows([use("a", "Primera"), use("b", "Segunda")], new Set(["b"]), [
      { slot: "a", page: 3 },
      { slot: "b", page: 5 },
    ]);
    expect(r.map((x) => x.slot)).toEqual(["b"]);
  });

  // The same file can illustrate two places. It is delivered ONCE, so it is one
  // row with both pages — not two rows inviting two different instructions for
  // one filename.
  it("collapses a slot used twice into one row carrying both pages", () => {
    const r = rows(
      [use("a", "Vista", "n1"), use("b", "Otra"), use("a", "Vista", "n2")],
      new Set(["a", "b"]),
      [
        { slot: "a", page: 4 },
        { slot: "b", page: 6 },
        { slot: "a", page: 11 },
      ],
    );
    expect(r).toHaveLength(2);
    expect(r[0]?.slot).toBe("a");
    expect(r[0]?.pages).toEqual([4, 11]);
  });

  it("sorts and deduplicates the pages of a repeated slot", () => {
    const r = rows([use("a", "Vista")], new Set(["a"]), [
      { slot: "a", page: 11 },
      { slot: "a", page: 4 },
      { slot: "a", page: 11 },
    ]);
    expect(r[0]?.pages).toEqual([4, 11]);
  });

  // Not knowing where an image landed is a fact worth printing, not a reason to
  // drop the row: dropping it would silently shorten the very list that says
  // what is left to do.
  it("keeps a pending slot the paginator never reported, with no page", () => {
    const r = rows([use("a", "Vista")], new Set(["a"]), []);
    expect(r).toHaveLength(1);
    expect(r[0]?.pages).toEqual([]);
  });

  it("counts what it emitted, so the table can be checked against the manifest", () => {
    const table = pendingTable([use("a", "A"), use("b", "B")], new Set(["a", "b"]), [
      { slot: "a", page: 2 },
      { slot: "b", page: 3 },
    ]);
    expect(table.rows).toHaveLength(2);
    expect(table.markdown).toContain("2 imágenes pendientes");
  });
});

// The page numbers go stale every time the content shifts, so this table gets
// regenerated while it is being filled in. Losing the answers on regeneration
// would mean it can only ever be filled in one sitting.
describe("carrying forward instructions already written", () => {
  const previous = [
    "| Imagen | Pág. | Instrucción de extracción |",
    "| --- | --- | --- |",
    "| `a` — Vista | 4 | Recortar la figura 3.2, página 12 |",
    "| `b` — Otra | 6 |  |",
  ].join("\n");

  it("keeps an instruction against its slot when the page moved", () => {
    const md = pendingTable([use("a", "Vista")], new Set(["a"]), [{ slot: "a", page: 40 }], previous)
      .markdown;
    const row = md.split("\n").find((l) => l.includes("`a`"));
    expect(row).toContain("Recortar la figura 3.2, página 12");
    expect(row).toContain("| 40 |");
  });

  it("leaves a slot that was never answered empty", () => {
    const md = pendingTable([use("b", "Otra")], new Set(["b"]), [{ slot: "b", page: 6 }], previous)
      .markdown;
    expect(md.split("\n").find((l) => l.includes("`b`"))?.trimEnd().endsWith("|  |")).toBe(true);
  });

  // A slot that got delivered leaves the table; its instruction leaves with it,
  // and must not reattach to whatever row happens to sit at that index next.
  it("drops the instruction of a slot that is no longer pending", () => {
    const md = pendingTable([use("b", "Otra")], new Set(["b"]), [{ slot: "b", page: 6 }], previous)
      .markdown;
    expect(md).not.toContain("Recortar la figura 3.2");
  });

  it("reports how many instructions it carried over", () => {
    const t = pendingTable([use("a", "Vista"), use("b", "Otra")], new Set(["a", "b"]), [], previous);
    expect(t.carriedOver).toBe(1);
  });

  it("survives a previous file that is empty or has no table at all", () => {
    for (const junk of ["", "# Imágenes pendientes\n\nsin tabla todavía\n"]) {
      const t = pendingTable([use("a", "Vista")], new Set(["a"]), [{ slot: "a", page: 2 }], junk);
      expect(t.carriedOver).toBe(0);
      expect(t.rows).toHaveLength(1);
    }
  });

  it("restores a pipe that was escaped when the instruction was written out", () => {
    const md = pendingTable(
      [use("a", "Vista")],
      new Set(["a"]),
      [{ slot: "a", page: 2 }],
      "| `a` — Vista | 4 | Cortar el panel Alta \\| Baja |",
    ).markdown;
    // Round-trips: escaped on the way out, so regenerating twice cannot grow
    // the backslashes without bound.
    expect(md).toContain("Cortar el panel Alta \\| Baja");
    expect(md).not.toContain("\\\\|");
  });
});

describe("the rendered markdown", () => {
  const table = () =>
    pendingTable(
      [use("barra.busqueda", "Barra de búsqueda"), use("mapa.fig", "Vista del mapa")],
      new Set(["barra.busqueda", "mapa.fig"]),
      [
        { slot: "barra.busqueda", page: 12 },
        { slot: "mapa.fig", page: 31 },
      ],
    ).markdown;

  it("has exactly the three columns asked for", () => {
    const header = table().split("\n").find((l) => l.startsWith("| Imagen"));
    expect(header?.split("|").filter((c) => c.trim()).length).toBe(3);
  });

  it("identifies each image by slot and by what it shows", () => {
    expect(table()).toContain("`barra.busqueda`");
    expect(table()).toContain("Barra de búsqueda");
  });

  it("leaves the instruction column empty — it is the reviewer's to fill", () => {
    const row = table().split("\n").find((l) => l.includes("barra.busqueda"));
    expect(row?.trimEnd().endsWith("|  |")).toBe(true);
  });

  it("prints a page with no number as an em dash rather than an empty cell", () => {
    const md = pendingTable([use("a", "Vista")], new Set(["a"]), []).markdown;
    expect(md).toContain("| — |");
  });

  // A pipe in a caption would split the cell and shift every column right of it.
  it("escapes a pipe in the caption", () => {
    const md = pendingTable([use("a", "Alta | Baja")], new Set(["a"]), [
      { slot: "a", page: 2 },
    ]).markdown;
    const row = md.split("\n").find((l) => l.includes("`a`"));
    expect(row?.split("|").filter((c) => c.trim()).length).toBe(3);
    expect(md).toContain("Alta \\| Baja");
  });
});

describe("what the reviewer is asked to write", () => {
  const rows = [use("a", "Vista")];

  it("asks for an extraction from the legacy PDF by default", () => {
    const md = pendingTable(rows, new Set(["a"]), []).markdown;
    expect(md).toContain("Manual_Atlas_v5.pdf");
  });

  /**
   * A manual written against a running product has nothing to extract FROM.
   * Printing the default sentence over its table sends whoever fills it to a
   * document describing a different product entirely.
   */
  it("prints the manual's own sentence when it declares one", () => {
    const md = pendingTable(
      rows,
      new Set(["a"]),
      [],
      "",
      "Indique dónde se llega a esa pantalla en Beacon360.",
    ).markdown;
    expect(md).toContain("Indique dónde se llega a esa pantalla en Beacon360.");
    expect(md).not.toContain("Manual_Atlas_v5.pdf");
  });

  /**
   * The heading is neutral so it stays true of both kinds of manual, and the
   * carry-over must not be keyed on it: tables written under the old heading
   * are already on disk with answers in them.
   */
  it("recovers instructions from a table written under the old heading", () => {
    const old = [
      "| Imagen | Pág. | Instrucción de extracción |",
      "| --- | --- | --- |",
      "| `a` — Vista | 4 | Recortar la figura 3.2 |",
    ].join("\n");
    const md = pendingTable(rows, new Set(["a"]), [{ slot: "a", page: 9 }], old).markdown;
    expect(md).toContain("Cómo obtenerla");
    expect(md).toContain("Recortar la figura 3.2");
  });
});
