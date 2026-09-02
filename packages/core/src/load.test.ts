import { describe, expect, it } from "vitest";
import { catalog } from "@manualforge/blocks";
import { loadSection, ContentError } from "./load.ts";

const FILE = "sections/test.yaml";

describe("loadSection", () => {
  // The schema's messages are the only place an author is told why a perfectly
  // reasonable-looking line is refused, so they have to survive the trip
  // through zod and out of the loader — not arrive as "Invalid input".
  describe("image slots, not file paths", () => {
    const withFigure = (props: string): string => `
id: s
title: Section
children:
  - id: s.fig
    type: figure
    props:
${props}
`;

    it("rejects a path in an image prop, and says what to write instead", () => {
      const run = (): unknown =>
        loadSection(withFigure("      image: icons/search.png\n      caption: Buscar"), FILE, catalog);
      expect(run).toThrow(ContentError);
      expect(run).toThrow(/file path/i);
      expect(run).toThrow(/image: true/);
      expect(run).toThrow(/s\.fig/);
    });

    it("rejects a bare filename", () => {
      expect(() =>
        loadSection(withFigure("      image: home-overview.png\n      caption: Inicio"), FILE, catalog),
      ).toThrow(/extension/i);
    });

    it("accepts an omitted image — the slot is the node's own id", () => {
      const { node } = loadSection(withFigure("      caption: Inicio"), FILE, catalog);
      expect(node.kind).toBe("section");
    });

    it("accepts `true` and an explicit slot name", () => {
      expect(() =>
        loadSection(withFigure("      image: true\n      caption: Inicio"), FILE, catalog),
      ).not.toThrow();
      expect(() =>
        loadSection(withFigure("      image: barra.busqueda\n      caption: Inicio"), FILE, catalog),
      ).not.toThrow();
    });
  });

  describe("`when` selector validation", () => {
    it("accepts an array selector on a section", () => {
      const yaml = `
id: s
title: Section
when:
  tenant: [north]
children: []
`;
      const { node } = loadSection(yaml, FILE, catalog);
      expect(node.when).toEqual({ tenant: ["north"] });
    });

    it("rejects a scalar selector value instead of silently degrading to substring matching", () => {
      const yaml = `
id: s
title: Section
when:
  tenant: north
children: []
`;
      expect(() => loadSection(yaml, FILE, catalog)).toThrow(ContentError);
    });

    it("rejects an empty selector array", () => {
      const yaml = `
id: s
title: Section
when:
  tenant: []
children: []
`;
      expect(() => loadSection(yaml, FILE, catalog)).toThrow(ContentError);
    });

    it("validates `when` on a block node too", () => {
      const yaml = `
id: b
type: prose
when:
  tenant: north
props:
  text: hola
`;
      expect(() => loadSection(yaml, FILE, catalog)).toThrow(ContentError);
    });
  });

  describe("literal number / anchor checks", () => {
    describe("title / subtitle — hard error", () => {
      it("rejects a title that is only an outline number", () => {
        const yaml = `
id: s
title: "5.2"
children: []
`;
        expect(() => loadSection(yaml, FILE, catalog)).toThrow(ContentError);
      });

      it("rejects a title with a parenthesised outline number prefix", () => {
        const yaml = `
id: s
title: "5) Barra Superior"
children: []
`;
        expect(() => loadSection(yaml, FILE, catalog)).toThrow(ContentError);
      });

      it("rejects a title with a dotted outline number prefix followed by Title Case", () => {
        const yaml = `
id: s
title: "5.2 Barra Superior"
children: []
`;
        expect(() => loadSection(yaml, FILE, catalog)).toThrow(ContentError);
      });

      it("rejects a title with a dotted outline number prefix followed by lowercase text", () => {
        const yaml = `
id: s
title: "5.2 sistema de alertas"
children: []
`;
        expect(() => loadSection(yaml, FILE, catalog)).toThrow(ContentError);
      });

      it("rejects a title with a single-segment number and a dot separator", () => {
        const yaml = `
id: s
title: "7. Interfaz General"
children: []
`;
        expect(() => loadSection(yaml, FILE, catalog)).toThrow(ContentError);
      });

      it("rejects a subtitle carrying a literal number", () => {
        const yaml = `
id: s
title: Section
subtitle: "7.2 Barra Superior"
children: []
`;
        expect(() => loadSection(yaml, FILE, catalog)).toThrow(ContentError);
      });

      it("accepts a title-like quantity phrase", () => {
        const yaml = `
id: s
title: "2 Factores de Autenticación"
children: []
`;
        expect(() => loadSection(yaml, FILE, catalog)).not.toThrow();
      });
    });

    describe("block props — non-blocking warning", () => {
      it("warns, but does not throw, on a prop referencing a section number", () => {
        const yaml = `
id: b
type: prose
props:
  text: "consulte la sección 4.2"
`;
        const { warnings } = loadSection(yaml, FILE, catalog);
        expect(warnings).toHaveLength(1);
        expect(warnings[0]).toMatchObject({ file: FILE, nodeId: "b", text: "consulte la sección 4.2" });
      });

      it("warns, but does not throw, on a prop referencing a figure number", () => {
        const yaml = `
id: b
type: prose
props:
  text: "ver Figura 7.1.3"
`;
        const { warnings } = loadSection(yaml, FILE, catalog);
        expect(warnings).toHaveLength(1);
        expect(warnings[0]?.text).toBe("ver Figura 7.1.3");
      });

      it("warns, but does not throw, on a hand-numbered step", () => {
        const yaml = `
id: b
type: prose
props:
  text: "1. Ingrese sus credenciales"
`;
        const { warnings } = loadSection(yaml, FILE, catalog);
        expect(warnings).toHaveLength(1);
        expect(warnings[0]?.text).toBe("1. Ingrese sus credenciales");
      });

      it("warns, but does not throw, on a hand-written anchor/slug", () => {
        const yaml = `
id: b
type: prose
props:
  text: "ver #52-semaforos-y-ars"
`;
        const { warnings } = loadSection(yaml, FILE, catalog);
        expect(warnings).toHaveLength(1);
        expect(warnings[0]?.text).toBe("ver #52-semaforos-y-ars");
      });

      it("warns, but does not throw, on a literal number nested inside icon-table rows", () => {
        const yaml = `
id: b
type: icon-table
props:
  labelHeader: Item
  descriptionHeader: Desc
  rows:
    - id: r1
      label: "Ver Figura 3.1"
      description: hola
`;
        const { warnings } = loadSection(yaml, FILE, catalog);
        expect(warnings).toHaveLength(1);
        expect(warnings[0]?.text).toBe("Ver Figura 3.1");
      });

      it("does not warn on an IP address", () => {
        const yaml = `
id: b
type: prose
props:
  text: "192.168.1.1"
`;
        const { warnings } = loadSection(yaml, FILE, catalog);
        expect(warnings).toHaveLength(0);
      });

      it("does not warn on a version string with three segments", () => {
        const yaml = `
id: b
type: prose
props:
  text: "1.4.7"
`;
        const { warnings } = loadSection(yaml, FILE, catalog);
        expect(warnings).toHaveLength(0);
      });

      it("does not warn on a version string of zeroes", () => {
        const yaml = `
id: b
type: prose
props:
  text: "1.0.0"
`;
        const { warnings } = loadSection(yaml, FILE, catalog);
        expect(warnings).toHaveLength(0);
      });

      it("does not warn on a bare number-sign", () => {
        const yaml = `
id: b
type: prose
props:
  text: "Camara #12 fuera de servicio"
`;
        const { warnings } = loadSection(yaml, FILE, catalog);
        expect(warnings).toHaveLength(0);
      });

      it("does not warn on prose stating a quantity, not an outline reference", () => {
        const yaml = `
id: b
type: prose
props:
  text: "24 Horas de Soporte"
`;
        const { warnings } = loadSection(yaml, FILE, catalog);
        expect(warnings).toHaveLength(0);
      });

      it("does not warn on prose with a mid-sentence quantity", () => {
        const yaml = `
id: b
type: prose
props:
  text: "Se muestran 3 columnas"
`;
        const { warnings } = loadSection(yaml, FILE, catalog);
        expect(warnings).toHaveLength(0);
      });

      it("does not warn on a percentage", () => {
        const yaml = `
id: b
type: prose
props:
  text: "el 100% de los casos"
`;
        const { warnings } = loadSection(yaml, FILE, catalog);
        expect(warnings).toHaveLength(0);
      });

      it("does not warn on a timestamp", () => {
        const yaml = `
id: b
type: prose
props:
  text: "00:34:27"
`;
        const { warnings } = loadSection(yaml, FILE, catalog);
        expect(warnings).toHaveLength(0);
      });
    });
  });
});
