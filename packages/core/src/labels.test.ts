import { describe, expect, it } from "vitest";
import { catalog } from "@manualforge/blocks";
import { labelSites } from "./labels.ts";
import { loadSection, ContentError } from "./load.ts";

const FILE = "sections/03-seatmap.yaml";

const parse = (yaml: string) => loadSection(yaml, FILE, catalog);

describe("labelSites", () => {
  it("finds a field-list item's label, keyed by the item's own id", () => {
    const { node } = parse(`
id: s
title: Section
children:
  - id: s.campos
    type: field-list
    props:
      items:
        - id: s.campos.editar
          label: Editar distribución
          text: Habilita el modo de edición.
`);
    expect(labelSites(node, catalog)).toEqual([
      { at: "s.campos.editar", prop: "label", text: "Editar distribución" },
    ]);
  });

  it("finds a term-list entry's term", () => {
    const { node } = parse(`
id: s
title: Section
children:
  - id: s.terminos
    type: term-list
    props:
      entries:
        - id: s.terminos.libre
          term: Disponible
          definition: El puesto no tiene operador asignado.
`);
    expect(labelSites(node, catalog).map((l) => l.text)).toEqual(["Disponible"]);
  });

  // A table's headers are the product's own column headings, and they sit on the
  // BLOCK, so one id carries two labels.
  it("finds a table's headers on the block and each row's label on the row", () => {
    const { node } = parse(`
id: s
title: Section
children:
  - id: s.tabla
    type: data-table
    props:
      labelHeader: Operador ID
      descriptionHeader: Estado
      rows:
        - id: s.tabla.uno
          label: En llamada
          description: El operador está atendiendo.
`);
    expect(labelSites(node, catalog)).toEqual([
      { at: "s.tabla", prop: "labelHeader", text: "Operador ID" },
      { at: "s.tabla", prop: "descriptionHeader", text: "Estado" },
      { at: "s.tabla.uno", prop: "label", text: "En llamada" },
    ]);
  });

  // The distinction the whole feature turns on. A step's title is an
  // instruction the manual wrote, not a word the product owns — checking it
  // against the source would report every sentence as drifted.
  it("finds nothing in a procedure, whose step titles are the manual's own words", () => {
    const { node } = parse(`
id: s
title: Section
children:
  - id: s.pasos
    type: procedure
    props:
      steps:
        - id: s.pasos.uno
          title: Presione el lápiz
          text: Se habilita la edición.
`);
    expect(labelSites(node, catalog)).toEqual([]);
  });

  it("finds nothing in prose, which quotes no label of its own", () => {
    const { node } = parse(`
id: s
title: Section
children:
  - id: s.texto
    type: prose
    props:
      text: La vista **Seatmap** muestra la sala.
`);
    expect(labelSites(node, catalog)).toEqual([]);
  });

  it("walks nested sections", () => {
    const { node } = parse(`
id: s
title: Section
children:
  - id: s.sub
    title: Subsección
    children:
      - id: s.sub.campos
        type: field-list
        props:
          items:
            - id: s.sub.campos.uno
              label: Zonas
              text: Agrupa los puestos.
`);
    expect(labelSites(node, catalog).map((l) => l.at)).toEqual(["s.sub.campos.uno"]);
  });

  it("skips an optional header the author left out", () => {
    const { node } = parse(`
id: s
title: Section
children:
  - id: s.iconos
    type: icon-table
    props:
      labelHeader: Control
      rows:
        - id: s.iconos.uno
          label: Buscar
`);
    expect(labelSites(node, catalog).map((l) => l.prop)).toEqual(["labelHeader", "label"]);
  });
});

// --- the declaration -------------------------------------------------------

const withLabels = (labels: string, base = ""): string => `
id: s
title: Section
${base}labels:
${labels}
children:
  - id: s.campos
    type: field-list
    props:
      items:
        - id: s.campos.editar
          label: Editar distribución
          text: Habilita el modo de edición.
  - id: s.tabla
    type: data-table
    props:
      labelHeader: Operador ID
      descriptionHeader: Estado
      rows:
        - id: s.tabla.uno
          label: En llamada
          description: El operador está atendiendo.
`;

describe("loadSection — label citations", () => {
  it("parses a citation and hands it back beside the tree", () => {
    const { labels } = parse(
      withLabels("  - at: s.campos.editar\n    from: sitemap-editor-toolbar.tsx:22\n"),
    );
    expect(labels).toHaveLength(1);
    expect(labels[0]?.at).toBe("s.campos.editar");
    expect(labels[0]?.file).toBe("sitemap-editor-toolbar.tsx");
    expect(labels[0]?.line).toBe(22);
    // Resolved at parse time: the citation carries the text it is a citation OF,
    // so nothing downstream has to re-walk the tree to find out.
    expect(labels[0]?.text).toBe("Editar distribución");
    expect(labels[0]?.prop).toBe("label");
  });

  it("keeps citations out of the tree", () => {
    const { node } = parse(
      withLabels("  - at: s.campos.editar\n    from: sitemap-editor-toolbar.tsx:22\n"),
    );
    expect(JSON.stringify(node)).not.toContain("sitemap-editor-toolbar");
  });

  it("is empty for a section that cites none", () => {
    expect(parse("id: s\ntitle: Section\nchildren: []\n").labels).toEqual([]);
  });

  it("prefixes `sourceBase` when the section declares one", () => {
    const { labels } = parse(
      withLabels(
        "  - at: s.campos.editar\n    from: panels/sitemap-editor-toolbar.tsx:22\n",
        "sourceBase: src/modules/dashboard/presentation/ui/\n",
      ),
    );
    expect(labels[0]?.file).toBe(
      "src/modules/dashboard/presentation/ui/panels/sitemap-editor-toolbar.tsx",
    );
  });

  describe("what it refuses", () => {
    const run = (labels: string) => () => parse(withLabels(labels));

    it("an `at` that is not an id in this section", () => {
      const f = run("  - at: llamada.panel\n    from: x.tsx:1\n");
      expect(f).toThrow(ContentError);
      expect(f).toThrow(/llamada\.panel/);
    });

    // The point of pointing at an id instead of writing the text out: an id that
    // carries no label means the citation is protecting nothing.
    it("an `at` that carries no label at all", () => {
      const f = run("  - at: s\n    from: x.tsx:1\n");
      expect(f).toThrow(/no UI label/i);
    });

    it("an ambiguous `at`, naming the props to choose from", () => {
      const f = run("  - at: s.tabla\n    from: x.tsx:1\n");
      expect(f).toThrow(/labelHeader/);
      expect(f).toThrow(/descriptionHeader/);
    });

    it("accepts an ambiguous `at` once `prop` says which", () => {
      const { labels } = parse(
        withLabels("  - at: s.tabla\n    prop: descriptionHeader\n    from: x.tsx:1\n"),
      );
      expect(labels[0]?.text).toBe("Estado");
    });

    it("a `prop` that is not a label prop of that id", () => {
      const f = run("  - at: s.tabla\n    prop: rows\n    from: x.tsx:1\n");
      expect(f).toThrow(/rows/);
    });

    it("a `from` with no line number", () => {
      expect(run("  - at: s.campos.editar\n    from: x.tsx\n")).toThrow(/<file>:<line>/);
    });

    it("a `from` whose line is not a number", () => {
      expect(run("  - at: s.campos.editar\n    from: x.tsx:once\n")).toThrow(/<file>:<line>/);
    });

    it("two citations for the same label", () => {
      expect(
        run(
          "  - at: s.campos.editar\n    from: x.tsx:1\n" +
            "  - at: s.campos.editar\n    from: y.tsx:2\n",
        ),
      ).toThrow(/twice/i);
    });

    it("`labels` on a block rather than a section", () => {
      expect(() =>
        parse("id: b\ntype: prose\nlabels: []\nprops:\n  text: Texto.\n"),
      ).toThrow(/section/i);
    });
  });
});
