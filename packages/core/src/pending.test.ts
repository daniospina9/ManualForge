import { describe, expect, it } from "vitest";
import type { BlockNode, ManualNode, ResolvedManual, SectionNode } from "@manualforge/blocks";
import { collectPending, type PendingDeclaration } from "./pending.ts";

const block = (id: string): BlockNode => ({
  kind: "block",
  id,
  type: "prose",
  props: { text: "…" },
});

const section = (id: string, children: readonly ManualNode[]): SectionNode => ({
  kind: "section",
  id,
  title: [{ kind: "text", value: id }],
  children,
});

const resolved = (children: readonly ManualNode[]): ResolvedManual => ({
  manualId: "un-manual",
  version: "0.1.0",
  target: { permission: "agencia-propia" },
  children,
  numbers: new Map(),
  figures: new Map(),
});

const decl = (over: Partial<PendingDeclaration> = {}): PendingDeclaration => ({
  id: "dashboard.historial.estado",
  section: "dashboard",
  file: "sections/04-dashboard.yaml",
  covers: ["dashboard.historial"],
  missing: "La columna ESTADO de la pestaña Historial de Eventos.",
  because: "El color sale del índice de la fila (events-history-columns.tsx:103).",
  settles: "Que el producto la conecte a datos reales.",
  ...over,
});

describe("collectPending", () => {
  it("keeps an entry whose covered content this target sees", () => {
    const manual = resolved([section("dashboard", [block("dashboard.historial")])]);
    expect(collectPending(manual, [decl()]).map((e) => e.id)).toEqual([
      "dashboard.historial.estado",
    ]);
  });

  // The same reasoning image slots are collected after conditioning: nobody is
  // asked to produce a screenshot no reader will see, and nobody is owed work on
  // a gap no reader can reach. A debt against content this target does not have
  // is not this target's debt.
  it("drops an entry whose covered content this target never sees", () => {
    const manual = resolved([section("dashboard", [])]);
    expect(collectPending(manual, [decl()])).toEqual([]);
  });

  it("keeps an entry when only some of its covered content survives", () => {
    const manual = resolved([section("dashboard", [block("dashboard.historial")])]);
    const two = decl({ covers: ["dashboard.historial", "dashboard.analitica"] });
    expect(collectPending(manual, [two])).toHaveLength(1);
  });

  it("finds covered content nested at any depth", () => {
    const manual = resolved([
      section("dashboard", [section("dashboard.tabs", [block("dashboard.historial")])]),
    ]);
    expect(collectPending(manual, [decl()])).toHaveLength(1);
  });

  it("matches a covered id that is itself a section", () => {
    const manual = resolved([section("dashboard", [section("dashboard.historial", [])])]);
    expect(collectPending(manual, [decl()])).toHaveLength(1);
  });

  it("carries the declaration through unchanged, so the queue can be read", () => {
    const manual = resolved([section("dashboard", [block("dashboard.historial")])]);
    const entry = collectPending(manual, [decl()])[0];
    expect(entry?.missing).toContain("ESTADO");
    expect(entry?.because).toContain("events-history-columns.tsx:103");
    expect(entry?.settles).toContain("datos reales");
    expect(entry?.file).toBe("sections/04-dashboard.yaml");
  });

  it("returns entries in declaration order", () => {
    const manual = resolved([
      section("dashboard", [block("dashboard.historial"), block("dashboard.otro")]),
    ]);
    const out = collectPending(manual, [
      decl({ id: "b", covers: ["dashboard.otro"] }),
      decl({ id: "a" }),
    ]);
    expect(out.map((e) => e.id)).toEqual(["b", "a"]);
  });

  it("says nothing for a manual that declares none", () => {
    expect(collectPending(resolved([section("dashboard", [])]), [])).toEqual([]);
  });
});
