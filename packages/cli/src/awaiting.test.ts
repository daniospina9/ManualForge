import { describe, expect, it } from "vitest";
import type { PendingDeclaration } from "@manualforge/core";
import { awaitingProduct, type TargetPending } from "./awaiting.ts";
import { manualConfigSchema, type ManualConfig } from "./main.ts";

const config: ManualConfig = manualConfigSchema.parse({
  manual: { id: "beacon-manual", title: "Manual", product: "Beacon360", contentVersion: "0.4.0" },
  axes: {
    permission: {
      label: "Permission profile",
      values: [{ id: "agencia-propia", name: "Agencia propia" }, { id: "todas-las-agencias", name: "Todas" }],
    },
  },
  targets: [{ permission: "agencia-propia" }, { permission: "todas-las-agencias" }],
  output: { dir: "output", filename: "x.pdf" },
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

const target = (value: string, entries: readonly PendingDeclaration[]): TargetPending => ({
  value,
  entries,
});

describe("awaitingProduct", () => {
  it("lists one gap once, naming every target it affects", () => {
    const report = awaitingProduct(config, [
      target("agencia-propia", [decl()]),
      target("todas-las-agencias", [decl()]),
    ]);
    const items = report["awaiting"] as Array<Record<string, unknown>>;
    expect(items).toHaveLength(1);
    expect(items[0]?.["affects"]).toEqual(["agencia-propia", "todas-las-agencias"]);
  });

  // The gap is only a debt where the content it sits inside actually ships.
  // Collapsing that to one list would put work on a queue for a document whose
  // reader can never reach the screen.
  it("names only the targets whose content reaches the gap", () => {
    const report = awaitingProduct(config, [
      target("agencia-propia", [decl()]),
      target("todas-las-agencias", []),
    ]);
    const items = report["awaiting"] as Array<Record<string, unknown>>;
    expect(items[0]?.["affects"]).toEqual(["agencia-propia"]);
  });

  it("carries what a reader of the queue needs to act", () => {
    const report = awaitingProduct(config, [target("agencia-propia", [decl()])]);
    const item = (report["awaiting"] as Array<Record<string, unknown>>)[0];
    expect(item?.["id"]).toBe("dashboard.historial.estado");
    expect(item?.["missing"]).toContain("ESTADO");
    expect(item?.["because"]).toContain("events-history-columns.tsx:103");
    expect(item?.["settles"]).toContain("datos reales");
    expect(item?.["declaredIn"]).toBe("sections/04-dashboard.yaml");
    expect(item?.["covers"]).toEqual(["dashboard.historial"]);
  });

  it("counts what is queued", () => {
    const report = awaitingProduct(config, [
      target("agencia-propia", [decl(), decl({ id: "bot.dashboard" })]),
      target("todas-las-agencias", [decl()]),
    ]);
    expect(report["counts"]).toEqual({ gaps: 2, sections: 1 });
  });

  it("counts the sections a queue touches, not just the entries", () => {
    const report = awaitingProduct(config, [
      target("agencia-propia", [decl(), decl({ id: "bot.panel", section: "beacon-of-things" })]),
    ]);
    expect(report["counts"]).toEqual({ gaps: 2, sections: 2 });
  });

  it("is empty, and says so, for a manual with nothing queued", () => {
    const report = awaitingProduct(config, [target("agencia-propia", [])]);
    expect(report["counts"]).toEqual({ gaps: 0, sections: 0 });
    expect(report["awaiting"]).toEqual([]);
  });

  // The same reasoning as the image manifest: a partial run must be visible, or
  // the file reads as the whole picture for a manual it only half looked at.
  it("says which targets it looked at, against how many are configured", () => {
    const report = awaitingProduct(config, [target("agencia-propia", [decl()])]);
    expect(report["targetsCovered"]).toEqual(["agencia-propia"]);
    expect(report["targetsConfigured"]).toBe(2);
  });

  it("names the axis, so the file does not call a permission profile a deployment", () => {
    const report = awaitingProduct(config, [target("agencia-propia", [decl()])]);
    expect(report["axis"]).toBe("permission");
    expect(JSON.stringify(report)).not.toContain("deployment");
  });

  // Deliberately without a clock, for the reason image-requests has none: the
  // file is regenerated on demand and a timestamp would churn in git on an
  // export that changed nothing.
  it("carries no timestamp", () => {
    const report = awaitingProduct(config, [target("agencia-propia", [decl()])]);
    expect(Object.keys(report)).not.toContain("generated");
    expect(JSON.stringify(report)).not.toMatch(/\d{4}-\d{2}-\d{2}T/);
  });

  it("explains itself to whoever opens it having read no documentation", () => {
    const report = awaitingProduct(config, [target("agencia-propia", [decl()])]);
    expect(JSON.stringify(report["convention"])).toMatch(/product/i);
  });
});
