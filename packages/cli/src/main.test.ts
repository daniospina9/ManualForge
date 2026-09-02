import { describe, expect, it, vi } from "vitest";
import type { ManualNode } from "@manualforge/blocks";
import {
  assertChangeLog,
  deliveryProofFor,
  deliveredVersion,
  axisValueName,
  draftFilename,
  formatCliError,
  imageRequests,
  manualConfigSchema,
  outputFilename,
  workFilename,
  parseAxisFilters,
  parseOutPath,
  primaryAxis,
  run,
  type ManualConfig,
  type TargetImages,
} from "./main.ts";

const baseConfig: ManualConfig = {
  manual: { id: "m", title: "Manual", product: "P", contentVersion: "0.1.0" },
  axes: {
    tenant: { values: [{ id: "north", name: "Movilidad Medellín" }] },
  },
  targets: [{ tenant: "north" }],
  output: { dir: "output", filename: "x.pdf" },
};

describe("parseOutPath", () => {
  // Not in `output/`: `.gitignore` excludes it, and this file is handed to
  // another team rather than regenerated per build.
  it("defaults next to the manual, outside the ignored output folder", () => {
    expect(parseOutPath([], "atlas")).toBe("manuals/atlas/image-requests.json");
  });

  it("takes an explicit --out", () => {
    expect(parseOutPath(["--out", "requests/x.json"], "m")).toBe("requests/x.json");
  });

  it("rejects --out with no value, and with a following flag", () => {
    expect(() => parseOutPath(["--out"], "m")).toThrow(/requires a path/);
    expect(() => parseOutPath(["--out", "--tenant"], "m")).toThrow(/requires a path/);
  });
});

describe("draftFilename", () => {
  // A draft carries slot paths, which invariant 4 keeps out of client-facing
  // output. The two files must not be distinguishable only by their contents.
  it("marks the draft before the extension", () => {
    expect(draftFilename("manual-operador-north-v0.1.0.pdf")).toBe(
      "manual-operador-north-v0.1.0-BORRADOR.pdf",
    );
  });

  it("appends when there is no extension", () => {
    expect(draftFilename("manual")).toBe("manual-BORRADOR");
  });

  // A version number is full of dots; the mark belongs before the LAST one.
  it("uses the last dot, not the first", () => {
    expect(draftFilename("a.b.c.pdf")).toBe("a.b.c-BORRADOR.pdf");
  });

  it("leaves a dotfile alone rather than splitting on its leading dot", () => {
    expect(draftFilename(".hidden")).toBe(".hidden-BORRADOR");
  });
});

describe("imageRequests", () => {
  const config: ManualConfig = {
    ...baseConfig,
    targets: [{ tenant: "north" }, { tenant: "lite" }],
  };

  const target = (tenant: string, entries: TargetImages["entries"]): TargetImages => ({
    tenant,
    entries,
    indexed: entries.map((e) => e.slot),
  });

  const use = (nodeId: string, shows: string) => ({ nodeId, blockType: "icon-table", shows });

  it("lists one image once, naming every deployment that needs it", () => {
    const entry = { slot: "barra.busqueda", state: "pending" as const, uses: [use("barra.busqueda", "Buscar")] };
    const report = imageRequests(config, [target("north", [entry]), target("lite", [entry])]);
    const pending = report["pending"] as Array<Record<string, unknown>>;
    expect(pending).toHaveLength(1);
    expect(pending[0]?.["neededBy"]).toEqual(["north", "lite"]);
  });

  // Flat, with the slot's dots kept in the filename, even though the resolver
  // accepts the same slot as a folder tree. The manifest is read by people
  // outside this repository who are handed a list and a folder, and asking them
  // to rebuild a directory structure from dotted names is how a file ends up one
  // level too deep and silently resolves to nothing.
  it("says where a pending image goes — one flat shared name, plus a per-deployment template", () => {
    const report = imageRequests(config, [
      target("north", [{ slot: "barra.filtro.fig", state: "pending", uses: [use("barra.filtro.fig", "Filtros")] }]),
    ]);
    const pending = report["pending"] as Array<Record<string, unknown>>;
    expect(pending[0]?.["deliverTo"]).toEqual({
      shared: "_common/barra.filtro.fig.png",
      override: "<tenant>/barra.filtro.fig.png",
    });
  });

  // The manifest spells the convention out for a reader who has never seen this
  // repository, and it spelled it out in tenant language whatever the manual was
  // conditioned on. The axis's own `label` is what the config author already
  // wrote to describe it to a human, so the document borrows that.
  it("describes the per-target folder in the manual's own words", () => {
    const byPermission: ManualConfig = {
      ...baseConfig,
      axes: { permission: { label: "Permission profile", values: [{ id: "todas", name: "Todas" }] } },
      targets: [{ permission: "todas" }],
    };
    const report = imageRequests(byPermission, [
      target("todas", [{ slot: "seatmap.fig", state: "pending", uses: [use("seatmap.fig", "Seatmap")] }]),
    ]);
    const convention = report["convention"] as Record<string, unknown>;
    expect((convention["resolution"] as string[])[0]).toBe(
      "<permission>/<slot path>.<ext> — an image made for that one permission profile",
    );
  });

  it("leaves the shipping manual's wording exactly as it was", () => {
    const byTenant: ManualConfig = {
      ...baseConfig,
      axes: { tenant: { label: "Deployment", values: [{ id: "north", name: "NORTH" }] } },
      targets: [{ tenant: "north" }],
    };
    const report = imageRequests(byTenant, [
      target("north", [{ slot: "barra.fig", state: "pending", uses: [use("barra.fig", "Barra")] }]),
    ]);
    const convention = report["convention"] as Record<string, unknown>;
    expect((convention["resolution"] as string[])[0]).toBe(
      "<tenant>/<slot path>.<ext> — an image made for that one deployment",
    );
  });

  // The template names a FOLDER, and the folder is named after the axis value.
  // For a manual conditioned on anything but tenants it named a directory that
  // will never exist, in a document handed to the team doing the delivering.
  it("names the override folder after the manual's own axis", () => {
    const byPermission: ManualConfig = {
      ...baseConfig,
      axes: { permission: { values: [{ id: "todas", name: "Todas" }] } },
      targets: [{ permission: "todas" }],
    };
    const report = imageRequests(byPermission, [
      target("todas", [{ slot: "seatmap.fig", state: "pending", uses: [use("seatmap.fig", "Seatmap")] }]),
    ]);
    const pending = report["pending"] as Array<Record<string, unknown>>;
    expect(pending[0]?.["deliverTo"]).toEqual({
      shared: "_common/seatmap.fig.png",
      override: "<permission>/seatmap.fig.png",
    });
  });

  // Resolution is per deployment, so a tenant-specific delivery makes one slot
  // done for one deployment and outstanding for another. Reporting it as
  // finished would leave a deployment rendering the placeholder unnoticed.
  it("keeps a slot pending when only one deployment has the image", () => {
    const report = imageRequests(config, [
      target("north", [
        { slot: "barra.busqueda", state: "tenant", file: "north/barra/busqueda.png", uses: [use("barra.busqueda", "Buscar")] },
      ]),
      target("lite", [{ slot: "barra.busqueda", state: "pending", uses: [use("barra.busqueda", "Buscar")] }]),
    ]);
    const pending = report["pending"] as Array<Record<string, unknown>>;
    expect(pending).toHaveLength(1);
    expect(pending[0]?.["pendingFor"]).toEqual(["lite"]);
    expect(pending[0]?.["files"]).toEqual(["north/barra/busqueda.png"]);
    expect(report["counts"]).toEqual({ total: 1, delivered: 0, pending: 1 });
  });

  it("counts a slot delivered only when no deployment is missing it", () => {
    const entry = {
      slot: "barra.busqueda",
      state: "common" as const,
      file: "_common/barra/busqueda.png",
      uses: [use("barra.busqueda", "Buscar")],
    };
    const report = imageRequests(config, [target("north", [entry]), target("lite", [entry])]);
    expect(report["counts"]).toEqual({ total: 1, delivered: 1, pending: 0 });
    expect(report["pending"]).toEqual([]);
  });

  it("deduplicates the places one shared image is used", () => {
    const entry = {
      slot: "compartido.buscar",
      state: "pending" as const,
      uses: [use("barra.busqueda", "Buscar"), use("paso.buscar", "Buscar el caso")],
    };
    const report = imageRequests(config, [target("north", [entry]), target("lite", [entry])]);
    const pending = report["pending"] as Array<Record<string, unknown>>;
    expect((pending[0]?.["uses"] as unknown[]).map((u) => (u as { nodeId: string }).nodeId)).toEqual([
      "barra.busqueda",
      "paso.buscar",
    ]);
  });

  it("reports an image no deployment asked for", () => {
    const report = imageRequests(config, [
      { tenant: "north", entries: [], indexed: ["barra.buscar"] },
      { tenant: "lite", entries: [], indexed: ["barra.buscar", "otro.slot"] },
    ]);
    expect(report["undeclared"]).toEqual(["barra.buscar", "otro.slot"]);
  });

  // The false positive that made the check worthless: a slot only ONE deployment
  // needs sits in the shared set, so every other deployment sees a file it never
  // asked for. Judged per deployment, every tenant-specific image was an orphan.
  it("does not report an image that only one deployment asked for", () => {
    const mvOnly = {
      slot: "mapa.capa.camaras",
      state: "common" as const,
      file: "_common/mapa/capa/camaras.webp",
      uses: [use("mapa.capa.camaras", "Cámaras")],
    };
    const report = imageRequests(config, [
      { tenant: "north", entries: [mvOnly], indexed: ["mapa.capa.camaras"] },
      { tenant: "lite", entries: [], indexed: ["mapa.capa.camaras"] },
    ]);
    expect("undeclared" in report).toBe(false);
  });

  it("omits the undeclared key entirely when every delivery is claimed", () => {
    const report = imageRequests(config, [target("north", [])]);
    expect("undeclared" in report).toBe(false);
  });

  it("records which deployments the export actually covers", () => {
    const report = imageRequests(config, [target("north", [])]);
    expect(report["deploymentsCovered"]).toEqual(["north"]);
    expect(report["deploymentsConfigured"]).toBe(2);
  });
});

describe("parseAxisFilters", () => {
  it("parses --tenant as shorthand for the tenant axis", () => {
    expect(parseAxisFilters(["--tenant", "north"])).toEqual(new Map([["tenant", "north"]]));
  });

  it("parses a general --axis <name>=<value> flag", () => {
    expect(parseAxisFilters(["--axis", "role=operator"])).toEqual(
      new Map([["role", "operator"]]),
    );
  });

  it("supports repeated --axis flags for multiple axes", () => {
    expect(parseAxisFilters(["--axis", "tenant=north", "--axis", "role=operator"])).toEqual(
      new Map([
        ["tenant", "north"],
        ["role", "operator"],
      ]),
    );
  });

  it("returns an empty map when no filter flag is given", () => {
    expect(parseAxisFilters([])).toEqual(new Map());
  });

  it("rejects an --axis value with no `=`", () => {
    expect(() => parseAxisFilters(["--axis", "tenant"])).toThrow();
  });
});

describe("manualConfigSchema", () => {
  it("accepts a well-formed config", () => {
    expect(manualConfigSchema.safeParse(baseConfig).success).toBe(true);
  });

  it("rejects a config missing required manual fields", () => {
    const bad = { ...baseConfig, manual: { id: "m" } };
    expect(manualConfigSchema.safeParse(bad).success).toBe(false);
  });

  it("requires every target to declare a value for every declared axis", () => {
    const bad: ManualConfig = {
      ...baseConfig,
      axes: {
        tenant: { values: [{ id: "north", name: "Movilidad Medellín" }] },
        role: { values: [{ id: "operator", name: "Operador" }] },
      },
      // Missing `role` — must be a hard error, not a permissive default that
      // leaves the `role` axis unconstrained and merges every role together.
      targets: [{ tenant: "north" }],
    };
    expect(manualConfigSchema.safeParse(bad).success).toBe(false);
  });
});

// The engine conditions on whatever axis a target names (`core/src/condition.ts`),
// and invariant 3 says tenant is one named axis among possible others. The CLI
// did not honour that: it asked for an axis literally called `tenant`, so a
// manual conditioned on permissions could not be built at all — and the only way
// to make it build was to call a permission profile a deployment on the cover,
// in the filename and in the figure folders.
describe("primaryAxis", () => {
  const withAxes = (axes: ManualConfig["axes"]): ManualConfig => ({ ...baseConfig, axes });

  it("is the only axis a manual declares, whatever it is called", () => {
    expect(primaryAxis(withAxes({ permission: { values: [{ id: "propia", name: "Propia" }] } }))).toBe(
      "permission",
    );
  });

  it("is still `tenant` for a manual whose one axis is tenant", () => {
    expect(primaryAxis(baseConfig)).toBe("tenant");
  });

  // Picking the first key would make the output filename depend on the order
  // somebody happened to write the YAML in.
  it("refuses to guess between two axes, naming both", () => {
    const two = withAxes({
      tenant: { values: [{ id: "north", name: "NORTH" }] },
      permission: { values: [{ id: "propia", name: "Propia" }] },
    });
    expect(() => primaryAxis(two)).toThrow(/tenant/);
    expect(() => primaryAxis(two)).toThrow(/permission/);
  });

  it("says what is missing when a manual declares no axis at all", () => {
    expect(() => primaryAxis(withAxes({}))).toThrow(/no axes/);
  });
});

describe("outputFilename", () => {
  it("expands the axis token by the axis's own name", () => {
    const config: ManualConfig = {
      ...baseConfig,
      axes: { permission: { values: [{ id: "todas", name: "Todas" }] } },
      output: { dir: "output", filename: "manual-{permission}-v{contentVersion}.pdf" },
    };
    expect(outputFilename(config, { permission: "todas" }, "0.1.0")).toBe("manual-todas-v0.1.0.pdf");
  });

  it("keeps expanding `{tenant}` for the manual that already ships", () => {
    const config: ManualConfig = {
      ...baseConfig,
      output: { dir: "output", filename: "manual-operador-{tenant}-v{contentVersion}.pdf" },
    };
    expect(outputFilename(config, { tenant: "north" }, "0.1.0")).toBe("manual-operador-north-v0.1.0.pdf");
  });
});

describe("workFilename", () => {
  const config: ManualConfig = {
    ...baseConfig,
    output: { dir: "output", filename: "manual-operador-{tenant}-v{contentVersion}.pdf" },
  };

  it("replaces the whole version segment, `v` included", () => {
    expect(workFilename(config, { tenant: "north" }, 8)).toBe("manual-operador-north-trabajo-08.pdf");
  });

  it("never produces a name that could be read as a version", () => {
    expect(workFilename(config, { tenant: "north" }, 8)).not.toMatch(/-v/);
  });

  it("keeps the prefix a template chose when it writes the token bare", () => {
    const bare: ManualConfig = {
      ...baseConfig,
      output: { dir: "output", filename: "catalogo-{tenant}-{contentVersion}.pdf" },
    };
    expect(workFilename(bare, { tenant: "north" }, 3)).toBe("catalogo-north-trabajo-03.pdf");
  });

  it("stops padding once the number outgrows two digits", () => {
    expect(workFilename(config, { tenant: "north" }, 117)).toBe("manual-operador-north-trabajo-117.pdf");
  });
});


describe("axisValueName", () => {
  it("resolves the declared display name for an axis value", () => {
    expect(axisValueName(baseConfig, "tenant", "north")).toBe("Movilidad Medellín");
  });

  it("throws instead of falling back to a stringified id for an unresolved value", () => {
    // A client-facing PDF must never print a literal "undefined" or raw id.
    expect(() => axisValueName(baseConfig, "tenant", "unknown-id")).toThrow();
  });
});

describe("formatCliError", () => {
  it("formats a plain Error into an actionable message, not a raw stack trace", () => {
    const message = formatCliError(new Error("--tenant requires a value"));
    expect(message).toBe("error: --tenant requires a value");
    expect(message).not.toContain("\n    at ");
  });
});

describe("run", () => {
  it("turns a bad --tenant invocation (a plain CLI typo) into a formatted error, not an uncaught stack trace", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      // `parseAxisFilters` throws a plain `Error` here — it must be caught
      // by `run()`'s guarded region, not escape as a raw stack trace.
      const exitCode = await run(["build", "some-manual", "--tenant"]);
      expect(exitCode).toBe(1);
      expect(errorSpy).toHaveBeenCalledWith(
        expect.stringContaining("error: --tenant requires a value"),
      );
      for (const call of errorSpy.mock.calls) {
        expect(String(call[0])).not.toContain("\n    at ");
      }
    } finally {
      errorSpy.mockRestore();
    }
  });
});

describe("assertChangeLog", () => {
  const block = (type: string): ManualNode => ({
    kind: "block",
    id: `b.${type}`,
    type,
    props: {},
  });

  const section = (id: string, children: readonly ManualNode[]): ManualNode => ({
    kind: "section",
    id,
    title: [{ kind: "text", value: id }],
    children,
  });

  const prose = section("s.prose", [block("prose")]);
  const log = section("s.log", [block("change-log")]);
  const files = (n: number): string[] =>
    Array.from({ length: n }, (_, i) => `0${i + 1}-section.yaml`);

  it("passes a manual with no change log at all", () => {
    expect(() => assertChangeLog([prose, prose], files(2))).not.toThrow();
  });

  it("passes when the change log is the final section", () => {
    expect(() => assertChangeLog([prose, prose, log], files(3))).not.toThrow();
  });

  /**
   * The failure this exists for. Sections load in filename order, so a change
   * log stops being last the moment someone adds a section that sorts after it
   * — a decision made while naming a file, not while thinking about the change
   * log. Nothing else in the build would notice.
   */
  it("rejects a change log that something else follows, and names what follows it", () => {
    expect(() => assertChangeLog([log, prose], files(2))).toThrow(
      /FINAL module.*02-section\.yaml/s,
    );
  });

  it("rejects two change logs, because two delivery histories cannot both be current", () => {
    expect(() => assertChangeLog([log, prose, log], files(3))).toThrow(
      /2 `change-log` blocks/,
    );
  });

  it("rejects rows that do not ascend, so the cover matches the table's last row", () => {
    const backwards: ManualNode = {
      kind: "section",
      id: "s.log",
      title: [{ kind: "text", value: "s.log" }],
      children: [
        {
          kind: "block",
          id: "b.log",
          type: "change-log",
          props: {
            rows: [
              { id: "r1", version: "1.5.0" },
              { id: "r2", version: "1.4.7" },
            ],
          },
        },
      ],
    };
    expect(() => assertChangeLog([prose, backwards], files(2))).toThrow(/must ASCEND/);
  });

  /** The block sits inside a subsection in real content, never at section root. */
  it("finds a change log nested below the top level", () => {
    const nested = section("s.top", [section("s.sub", [block("change-log")])]);
    expect(() => assertChangeLog([prose, nested], files(2))).not.toThrow();
    expect(() => assertChangeLog([nested, prose], files(2))).toThrow(/FINAL module/);
  });
});

describe("deliveredVersion", () => {
  const logWith = (...versions: string[]): ManualNode => ({
    kind: "section",
    id: "s.log",
    title: [{ kind: "text", value: "Historial" }],
    children: [
      {
        kind: "block",
        id: "b.log",
        type: "change-log",
        props: { rows: versions.map((version, i) => ({ id: `r${i}`, version })) },
      },
    ],
  });

  it("falls back to the config field when the manual has no change log", () => {
    const plain: ManualNode = {
      kind: "section",
      id: "s",
      title: [{ kind: "text", value: "s" }],
      children: [{ kind: "block", id: "b", type: "prose", props: { text: "x" } }],
    };
    expect(deliveredVersion([plain], "0.6.9")).toBe("0.6.9");
  });

  it("takes the highest row, not the config field", () => {
    expect(deliveredVersion([logWith("1.4.7", "1.5.0")], "0.1.0")).toBe("1.5.0");
  });

  /**
   * The case the whole derivation exists for. Rows carry their own selectors,
   * so an ASSEMBLED south manual holds only 1.4.7 while north holds both — and each
   * cover prints what that target actually received. One `contentVersion`
   * scalar could never say this.
   */
  it("reports what one target received, once its rows have been conditioned away", () => {
    expect(deliveredVersion([logWith("1.4.7")], "0.1.0")).toBe("1.4.7");
    expect(deliveredVersion([logWith("1.4.7", "1.5.0")], "0.1.0")).toBe("1.5.0");
  });

  /** String comparison puts 1.9.0 above 1.10.0. Numeric comparison does not. */
  it("compares version parts numerically", () => {
    expect(deliveredVersion([logWith("1.9.0", "1.10.0")], "0.0.0")).toBe("1.10.0");
    expect(deliveredVersion([logWith("0.0.1")], "0.6.9")).toBe("0.0.1");
  });
});

describe("the working number and the draft marker compose", () => {
  const config: ManualConfig = {
    ...baseConfig,
    output: { dir: "output", filename: "manual-operador-{tenant}-v{contentVersion}.pdf" },
  };

  it("marks a draft of a working build without either marker eating the other", () => {
    expect(draftFilename(workFilename(config, { tenant: "north" }, 8))).toBe(
      "manual-operador-north-trabajo-08-BORRADOR.pdf",
    );
  });
});

describe("deliveryProofFor", () => {
  const SHA_A = "a".repeat(64);
  const SHA_B = "b".repeat(64);

  const log = (rows: readonly Record<string, unknown>[]): ManualNode => ({
    kind: "section",
    id: "s.log",
    title: [{ kind: "text", value: "Historial" }],
    children: [{ kind: "block", id: "b.log", type: "change-log", props: { rows } }],
  });

  const delivered = log([
    {
      id: "r1",
      version: "1.0.0",
      delivered: { north: { commit: "a9f780e", files: { "m-north.pdf": SHA_A } } },
    },
    {
      id: "r2",
      version: "1.1.0",
      delivered: {
        north: { commit: "cd40d46", files: { "m-north.pdf": SHA_B } },
        // Its own commit, because it was handed over on its own day.
        south: { commit: "8a0ab58", files: { "m-south.pdf": SHA_A } },
      },
    },
  ]);

  it("finds the proof for one version and one target", () => {
    expect(deliveryProofFor([delivered], "1.0.0", "north")).toEqual({
      commit: "a9f780e",
      files: { "m-north.pdf": SHA_A },
    });
  });

  /**
   * The distinction the whole guard rests on. A version handed to `north` and not
   * to `south` is the normal case, so "this version was delivered" is never a
   * fact about the manual — only ever about a target.
   */
  it("returns nothing for a target that version was never handed to", () => {
    expect(deliveryProofFor([delivered], "1.0.0", "south")).toBeUndefined();
    expect(deliveryProofFor([delivered], "1.1.0", "south")).toBeDefined();
  });

  it("returns nothing for a row that carries no proof", () => {
    const undelivered = log([{ id: "r1", version: "2.0.0" }]);
    expect(deliveryProofFor([undelivered], "2.0.0", "north")).toBeUndefined();
  });

  it("returns nothing when the manual has no change log at all", () => {
    const plain: ManualNode = {
      kind: "section",
      id: "s",
      title: [{ kind: "text", value: "s" }],
      children: [{ kind: "block", id: "b", type: "prose", props: { text: "x" } }],
    };
    expect(deliveryProofFor([plain], "1.0.0", "north")).toBeUndefined();
  });

  /** A half-written proof must not read as a delivery. */
  it("ignores a proof missing its commit or its hash", () => {
    const broken = log([
      { id: "r1", version: "3.0.0", delivered: { files: { north: { "m.pdf": SHA_A } } } },
      { id: "r2", version: "3.1.0", delivered: { commit: "a9f780e", files: {} } },
    ]);
    expect(deliveryProofFor([broken], "3.0.0", "north")).toBeUndefined();
    expect(deliveryProofFor([broken], "3.1.0", "north")).toBeUndefined();
  });
});
