import { describe, expect, it } from "vitest";
import { reconcileAxisValues } from "./reconcile.ts";

describe("reconcileAxisValues", () => {
  it("says nothing when the manual declares exactly what the product has", () => {
    expect(reconcileAxisValues("tenant", ["north", "south"], ["north", "south"])).toEqual([]);
  });

  // The case that made this necessary: the product ships `dev.config.ts`, so the
  // extraction finds seven deployments where the manual declares six. Left
  // unreported, `dev` quietly joins every `enabledFor` list and the map reads as
  // though a development config were a client.
  it("reports a product value the manual never declared", () => {
    const out = reconcileAxisValues("tenant", ["north", "south", "dev"], ["north", "south"]);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatch(/dev/);
    expect(out[0]).toMatch(/not declared/i);
  });

  it("reports a manual value with no config behind it — the worse direction", () => {
    const out = reconcileAxisValues("tenant", ["north"], ["north", "ghost"]);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatch(/ghost/);
    expect(out[0]).toMatch(/no config/i);
  });

  it("reports both directions at once", () => {
    expect(reconcileAxisValues("tenant", ["north", "dev"], ["north", "ghost"])).toHaveLength(2);
  });

  it("is order-insensitive", () => {
    expect(reconcileAxisValues("tenant", ["south", "north"], ["north", "south"])).toEqual([]);
  });

  // The undeclared-value message tells the reader which config key to go and
  // add to. Naming `axes.tenant.values` at a manual conditioned on permissions
  // sends them to a key that does not exist in their file.
  //
  // The other direction names no key at all, and is left that way: there is
  // nothing to add, and inventing a pointer is not part of naming the axis.
  it("names the config key of the axis it was given", () => {
    const out = reconcileAxisValues("permission", ["propia", "todas"], ["propia"]);
    expect(out[0]).toContain("axes.permission.values");
  });

  it("names the tenant key when the axis is tenant", () => {
    const out = reconcileAxisValues("tenant", ["north", "dev"], ["north"]);
    expect(out[0]).toContain("axes.tenant.values");
  });
});
