import { describe, expect, it } from "vitest";
import { EXTRACTORS, extractorProblem, isSupportedFramework } from "./framework.ts";

describe("isSupportedFramework", () => {
  it("accepts the one shape this package can read", () => {
    expect(isSupportedFramework("react-vite-ts")).toBe(true);
  });

  it("rejects a framework nobody wrote a reader for", () => {
    expect(isSupportedFramework("react-tauri-ts")).toBe(false);
  });

  it("rejects a value that is not a string, because a registry is hand-written", () => {
    expect(isSupportedFramework(undefined)).toBe(false);
    expect(isSupportedFramework(42)).toBe(false);
  });
});

describe("extractorProblem", () => {
  it("is null for a framework with a reader, so extraction proceeds", () => {
    expect(extractorProblem("atlas", "react-vite-ts")).toBeNull();
  });

  // The hole this closes. `react-tauri-ts` has been in the registry since the
  // second source, and no code read the field: extraction ran the one parser
  // there was. A product declaring another framework that happened to hold
  // files matching `*.config.ts` was parsed by a reader written for somebody
  // else's shape, and nothing downstream — map, build, manual — carried a sign
  // that it had been read wrong.
  it("refuses a framework it has no reader for, rather than parsing it anyway", () => {
    expect(extractorProblem("beacon", "react-tauri-ts")).not.toBeNull();
  });

  it("names the framework that was declared, so the entry can be checked", () => {
    expect(extractorProblem("beacon", "react-tauri-ts")).toMatch(/react-tauri-ts/);
  });

  it("names the source, because a registry holds several", () => {
    expect(extractorProblem("beacon", "react-tauri-ts")).toMatch(/beacon/);
  });

  it("lists what it can read, so the reader is not left guessing", () => {
    const message = extractorProblem("beacon", "react-tauri-ts") ?? "";
    for (const known of EXTRACTORS) expect(message).toContain(known);
  });

  // Refusing is not a dead end, and saying so is the whole point of B1. Three
  // of the four manuals this engine has shipped were authored with no module
  // map at all — including one delivered to a client. A message that reads as
  // "this tool is not for your product" would be false.
  it("says extraction is optional, so a refusal does not read as a dead end", () => {
    expect(extractorProblem("beacon", "react-tauri-ts")).toMatch(/optional/i);
  });

  it("states that nothing was written, so no half-extraction is suspected", () => {
    expect(extractorProblem("beacon", "react-tauri-ts")).toMatch(/nothing was written/i);
  });

  it("points at the seam, so adding a reader is a documented next step", () => {
    expect(extractorProblem("beacon", "react-tauri-ts")).toMatch(
      /packages\/extract\/AGENTS\.md/,
    );
  });

  it("treats a missing framework as unreadable rather than assuming the default", () => {
    expect(extractorProblem("beacon", undefined)).not.toBeNull();
  });
});
