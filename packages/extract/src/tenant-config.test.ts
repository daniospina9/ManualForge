import { describe, expect, it } from "vitest";
import { capabilityMatrix, parseTenantConfig } from "./tenant-config.ts";

const NORTH = `export default {
  name: "NORTH",
  basePath: "north",
  title: "Traffic Dashboard",
  apiURL: "https://central.example.com",
  canViewFilterZone: true,
  canViewFilterUNP: false,
  canSeeBoT: true,
};
`;

describe("parseTenantConfig", () => {
  it("takes the tenant code from the config, never from the filename", () => {
    // The manual's axis ids are lowercase; the product's own code is not. Only
    // the file says which is which, so both are recorded.
    const c = parseTenantConfig("north.config.ts", NORTH);
    expect(c.id).toBe("north");
    expect(c.code).toBe("NORTH");
    expect(c.source).toBe("north.config.ts:2");
  });

  it("records every boolean flag with the line it came from", () => {
    const c = parseTenantConfig("north.config.ts", NORTH);
    expect(c.flags["canViewFilterZone"]).toEqual({ value: true, line: 6 });
    expect(c.flags["canViewFilterUNP"]).toEqual({ value: false, line: 7 });
    expect(c.flags["canSeeBoT"]).toEqual({ value: true, line: 8 });
  });

  it("ignores non-boolean settings — a URL is not a capability", () => {
    const c = parseTenantConfig("north.config.ts", NORTH);
    expect(Object.keys(c.flags).sort()).toEqual([
      "canSeeBoT",
      "canViewFilterUNP",
      "canViewFilterZone",
    ]);
  });

  it("accepts a flag whose line has no trailing comma", () => {
    const c = parseTenantConfig("x.config.ts", `export default {\n  name: "X",\n  canSeeBoT: true\n};`);
    expect(c.flags["canSeeBoT"]?.value).toBe(true);
  });

  it("refuses a config with no name — the code is not optional", () => {
    expect(() => parseTenantConfig("x.config.ts", `export default { basePath: "x" };`)).toThrow(
      /name/,
    );
  });
});

describe("capabilityMatrix", () => {
  const withFlags = (id: string, code: string, flags: Record<string, boolean>) =>
    parseTenantConfig(
      `${id}.config.ts`,
      `export default {\n  name: "${code}",\n` +
        Object.entries(flags)
          .map(([k, v]) => `  ${k}: ${v},`)
          .join("\n") +
        `\n};`,
    );

  it("puts one row per flag and one column per axis value", () => {
    const m = capabilityMatrix([
      withFlags("north", "NORTH", { canSeeBoT: true }),
      withFlags("south", "SOUTH", { canSeeBoT: false }),
    ]);
    const row = m.find((r) => r.flag === "canSeeBoT");
    expect(row?.values["north"]?.value).toBe(true);
    expect(row?.values["south"]?.value).toBe(false);
  });

  // The hazard this exists to surface: `south` declares 92 settings and `north` 47,
  // so a flag simply missing from one config is routine — and it is NOT `false`.
  // Treating absent as off would silently claim a deployment lacks a feature.
  it("marks a flag absent from a config as absent, never as false", () => {
    const m = capabilityMatrix([
      withFlags("north", "NORTH", { canSeeBoT: true }),
      withFlags("south", "SOUTH", {}),
    ]);
    const row = m.find((r) => r.flag === "canSeeBoT");
    expect(row?.values["south"]).toBeUndefined();
    expect(row?.absentFrom).toEqual(["south"]);
  });

  it("says nothing is absent when every config declares the flag", () => {
    const m = capabilityMatrix([
      withFlags("north", "NORTH", { canSeeBoT: true }),
      withFlags("south", "SOUTH", { canSeeBoT: true }),
    ]);
    expect(m.find((r) => r.flag === "canSeeBoT")?.absentFrom).toBeUndefined();
  });

  it("names the tenants a capability is on for, which is what content needs", () => {
    const m = capabilityMatrix([
      withFlags("north", "NORTH", { canSeeBoT: true }),
      withFlags("south", "SOUTH", { canSeeBoT: false }),
      withFlags("lite", "LITE", { canSeeBoT: true }),
    ]);
    expect(m.find((r) => r.flag === "canSeeBoT")?.enabledFor).toEqual(["north", "lite"]);
  });

  it("orders rows by flag name so two extractions of the same source diff cleanly", () => {
    const m = capabilityMatrix([withFlags("north", "NORTH", { zeta: true, alpha: false })]);
    expect(m.map((r) => r.flag)).toEqual(["alpha", "zeta"]);
  });
});
