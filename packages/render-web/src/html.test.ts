import { describe, expect, it } from "vitest";
import type { BlockNode, ManualNode, ResolvedImage, ResolvedManual } from "@manualforge/blocks";
import { themes } from "@manualforge/tokens";
import { renderHtml, type RenderOptions } from "./html.ts";

const PENDING: ResolvedImage = {
  url: "file:///figures/_pending.svg",
  state: "pending",
  deliverTo: "_common/barra/busqueda.png",
};

const DELIVERED: ResolvedImage = {
  url: "file:///figures/_common/barra/busqueda.png",
  state: "common",
};

const block = (id: string, type: string, props: Record<string, unknown>): BlockNode => ({
  kind: "block",
  id,
  type,
  props,
});

const manual = (children: readonly ManualNode[]): ResolvedManual => ({
  manualId: "m",
  version: "0.1.0",
  target: { tenant: "north" },
  children,
  numbers: new Map(),
  figures: new Map([["s.fig", "1.1"]]),
});

const render = (
  children: readonly ManualNode[],
  slots: Array<[string, string]>,
  resolved: ResolvedImage,
  draft?: boolean,
): string => {
  const options: RenderOptions = {
    header: "VENDOR",
    slots: new Map(slots),
    images: () => resolved,
    figures: new Map(slots.map(([id], i) => [id, `1.${i + 1}`])),
    ...(draft === undefined ? {} : { draft }),
    cover: { brand: "B", title: "T", version: "0.1.0", lede: "L", meta: "M" },
  };
  return renderHtml(manual(children), options);
};

/**
 * The rendered BODY only.
 *
 * The stylesheet is inlined in `<head>` and names every class it styles, so
 * asserting a class is absent from the whole document would always fail — and
 * would have hidden whether the markup actually carries it.
 */
const body = (html: string): string => html.slice(html.indexOf("</style>"));

/**
 * The body with its tags removed — what a reader actually sees.
 *
 * The delivery path is deliberately split across two elements so the filename
 * cannot wrap, so asserting on raw markup would test the split rather than the
 * thing that matters: that the whole path is readable and transcribable.
 */
const visible = (html: string): string => body(html).replace(/<[^>]*>/g, "");

const figure = [block("s.fig", "figure", { caption: "Barra de búsqueda", widthPercent: 80 })];
const figureSlots: Array<[string, string]> = [["s.fig", "barra.busqueda"]];

describe("pending image names", () => {
  // The whole reason the draft build exists: whoever captures the screenshots
  // works from this PDF and has no other way to know what to call the file.
  it("prints the delivery path beside a pending image in a draft", () => {
    const html = render(figure, figureSlots, PENDING, true);
    expect(visible(html)).toContain("_common/barra/busqueda.png");
    expect(body(html)).toContain('class="shot__name"');
  });

  // Invariant 4: a tenant's PDF carries no trace of the pipeline's internals.
  // This is the test that keeps a slot path out of a document marked Confidential.
  it("never prints it in a client build, even though the image is pending", () => {
    const html = body(render(figure, figureSlots, PENDING));
    expect(html).not.toContain("_common/barra/busqueda.png");
    expect(html).not.toContain("shot__name");
    // The placeholder itself still renders — a pending slot is never a gap.
    expect(html).toContain("_pending.svg");
  });

  it("prints nothing for a delivered image, draft or not", () => {
    for (const draft of [true, false]) {
      const html = body(render(figure, figureSlots, DELIVERED, draft));
      expect(html, `draft=${draft}`).not.toContain("shot__name");
    }
  });

  // The whole draft exists so a filename can be transcribed exactly. The
  // longest one wrapped between "…seleccionar." and "png", which reads as a
  // name ending in a dot — the one way this text can be copied wrong.
  it("keeps the filename unbreakable, so it can never wrap mid-extension", () => {
    const html = body(render(figure, figureSlots, PENDING, true));
    expect(html).toContain('<span class="shot__file">busqueda.png</span>');
    // The directory stays outside it: that is the one place a long path MAY
    // break, and breaking there costs nothing.
    expect(html).toContain('>_common/barra/<span class="shot__file">');
  });

  it("escapes the path, so it cannot inject markup", () => {
    const html = body(
      render(
        figure,
        figureSlots,
        {
          url: "file:///x.svg",
          state: "pending",
          deliverTo: "_common/<script>alert(1)</script>.png",
        },
        true,
      ),
    );
    expect(html).not.toContain("<script>alert(1)</script>");
    expect(html).toContain("&lt;script&gt;");
  });

  it("puts a table row's name in the description cell, not the 34pt icon column", () => {
    const table = [
      block("s.tabla", "icon-table", {
        labelHeader: "Control",
        descriptionHeader: "Función",
        rows: [{ id: "r1", label: "Buscar", description: "Busca casos." }],
      }),
    ];
    const html = body(render(table, [["r1", "barra.busqueda"]], PENDING, true));
    const iconCell = html.slice(html.indexOf('class="tbl__icon'), html.indexOf('class="tbl__label'));
    expect(iconCell).not.toContain("shot__name");
    expect(html).toContain("Busca casos.");
    expect(html.indexOf("shot__name")).toBeGreaterThan(html.indexOf("Busca casos."));
  });
});

// A page number exists nowhere but the paginated DOM, and the DOM can only say
// WHICH image it is if the markup carries the slot. Without this the page
// numbers would have to be matched to slots by caption text — which breaks the
// moment two figures show the same thing.
describe("slot identity in the markup", () => {
  it("tags every image with the slot it belongs to", () => {
    const html = body(render(figure, figureSlots, PENDING));
    expect(html).toContain('data-slot="barra.busqueda"');
  });

  it("tags a table icon too, so an icon slot is locatable as well", () => {
    const table = [
      block("s.tabla", "icon-table", {
        labelHeader: "Control",
        descriptionHeader: "Función",
        rows: [{ id: "r1", label: "Buscar", description: "Busca casos." }],
      }),
    ];
    const html = body(render(table, [["r1", "barra.busqueda"]], PENDING));
    expect(html).toContain('data-slot="barra.busqueda"');
  });

  // It identifies a slot, it does not leak one: the attribute names the slot,
  // never the delivery path that invariant 4 keeps out of a client build.
  it("carries the slot in a client build without leaking the delivery path", () => {
    const html = body(render(figure, figureSlots, PENDING));
    expect(html).toContain('data-slot="barra.busqueda"');
    expect(html).not.toContain("_common/barra/busqueda.png");
  });
});

describe("image slots the renderer was not given", () => {
  // The renderer holds no image policy: a node absent from the slots map has no
  // image, full stop. If it invented one, prose would sprout placeholders.
  it("renders no image at all for a node with no slot", () => {
    const html = body(render([block("s.p", "prose", { text: "Sin ilustración." })], [], PENDING, true));
    expect(html).not.toContain("_pending.svg");
    expect(html).not.toContain("shot");
  });
});

/**
 * The cover mark, which is the one image on the page that may never be a
 * placeholder. Both branches are pinned because they fail in opposite ways: a
 * missing fallback leaves the lockup empty, and a mark that is linked rather
 * than inlined can arrive late or not at all.
 */
describe("cover mark", () => {
  const coverOf = (mark?: string): string =>
    renderHtml(manual([]), {
      header: "BEACON360  |  T  |  v0.1.0",
      slots: new Map(),
      images: () => DELIVERED,
      figures: new Map(),
      theme: themes.beacon,
      cover: {
        brand: "BEACON360",
        title: "T",
        version: "0.1.0",
        lede: "L",
        meta: "M",
        ...(mark === undefined ? {} : { mark }),
      },
    });

  it("inlines the real mark as given, so the cover needs nothing resolved", () => {
    const html = coverOf("data:image/png;base64,AAAB");
    expect(html).toContain('<img class="cover__mark" src="data:image/png;base64,AAAB"');
    // The drawn approximation must be GONE, not merely covered by the real one.
    expect(html).not.toContain("<svg class=\"cover__mark\"");
  });

  it("falls back to the drawn mark when the manual ships none", () => {
    const html = coverOf();
    expect(html).toContain('<svg class="cover__mark"');
    expect(html).not.toContain('<img class="cover__mark"');
  });

  it("still puts a mark in the lockup either way", () => {
    for (const html of [coverOf("data:image/png;base64,AAAB"), coverOf()]) {
      expect(html).toContain('class="cover__lockup"');
      expect(html).toMatch(/class="cover__mark"/);
    }
  });
});

describe("change log — the manual's own delivery history", () => {
  const changeLog = [
    block("s.changes", "change-log", {
      versionHeader: "Versión",
      dateHeader: "Fecha",
      descriptionHeader: "Descripción de cambios",
      rows: [
        { id: "s.changes.r1", version: "1.4.7", date: "2026-02-28", description: "Entrega previa." },
        { id: "s.changes.r2", version: "1.5.0", date: "2026-08-26", description: "Módulo **BoT**." },
      ],
    }),
  ];

  const html = (): string => render(changeLog, [], PENDING);

  it("carries its own table class, not the data table's", () => {
    expect(body(html())).toContain('class="tbl tbl--change-log"');
    expect(body(html())).not.toContain("tbl--data-table");
  });

  it("prints the three declared headers", () => {
    const text = visible(html());
    expect(text).toContain("Versión");
    expect(text).toContain("Fecha");
    expect(text).toContain("Descripción de cambios");
  });

  /**
   * Dates are stored ISO and printed day-first. Asserting the ISO form is
   * ABSENT is the half that matters: a renderer that skipped formatting would
   * still contain the day, month and year in some order, so a looser assertion
   * would pass on `2026-02-28` printed raw into a client-facing document.
   */
  it("prints dates day-first and never leaks the ISO source form", () => {
    const text = visible(html());
    expect(text).toContain("28/02/2026");
    expect(text).toContain("26/08/2026");
    expect(body(html())).not.toContain("2026-02-28");
    expect(body(html())).not.toContain("2026-08-26");
  });

  /**
   * The description is an authored sentence and takes inline markup like any
   * other; the version and the date are VALUES and must not. Markup in a
   * version cell would be a typo rendered as intent.
   */
  it("marks up the description but leaves version and date literal", () => {
    expect(body(html())).toContain("<strong>BoT</strong>");
    expect(body(html())).toContain('<td class="tbl__version">1.5.0</td>');
    expect(body(html())).toContain('<td class="tbl__date">26/08/2026</td>');
  });

  /** No numbering, no figure: this is the one block that is about the manual. */
  it("emits no figure and no item numbers", () => {
    expect(body(html())).not.toContain("<figure");
    expect(body(html())).not.toContain("tbl__icon");
  });
});

/**
 * `delivered` is EVIDENCE, not content. It exists so the repository can prove
 * which file a client received; the client's own document must show no sign of
 * it. A page carrying a 64-character digest beside a version number would be
 * absurd, and nothing else in the pipeline would notice.
 */
describe("delivery proof never reaches the page", () => {
  const SHA = "f5eafb8dd59764899e79bbae5753f58a2b018e8780856102ed89fd7842b8a99a";

  const withProof = [
    block("s.changes", "change-log", {
      versionHeader: "Versión",
      dateHeader: "Fecha",
      descriptionHeader: "Descripción de cambios",
      rows: [
        {
          id: "s.changes.r1",
          version: "1.0.0",
          date: "2026-08-26",
          description: "Primera entrega.",
          delivered: { commit: "a9f780e", files: { "agencia-propia": SHA } },
        },
      ],
    }),
  ];

  it("prints neither the hash nor the commit it was built from", () => {
    const html = render(withProof, [], PENDING);
    expect(html).not.toContain(SHA);
    expect(html).not.toContain("a9f780e");
    expect(html).not.toContain("agencia-propia");
  });

  it("still prints the row the reader is meant to see", () => {
    const text = visible(render(withProof, [], PENDING));
    expect(text).toContain("1.0.0");
    expect(text).toContain("26/08/2026");
    expect(text).toContain("Primera entrega.");
  });
});
