import { describe, expect, it } from "vitest";
import { catalog } from "@manualforge/blocks";
import { loadSection, ContentError } from "./load.ts";

const FILE = "sections/04-dashboard.yaml";

/**
 * A section declaring one gap the product has not finished.
 *
 * The declaration is what the `module-completeness` coverage rule already
 * allowed in prose — "cover it or state explicitly why an item is out of
 * scope" — turned into something a command can read.
 */
const withPending = (pending: string, children = "  - id: dashboard.historial\n    type: prose\n    props:\n      text: Historial.\n"): string => `
id: dashboard
title: Dashboard
pending:
${pending}
children:
${children}
`;

const ONE = `  - id: dashboard.historial.estado
    covers: [dashboard.historial]
    missing: La columna ESTADO de la pestaña Historial de Eventos.
    because: El color sale del índice de la fila (events-history-columns.tsx:103).
    settles: Que el producto la conecte a datos reales.
`;

describe("loadSection — pending declarations", () => {
  it("parses a declaration and hands it back beside the tree", () => {
    const { pending } = loadSection(withPending(ONE), FILE, catalog);
    expect(pending).toHaveLength(1);
    expect(pending[0]?.id).toBe("dashboard.historial.estado");
    expect(pending[0]?.covers).toEqual(["dashboard.historial"]);
    expect(pending[0]?.section).toBe("dashboard");
    expect(pending[0]?.file).toBe(FILE);
  });

  // The load-bearing property. The whole policy is that the manual does NOT
  // name the unfinished part, so a declaration that could reach a renderer
  // would publish exactly what it exists to withhold.
  it("keeps the declaration out of the tree entirely", () => {
    const { node } = loadSection(withPending(ONE), FILE, catalog);
    expect(node).not.toHaveProperty("pending");
    expect(JSON.stringify(node)).not.toContain("events-history-columns");
    expect(JSON.stringify(node)).not.toContain("ESTADO");
  });

  it("is empty for a section that declares none", () => {
    const { pending } = loadSection("id: s\ntitle: Section\nchildren: []\n", FILE, catalog);
    expect(pending).toEqual([]);
  });

  describe("every field is required, because a half-filled entry is prose again", () => {
    const without = (field: string): string =>
      withPending(
        ONE.split("\n")
          .filter((l) => !l.trim().startsWith(`${field}:`))
          .join("\n"),
      );

    for (const field of ["covers", "missing", "because", "settles"]) {
      it(`refuses an entry with no \`${field}\``, () => {
        expect(() => loadSection(without(field), FILE, catalog)).toThrow(ContentError);
        expect(() => loadSection(without(field), FILE, catalog)).toThrow(
          new RegExp(`\`${field}\``),
        );
      });
    }

    it("refuses an entry with no `id`, since the queue is keyed on it", () => {
      const noId = ONE.replace("  - id: dashboard.historial.estado\n    covers:", "  - covers:");
      expect(() => loadSection(withPending(noId), FILE, catalog)).toThrow(/`id`/);
    });
  });

  // `covers` is the join between the queue and the content. Resolved within the
  // section on purpose: a gap is declared in the file whose content it is
  // missing from, so this is checkable at parse time and cannot rot into a
  // pointer at deleted content.
  describe("covers names ids in this section", () => {
    it("refuses an id that is not in this file", () => {
      const strayId = ONE.replace("[dashboard.historial]", "[llamada.panel]");
      const run = (): unknown => loadSection(withPending(strayId), FILE, catalog);
      expect(run).toThrow(ContentError);
      expect(run).toThrow(/llamada\.panel/);
      expect(run).toThrow(/this section/i);
    });

    it("accepts the section's own id", () => {
      const own = ONE.replace("[dashboard.historial]", "[dashboard]");
      expect(loadSection(withPending(own), FILE, catalog).pending).toHaveLength(1);
    });

    it("accepts an id nested deeper in the section", () => {
      const nested =
        "  - id: dashboard.tabs\n    title: Pestañas\n    children:\n      - id: dashboard.historial\n        type: prose\n        props:\n          text: Historial.\n";
      expect(loadSection(withPending(ONE, nested), FILE, catalog).pending).toHaveLength(1);
    });

    it("refuses an empty `covers`, which would point the queue at nothing", () => {
      const empty = ONE.replace("[dashboard.historial]", "[]");
      expect(() => loadSection(withPending(empty), FILE, catalog)).toThrow(/at least one/i);
    });
  });

  it("refuses two entries with the same id", () => {
    expect(() => loadSection(withPending(ONE + ONE), FILE, catalog)).toThrow(/duplicate/i);
  });

  it("refuses a `pending` that is not a list", () => {
    const notList = `
id: dashboard
title: Dashboard
pending: la columna ESTADO no funciona
children: []
`;
    expect(() => loadSection(notList, FILE, catalog)).toThrow(/list/i);
  });

  // A block is not a section and has no coverage obligation of its own — the
  // key there is a mistake worth naming rather than ignoring.
  it("refuses `pending` on a block", () => {
    const onBlock = `
id: b
type: prose
pending: []
props:
  text: Texto.
`;
    expect(() => loadSection(onBlock, FILE, catalog)).toThrow(/section/i);
  });
});
