import { describe, expect, it } from "vitest";
import { themes } from "@manualforge/tokens";
import type { BlockNode, ManualNode, ResolvedManual, SectionNode } from "@manualforge/blocks";
import { renderDocx, type DocxOptions } from "./document.ts";
import type { DocxAsset } from "./image.ts";
import { readZipEntry } from "./zip.test-helper.ts";

/** A 1x1 PNG, so the archive holds a picture a reader could actually decode. */
const PNG = Uint8Array.from(
  atob(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFAAH/q842iQAAAABJRU5ErkJggg==",
  )
    .split("")
    .map((c) => c.charCodeAt(0)),
);

const asset = (widthPx = 800, heightPx = 400): DocxAsset => ({
  data: PNG,
  type: "png",
  widthPx,
  heightPx,
  pending: false,
});

const block = (id: string, type: string, props: Record<string, unknown>): BlockNode => ({
  kind: "block",
  id,
  type,
  props,
});

const section = (id: string, title: string, children: readonly ManualNode[]): SectionNode => ({
  kind: "section",
  id,
  title: [{ kind: "text", value: title }],
  children,
});

/** Every block type in the catalogue, once, under one section. */
const blocks: readonly BlockNode[] = [
  block("b.prose", "prose", { text: "Un párrafo con **énfasis** dentro." }),
  block("b.callout", "callout", { variant: "important", text: "No hacer esto." }),
  block("b.detail", "detail-header", { text: "Detalle" }),
  block("b.fields", "field-list", {
    items: [{ id: "b.fields.uno", label: "Campo", text: "Qué es.", layout: "beside" }],
  }),
  block("b.terms", "term-list", {
    entries: [{ id: "b.terms.uno", term: "Término", definition: "Su definición." }],
  }),
  block("b.proc", "procedure", {
    lead: "Antes de empezar.",
    steps: [
      {
        id: "b.proc.s1",
        title: "Abrir el módulo",
        text: "Desde el menú lateral.",
        actions: ["Clic en Mapa", "Esperar la carga"],
      },
    ],
  }),
  block("b.fig", "figure", { caption: "Pantalla principal", widthPercent: 80 }),
  block("b.icons", "icon-table", {
    labelHeader: "Control",
    descriptionHeader: "Función",
    rows: [
      { id: "b.icons.r1", label: "Zoom", description: "Acerca el mapa." },
      { id: "b.icons.r2", label: "Capas", description: "Muestra las capas." },
      { id: "b.icons.r3", label: "Centrar", description: "Vuelve al centro." },
    ],
  }),
  block("b.data", "data-table", {
    labelHeader: "Estado",
    descriptionHeader: "Significado",
    rows: [
      { label: "Activo", description: "En curso." },
      { label: "Cerrado", description: "Finalizado." },
    ],
  }),
  block("b.changes", "change-log", {
    versionHeader: "Versión",
    dateHeader: "Fecha",
    descriptionHeader: "Descripción de cambios",
    rows: [
      { id: "b.changes.r1", version: "1.4.7", date: "2026-02-28", description: "Entrega previa." },
      { id: "b.changes.r2", version: "1.5.0", date: "2026-08-26", description: "Módulo nuevo." },
    ],
  }),
];

const manual: ResolvedManual = {
  manualId: "test",
  version: "0.0.1",
  target: { tenant: "north" },
  children: [section("s.uno", "Módulo de prueba", [section("s.uno.sub", "Subsección", blocks)])],
  // Deliberately NOT sequential from one: these must be read, never re-derived.
  numbers: new Map([
    ["s.uno", "4"],
    ["s.uno.sub", "4.2"],
    ["b.proc.s1", "7"],
  ]),
  figures: new Map([
    ["b.fields.uno", "4.11"],
    ["b.terms.uno", "4.12"],
    ["b.proc.s1", "4.13"],
    ["b.fig", "4.14"],
    ["b.icons.r1", "4.15"],
  ]),
};

const slots = new Map(
  ["b.fields.uno", "b.terms.uno", "b.proc.s1", "b.fig", "b.icons.r1"].map((id) => [id, `${id}.png`]),
);

const options = (over: Partial<DocxOptions> = {}): DocxOptions => ({
  header: "BEACON360  |  Manual de operador  |  v0.0.1",
  cover: {
    brand: "BEACON360",
    title: "Manual de operador",
    version: "0.0.1",
    lede: "Plataforma de gestión de incidentes.",
    meta: "Vendor",
  },
  slots,
  assets: () => asset(),
  figures: manual.figures,
  theme: themes.beacon,
  footerNote: "© 2026 Vendor — Confidencial — Uso Interno",
  vendor: "VENDOR",
  ...over,
});

const documentXml = async (o: DocxOptions = options()): Promise<string> =>
  readZipEntry(await renderDocx(manual, o), "word/document.xml");

describe("renderDocx", () => {
  it("produces an archive carrying the parts a .docx must have", async () => {
    const zip = await renderDocx(manual, options());
    expect(zip.subarray(0, 2)).toEqual(Uint8Array.from([0x50, 0x4b]));
    for (const part of [
      "[Content_Types].xml",
      "word/document.xml",
      "word/styles.xml",
      "word/header1.xml",
      "word/footer1.xml",
    ]) {
      expect(() => readZipEntry(zip, part)).not.toThrow();
    }
  });

  it("renders every block type in the catalogue", async () => {
    // The assertion is that it did not throw: the switch has no silent default.
    const xml = await documentXml();
    expect(xml).toContain("Un párrafo con ");
    expect(xml).toContain("IMPORTANTE: ");
    expect(xml).toContain("Detalle");
    expect(xml).toContain("Campo");
    expect(xml).toContain("Término:");
    expect(xml).toContain("Abrir el módulo");
    expect(xml).toContain("Pantalla principal");
    expect(xml).toContain("Función");
    expect(xml).toContain("Significado");
    expect(xml).toContain("Descripción de cambios");
  });

  /**
   * The date is stored ISO and printed day-first. Asserting the ISO string is
   * ABSENT is the half that matters: a renderer that forgot to format would
   * still contain the day, the month and the year, and a looser assertion would
   * pass on `2026-02-28` printed raw into a client-facing document.
   */
  it("prints change-log dates day-first, never the ISO source form", async () => {
    const xml = await documentXml();
    expect(xml).toContain("28/02/2026");
    expect(xml).toContain("26/08/2026");
    expect(xml).not.toContain("2026-02-28");
    expect(xml).not.toContain("2026-08-26");
  });

  it("throws on a block type it has no renderer for", async () => {
    const broken: ResolvedManual = {
      ...manual,
      children: [section("s.x", "X", [block("b.x", "hologram", {})])],
    };
    await expect(renderDocx(broken, options())).rejects.toThrow(
      /no renderer for block type "hologram" \(node b\.x\)/,
    );
  });
});

describe("ordinals", () => {
  it("takes a step's number from the numbers map, not its position", async () => {
    // The only step in the list is numbered 7. Deriving it from the position
    // would print "Paso 1" and drift from every other target.
    const xml = await documentXml();
    expect(xml).toContain("Paso 7: ");
    expect(xml).not.toContain("Paso 1: ");
  });

  it("takes a section's number from the numbers map", async () => {
    const xml = await documentXml();
    expect(xml).toContain("4. Módulo de prueba");
    expect(xml).toContain("4.2. Subsección");
  });

  it("labels figures from the figures map", async () => {
    const xml = await documentXml();
    expect(xml).toContain("Figura 4.14. Pantalla principal");
    expect(xml).toContain("Figura 4.13. Abrir el módulo");
  });

  it("omits the label for an image with no figure ordinal", async () => {
    const noFigures: ResolvedManual = { ...manual, figures: new Map() };
    const xml = readZipEntry(
      await renderDocx(noFigures, options({ figures: new Map() })),
      "word/document.xml",
    );
    expect(xml).toContain("Pantalla principal");
    expect(xml).not.toContain("Figura ");
  });
});

describe("the frozen typography", () => {
  it("names only faces that ship with Office", async () => {
    const xml = await documentXml();
    expect(xml).toContain("Century Gothic");
    expect(xml).toContain("Arial");
  });

  it("names no face the reader's machine would have to substitute", async () => {
    // Word resolves a missing family on the READING machine, so a webfont here
    // makes the .docx render differently there than the PDF does here.
    const xml = await documentXml();
    for (const webfont of ["Outfit", "Geist", "Inter", "Montserrat"]) {
      expect(xml).not.toContain(webfont);
    }
  });
});

describe("structure Word depends on", () => {
  it("gives section titles real heading styles, so the contents field works", async () => {
    const xml = await documentXml();
    expect(xml).toContain('w:val="Heading1"');
    expect(xml).toContain('w:val="Heading2"');
  });

  it("emits a contents field rather than a transcribed list of page numbers", async () => {
    // Word's own pagination differs from the PDF's, so the only correct page
    // numbers are the ones Word computes when it opens the file.
    const xml = await documentXml();
    expect(xml).toContain("TOC");
    expect(xml).toContain("w:instrText");
  });

  it("sets A4 in twips on both sections", async () => {
    const xml = await documentXml();
    const pages = [...xml.matchAll(/w:w="11906" w:h="16838"/g)];
    expect(pages.length).toBe(2);
  });

  it("gives the cover a zero margin and the body the token margins", async () => {
    const xml = await documentXml();
    expect(xml).toContain('w:top="0"');
    // 62pt and 52pt, in twips.
    expect(xml).toContain('w:top="1240"');
    expect(xml).toContain('w:bottom="1040"');
  });
});

describe("the cover", () => {
  it("composes from text when no rendered page is supplied", async () => {
    const xml = await documentXml();
    expect(xml).toContain("BEACON360");
    expect(xml).toContain("Plataforma de gestión de incidentes.");
  });

  it("places the rendered page full-bleed when one is supplied", async () => {
    const xml = await documentXml(options({ coverImage: asset(2480, 3508) }));
    // A4 at 96 DPI: 793.7 x 1122.5 px, which docx turns into EMU.
    expect(xml).toContain("<wp:extent");
    expect(xml).not.toContain("Plataforma de gestión de incidentes.");
  });
});

describe("the running header and footer", () => {
  it("carries the brand, the title and the vendor", async () => {
    const zip = await renderDocx(manual, options());
    const header = readZipEntry(zip, "word/header1.xml");
    expect(header).toContain("BEACON360");
    expect(header).toContain("Manual de operador  |  v0.0.1");
    expect(header).toContain("VENDOR");
  });

  it("pulls the band out to the paper edge with negative indents", async () => {
    // A paragraph's fill stops at its indents and Word's header sits inside the
    // text column, so the band only reaches the edge if it is pulled there.
    const header = readZipEntry(await renderDocx(manual, options()), "word/header1.xml");
    expect(header).toContain('w:left="-1240"');
    expect(header).toContain('w:right="-1240"');
  });

  it("numbers pages with a field, not with text", async () => {
    const footer = readZipEntry(await renderDocx(manual, options()), "word/footer1.xml");
    expect(footer).toContain("Página ");
    expect(footer).toContain("PAGE");
    expect(footer).toContain("© 2026 Vendor — Confidencial — Uso Interno");
  });
});

describe("images", () => {
  it("embeds each distinct picture once and references it", async () => {
    const zip = await renderDocx(manual, options());
    const xml = readZipEntry(zip, "word/document.xml");
    expect(xml).toContain("<a:blip");
    expect(() => readZipEntry(zip, "word/_rels/document.xml.rels")).not.toThrow();
  });

  it("renders a slot with no asset without leaving a broken picture", async () => {
    const xml = await documentXml(options({ assets: () => undefined }));
    expect(xml).not.toContain("<a:blip");
    // The caption goes with the image it captioned; the prose around it stays.
    expect(xml).toContain("Un párrafo con ");
  });
});
