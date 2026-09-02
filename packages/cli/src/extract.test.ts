import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { AxisReference, CapabilityRow } from "@manualforge/extract";
import { diffMaps, extract, normalizeMap, type ModuleMap } from "./extract.ts";

const ref = (over: Partial<AxisReference> = {}): AxisReference => ({
  file: "src/render/components/AddObservation.tsx",
  line: 133,
  codes: ["NORTH"],
  polarity: "positive",
  kind: "inline",
  text: 'config.name === "NORTH"',
  confidence: "high",
  ...over,
});

const cap = (over: Partial<CapabilityRow> = {}): CapabilityRow => ({
  flag: "canSeeBoT",
  values: { north: { value: true, line: 12 } },
  enabledFor: ["north"],
  ...over,
});

const map = (over: Partial<ModuleMap> = {}): ModuleMap => ({
  source: "atlas",
  axis: "tenant",
  values: [{ id: "north", code: "NORTH", source: "src/render/config/north.config.ts:2" }],
  capabilities: [],
  references: [],
  ...over,
});

const report = (before: ModuleMap, after: ModuleMap) => diffMaps(before, after).join("\n");

describe("diffMaps — axis values and capabilities", () => {
  it("reports a value the product gained", () => {
    const after = map({
      values: [...map().values, { id: "south", code: "SOUTH", source: "south.config.ts:2" }],
    });
    expect(report(map(), after)).toContain("tenant added: south");
  });

  it("reports a value the product lost", () => {
    const before = map({
      values: [...map().values, { id: "south", code: "SOUTH", source: "south.config.ts:2" }],
    });
    expect(report(before, map())).toContain("tenant removed: south");
  });

  // Invariant 3: the axis is a build axis, not a label. Calling a permission
  // profile a "deployment" in the drift report is the same lie as printing it on
  // a cover — the report is read by whoever decides what content is tagged with.
  it("names the axis rather than assuming it is tenant", () => {
    const before = map({ axis: "permission", values: [] });
    const after = map({
      axis: "permission",
      values: [{ id: "todas-las-agencias", code: "*", source: "can-view-all-agencies.ts:8" }],
    });
    const out = report(before, after);
    expect(out).toContain("permission added: todas-las-agencias");
    expect(out).not.toContain("deployment");
  });

  it("reports a capability that changed hands, naming both sides", () => {
    const before = map({ capabilities: [cap()] });
    const after = map({ capabilities: [cap({ enabledFor: ["north", "south"] })] });
    const out = report(before, after);
    expect(out).toContain("capability changed: canSeeBoT");
    expect(out).toContain("was on for [north]");
    expect(out).toContain("now [north,south]");
  });

  it("says nothing when neither moved", () => {
    expect(diffMaps(map({ capabilities: [cap()] }), map({ capabilities: [cap()] }))).toEqual([]);
  });
});

// The map being repointed at a different axis is not a diff, it is a different
// question. Every value and every gate below it means something else, so pairing
// them up would produce a page of changes that describe nothing that happened.
describe("diffMaps — the axis itself changing", () => {
  it("reports the change and diffs nothing under it", () => {
    const before = map({ axis: "tenant", references: [ref()] });
    const after = map({
      axis: "permission",
      values: [{ id: "propia", code: "propia", source: "x.ts:1" }],
      references: [],
    });
    const out = diffMaps(before, after);
    expect(out).toHaveLength(1);
    expect(out[0]).toContain("axis changed: tenant -> permission");
  });
});

describe("diffMaps — axis gates", () => {
  // The reason this comparison exists. Divergence in the product is mostly
  // element-level: a gate that flips polarity silently invalidates the tagging
  // already written, and no other stage of the pipeline can notice.
  it("reports a gate that flipped polarity", () => {
    const before = map({ references: [ref({ polarity: "negative" })] });
    const after = map({ references: [ref({ polarity: "positive" })] });
    const out = report(before, after);
    expect(out).toContain("gating changed");
    expect(out).toContain("AddObservation.tsx");
    expect(out).toContain("was negative, now positive");
    expect(out).toContain("content tagged on this may be wrong");
  });

  it("reports a gate that appeared in a file that had none", () => {
    const after = map({
      references: [ref({ file: "src/render/pages/Dashboard/CallAI.tsx", codes: ["SOUTH"] })],
    });
    const out = report(map(), after);
    expect(out).toContain("gating added");
    expect(out).toContain("CallAI.tsx");
    expect(out).toContain("SOUTH");
  });

  it("reports a gate that disappeared", () => {
    const before = map({ references: [ref()] });
    expect(report(before, map())).toContain("gating removed");
  });

  // The noise guard, and the reason a gate is not identified by its position.
  // Someone adding an import shifts every line below it; reporting that would
  // drown the drift this file exists to show.
  it("says nothing when a gate only moved down the file", () => {
    const before = map({ references: [ref({ line: 133 })] });
    const after = map({ references: [ref({ line: 134 })] });
    expect(diffMaps(before, after)).toEqual([]);
  });

  // Same decision, rewritten. The gate still names NORTH, still positively, still
  // inline — the manual's tagging is unaffected.
  it("says nothing when the line was reworded but decides the same thing", () => {
    const before = map({ references: [ref({ text: 'config.name === "NORTH"' })] });
    const after = map({
      references: [ref({ text: 'useClosedReasonsList(config.name === "NORTH")', line: 180 })],
    });
    expect(diffMaps(before, after)).toEqual([]);
  });

  // A second identical gate in the same file is a new gated place, not a
  // duplicate to fold away: the count is part of what changed.
  it("reports a second gate added beside an identical one", () => {
    const before = map({ references: [ref()] });
    const after = map({ references: [ref(), ref({ line: 918 })] });
    const out = report(before, after);
    expect(out).toContain("gating changed");
    expect(out).toContain("now positive x2");
  });

  // Gates are told apart by what they decide, not only by where they live: two
  // values gated in one file are two facts.
  it("keeps gates in the same file apart when they name different values", () => {
    const before = map({ references: [ref({ codes: ["NORTH"] }), ref({ codes: ["SOUTH"] })] });
    const after = map({
      references: [ref({ codes: ["NORTH"] }), ref({ codes: ["SOUTH"], polarity: "negative" })],
    });
    const out = report(before, after);
    expect(out).toContain("SOUTH");
    expect(out).toContain("was positive, now negative");
    expect(out).not.toContain("NORTH —");
  });

  it("tells a route gate apart from an inline comparison in the same file", () => {
    const before = map({ references: [ref({ kind: "route-gate" })] });
    const after = map({ references: [ref({ kind: "inline" })] });
    const out = report(before, after);
    expect(out).toContain("gating added");
    expect(out).toContain("gating removed");
  });
});

// --- reading a map written before the axis had a name -----------------------
//
// `atlas`'s map is on disk with `tenants` and `tenantReferences`. The
// rename must not become a drift report: 7 values and 100 gates would all read
// as removed-and-re-added, and a report that fires on its own field rename is a
// report nobody reads the next time it fires for real.

/** The shape written before the map named its axis — what is on disk today. */
const legacy = (over: Record<string, unknown> = {}): ModuleMap =>
  ({
    source: "atlas",
    tenants: [{ id: "north", code: "NORTH", source: "src/render/config/north.config.ts:2" }],
    capabilities: [],
    tenantReferences: [],
    ...over,
  }) as unknown as ModuleMap;

describe("normalizeMap — the previous map's shape", () => {
  it("reads the old field names, so the rename alone reports nothing", () => {
    const before = legacy({ tenantReferences: [ref()] });
    expect(diffMaps(before, map({ references: [ref()] }))).toEqual([]);
  });

  // Asserted on `normalizeMap` rather than through `diffMaps`, because the
  // capability diff only reads `enabledFor` — going through it would pass
  // whether or not the inner field was normalised at all.
  it("reads a capability row written with the old inner field name", () => {
    const before = legacy({
      capabilities: [
        { flag: "canSeeBoT", tenants: { north: { value: true, line: 12 } }, enabledFor: ["north"] },
      ],
    });
    const row = normalizeMap(before).capabilities[0];
    expect(row?.values["north"]?.value).toBe(true);
    expect(row).not.toHaveProperty("tenants");
  });

  // The migration must not buy quiet at the price of the report's job.
  it("still reports a real change read through the old shape", () => {
    const before = legacy({ tenantReferences: [ref({ polarity: "negative" })] });
    const out = report(before, map({ references: [ref({ polarity: "positive" })] }));
    expect(out).toContain("was negative, now positive");
  });

  // An absent axis is unknown, not "tenant". Announcing a change we cannot
  // substantiate would be inventing a fact, and one regeneration re-establishes
  // the baseline anyway.
  it("does not claim the axis changed when the previous map never recorded one", () => {
    expect(diffMaps(legacy(), map())).toEqual([]);
    expect(diffMaps(legacy(), map({ axis: "permission" }))).toEqual([]);
  });

  it("leaves a map already in the new shape alone", () => {
    const already = map({ references: [ref()], capabilities: [cap()] });
    expect(normalizeMap(already)).toEqual(already);
  });
});

// --- what a product whose tenancy is not in its own repository does ---------
//
// Beacon360 is the case: tenancy is real but resolved server-side from a JWT
// claim, so the client repository holds no per-tenant config to read. The
// registry has to be able to describe that product, and the extraction has to
// say so instead of crashing or inventing a map.

const roots: string[] = [];

afterEach(() => {
  for (const r of roots.splice(0)) rmSync(r, { recursive: true, force: true });
});

/** A repository root with one registry entry and one manual documenting it. */
const repoWith = (extractBlock: string, manualConfig = "manual:\n  source: producto\n"): string => {
  const root = mkdtempSync(join(tmpdir(), "atlas-extract-"));
  roots.push(root);
  mkdirSync(join(root, "sources"), { recursive: true });
  mkdirSync(join(root, "manuals", "un-manual"), { recursive: true });
  mkdirSync(join(root, "producto", "src"), { recursive: true });
  writeFileSync(
    join(root, "sources", "registry.yaml"),
    [
      "version: 1",
      "sources:",
      "  producto:",
      "    name: Producto",
      "    path: ./producto",
      "    framework: react-vite-ts",
      "    extract:",
      extractBlock,
      "",
    ].join("\n"),
  );
  writeFileSync(join(root, "manuals", "un-manual", "manual.config.yaml"), manualConfig);
  return root;
};

const mapFile = (root: string): string =>
  join(root, "manuals", "un-manual", "knowledge", "module-map.json");

describe("extract, for a product with no tenant registry in its source", () => {
  const noTenantConfigs = "      components: src\n      pages: src";

  it("lets the registry describe it at all", () => {
    // The schema used to require `tenantConfigs`, so the entry could not be
    // written without inventing a path — and an invented path is the one defect
    // this whole layer exists to prevent.
    expect(() => extract(repoWith(noTenantConfigs), "un-manual")).not.toThrow(
      /invalid_type|Required/,
    );
  });

  it("says the extractor has no tenant registry to read", () => {
    expect(() => extract(repoWith(noTenantConfigs), "un-manual")).toThrow(
      /no tenant registry to read/,
    );
  });

  it("writes no map, because a map with no values would claim one deployment", () => {
    const root = repoWith(noTenantConfigs);
    expect(() => extract(root, "un-manual")).toThrow();
    expect(existsSync(mapFile(root))).toBe(false);
  });

  it("names the seam a product-specific extractor goes on", () => {
    expect(() => extract(repoWith(noTenantConfigs), "un-manual")).toThrow(/framework/);
  });

  // The product-shape verdict comes first. A manual documenting a product this
  // extractor cannot read must hear that, not a complaint about its own axes —
  // the axes are fine, the extractor is the thing that does not fit.
  it("says so before it complains about the manual's axes", () => {
    expect(() => extract(repoWith(noTenantConfigs), "un-manual")).toThrow(
      /no tenant registry to read/,
    );
  });
});

describe("extract, when the declared tenant configs are not there", () => {
  const missingDir =
    "      tenantConfigs: src/config/*.config.ts\n      components: src\n      pages: src";

  it("names the directory it looked in rather than surfacing a filesystem error", () => {
    const root = repoWith(missingDir);
    expect(() => extract(root, "un-manual")).toThrow(/src\/config/);
    expect(() => extract(root, "un-manual")).toThrow(/does not exist/);
  });
});

// --- the map records the axis it describes ----------------------------------

const extractBlock =
  "      tenantConfigs: src/config/*.config.ts\n      components: src\n      pages: src";

/** A repo whose product really has configs, so extraction runs to completion. */
const workingRepo = (axes: string): string => {
  const root = repoWith(extractBlock, `manual:\n  source: producto\n${axes}`);
  const configDir = join(root, "producto", "src", "config");
  mkdirSync(configDir, { recursive: true });
  writeFileSync(join(configDir, "north.config.ts"), 'export default {\n  name: "NORTH",\n  canSeeBoT: true,\n}\n');
  writeFileSync(join(root, "producto", "src", "Panel.tsx"), 'if (config.name === "NORTH") show()\n');
  return root;
};

const byTenant = "axes:\n  tenant:\n    values:\n      - id: north\n";

describe("extract — the map says which axis it describes", () => {
  it("records the axis from the manual's own config", () => {
    const { map: m } = extract(workingRepo(byTenant), "un-manual");
    expect(m.axis).toBe("tenant");
  });

  it("records a non-tenant axis by its own name", () => {
    const byPermission = "axes:\n  permission:\n    values:\n      - id: north\n";
    const { map: m } = extract(workingRepo(byPermission), "un-manual");
    expect(m.axis).toBe("permission");
  });

  it("carries the axis values under `values`, not under a tenant-shaped key", () => {
    const { map: m } = extract(workingRepo(byTenant), "un-manual");
    expect(m.values.map((v) => v.id)).toEqual(["north"]);
    expect(m).not.toHaveProperty("tenants");
    expect(m).not.toHaveProperty("tenantReferences");
  });

  it("carries the code references under `references`", () => {
    const { map: m } = extract(workingRepo(byTenant), "un-manual");
    expect(m.references.map((r) => r.text)).toContain('if (config.name === "NORTH") show()');
  });

  // The old code read `axes.tenant.values` literally, so a manual conditioned on
  // anything else reconciled against an empty list and every value it declared
  // was reported as having no config behind it.
  it("reconciles against the axis the manual actually declares", () => {
    const declared = "axes:\n  permission:\n    values:\n      - id: north\n";
    const { map: m } = extract(workingRepo(declared), "un-manual");
    expect(m.registryMismatch).toBeUndefined();
  });

  it("names that axis when the two disagree", () => {
    const declared = "axes:\n  permission:\n    values:\n      - id: fantasma\n";
    const { map: m } = extract(workingRepo(declared), "un-manual");
    expect((m.registryMismatch ?? []).join("\n")).toContain("axes.permission.values");
  });

  it("refuses a manual that declares no axis at all", () => {
    expect(() => extract(workingRepo(""), "un-manual")).toThrow(/no axes/);
  });
});
