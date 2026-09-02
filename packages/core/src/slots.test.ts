import { describe, expect, it } from "vitest";
import { catalog } from "@manualforge/blocks";
import type { BlockNode, ManualNode, ResolvedManual, SectionNode } from "@manualforge/blocks";
import { collectSlots } from "./slots.ts";

const block = (id: string, type: string, props: Record<string, unknown>): BlockNode => ({
  kind: "block",
  id,
  type,
  props,
});

const section = (id: string, children: readonly ManualNode[]): SectionNode => ({
  kind: "section",
  id,
  title: [{ kind: "text", value: "Sección" }],
  children,
});

const manual = (children: readonly ManualNode[]): ResolvedManual => ({
  manualId: "m",
  version: "0.1.0",
  target: { tenant: "north" },
  children,
  numbers: new Map(),
  figures: new Map(),
});

describe("collectSlots", () => {
  it("derives a figure's slot from its node id when no ref is written", () => {
    const slots = collectSlots(
      manual([block("mapa.fig-capas", "figure", { caption: "Capas del mapa", widthPercent: 100 })]),
      catalog,
    );
    expect(slots).toEqual([
      {
        slot: "mapa.fig-capas",
        nodeId: "mapa.fig-capas",
        blockType: "figure",
        shows: "Capas del mapa",
        convention: "figure",
      },
    ]);
  });

  it("keeps an explicit slot so two places share one delivered image", () => {
    const slots = collectSlots(
      manual([block("otra.fig", "figure", { image: "mapa.fig-capas", caption: "Otra vista" })]),
      catalog,
    );
    expect(slots[0]?.slot).toBe("mapa.fig-capas");
    expect(slots[0]?.nodeId).toBe("otra.fig");
  });

  it("derives one slot per item from each item's own id", () => {
    const slots = collectSlots(
      manual([
        block("barra.tabla", "icon-table", {
          labelHeader: "Control",
          descriptionHeader: "Función",
          rows: [
            { id: "barra.busqueda", label: "Búsqueda", description: "Busca casos" },
            { id: "barra.filtros", label: "Filtros", description: "Filtra casos" },
          ],
        }),
      ]),
      catalog,
    );
    expect(slots.map((s) => s.slot)).toEqual(["barra.busqueda", "barra.filtros"]);
    // The manifest is the only description the delivering area gets, so each
    // row must carry what it shows, not just its slot.
    expect(slots.map((s) => s.shows)).toEqual(["Búsqueda", "Filtros"]);
  });

  it("numbers steps and fields the same way — one slot per item", () => {
    const slots = collectSlots(
      manual([
        block("proc", "procedure", {
          steps: [
            { id: "proc.abrir", title: "Abrir el panel", text: "Presione el botón." },
            { id: "proc.guardar", title: "Guardar", text: "Presione Guardar." },
          ],
        }),
      ]),
      catalog,
    );
    expect(slots.map((s) => s.slot)).toEqual(["proc.abrir", "proc.guardar"]);
    expect(slots.map((s) => s.shows)).toEqual(["Abrir el panel", "Guardar"]);
  });

  // An `optional` policy exists so a manual is not flooded with placeholders
  // nobody requested. Only a declared illustration becomes a slot.
  it("ignores an optional image that was never declared", () => {
    const slots = collectSlots(
      manual([
        block("glosario", "term-list", {
          entries: [{ id: "glosario.caso", term: "Caso", definition: "Un incidente." }],
        }),
      ]),
      catalog,
    );
    expect(slots).toEqual([]);
  });

  it("collects an optional image once declared with `true`", () => {
    const slots = collectSlots(
      manual([
        block("glosario", "term-list", {
          entries: [
            { id: "glosario.caso", term: "Caso", definition: "Un incidente.", image: true },
          ],
        }),
      ]),
      catalog,
    );
    expect(slots.map((s) => s.slot)).toEqual(["glosario.caso"]);
  });

  // Two conventions and no third: a table icon is not a figure, and the
  // manifest and the renderer both need to know which one they are handling.
  it("marks a table icon as the icon convention, not a figure", () => {
    const slots = collectSlots(
      manual([
        block("barra.tabla", "icon-table", {
          labelHeader: "Control",
          descriptionHeader: "Función",
          rows: [{ id: "barra.busqueda", label: "Búsqueda", description: "Busca casos" }],
        }),
      ]),
      catalog,
    );
    expect(slots[0]?.convention).toBe("icon");
  });

  it("walks nested sections in document order", () => {
    const slots = collectSlots(
      manual([
        section("uno", [
          block("uno.fig", "figure", { caption: "Primera" }),
          section("uno.dos", [block("uno.dos.fig", "figure", { caption: "Segunda" })]),
        ]),
        section("tres", [block("tres.fig", "figure", { caption: "Tercera" })]),
      ]),
      catalog,
    );
    expect(slots.map((s) => s.slot)).toEqual(["uno.fig", "uno.dos.fig", "tres.fig"]);
  });

  it("ignores blocks that carry no images at all", () => {
    const slots = collectSlots(
      manual([block("nota", "callout", { text: "Atención.", variant: "info" })]),
      catalog,
    );
    expect(slots).toEqual([]);
  });

  // Conditioning runs before this, so a row the target cannot see is already
  // gone. The manifest must never ask for an image this deployment never shows.
  it("only sees what survived conditioning", () => {
    const slots = collectSlots(
      manual([
        block("barra.tabla", "icon-table", {
          labelHeader: "Control",
          descriptionHeader: "Función",
          rows: [{ id: "barra.busqueda", label: "Búsqueda", description: "Busca casos" }],
        }),
      ]),
      catalog,
    );
    expect(slots.map((s) => s.slot)).toEqual(["barra.busqueda"]);
  });

  it("reports the node when a slot cannot be derived from its id", () => {
    expect(() =>
      collectSlots(manual([block("Figura Uno", "figure", { caption: "Mala" })]), catalog),
    ).toThrow(/Figura Uno/);
  });
});
