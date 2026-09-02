import { describe, expect, it } from "vitest";
import { newestWorkNumberFor, nextWorkNumber, workNumberIn, workStamp } from "./naming.ts";

describe("workStamp", () => {
  it("pads to two digits so a folder listing sorts the way it reads", () => {
    expect(workStamp(1)).toBe("trabajo-01");
    expect(workStamp(9)).toBe("trabajo-09");
    expect(workStamp(10)).toBe("trabajo-10");
  });

  it("stops padding once the number outgrows two digits", () => {
    expect(workStamp(117)).toBe("trabajo-117");
  });
});

describe("workNumberIn", () => {
  it("reads the number out of a full build name", () => {
    expect(workNumberIn("manual-operador-north-trabajo-08.pdf")).toBe(8);
  });

  it("reads it through a draft marker", () => {
    expect(workNumberIn("manual-operador-north-trabajo-08-BORRADOR.pdf")).toBe(8);
  });

  it("finds nothing in a version-named file", () => {
    expect(workNumberIn("manual-operador-north-v1.0.0.pdf")).toBeNull();
  });
});

describe("nextWorkNumber", () => {
  it("starts at 1 for a manual with nothing built", () => {
    expect(nextWorkNumber([])).toBe(1);
  });

  it("starts at 1 when the only files there are not working builds", () => {
    // An official build sits in `output/` after a delivery. It must not be read
    // as the eighth of anything — it is a version, not an iteration of work.
    expect(nextWorkNumber(["manual-operador-north-v1.0.0.pdf", "notas.md"])).toBe(1);
  });

  it("continues from the highest number on disk", () => {
    expect(
      nextWorkNumber([
        "manual-operador-north-trabajo-07.pdf",
        "manual-operador-north-trabajo-08.pdf",
        "manual-operador-south-trabajo-08.pdf",
      ]),
    ).toBe(9);
  });

  it("compares numerically, so 10 beats 9 instead of sorting under it", () => {
    expect(nextWorkNumber(["m-trabajo-09.pdf", "m-trabajo-10.pdf"])).toBe(11);
  });

  it("counts a draft as a build that happened", () => {
    // Otherwise the next real build reuses 08, and two different documents on
    // disk would carry the same number.
    expect(nextWorkNumber(["manual-operador-north-trabajo-08-BORRADOR.pdf"])).toBe(9);
  });

  it("sees every extension, so one run's pdf, html and docx do not each advance it", () => {
    expect(nextWorkNumber(["m-trabajo-04.pdf", "m-trabajo-04.html", "m-trabajo-04.docx"])).toBe(5);
  });

  it("is allocated per manual, so a filtered run leaves a true gap", () => {
    // `build --tenant north` renders only north, and 09 is spent. south's newest stays
    // at 08 and the next full build gives both 10 — which is the point: equal
    // numbers always mean equal content.
    const afterFilteredRun = ["north-trabajo-09.pdf", "south-trabajo-08.pdf"];
    expect(nextWorkNumber(afterFilteredRun)).toBe(10);
  });
});

describe("newestWorkNumberFor", () => {
  const output = [
    "manual-operador-north-trabajo-09.pdf",
    "manual-operador-north-trabajo-08.pdf",
    "manual-operador-south-trabajo-08.pdf",
    "manual-operador-south-v1.4.7.pdf",
  ];

  it("reports each target's own newest build", () => {
    expect(newestWorkNumberFor(output, "north")).toBe(9);
    expect(newestWorkNumberFor(output, "south")).toBe(8);
  });

  it("reports nothing for a target with no working build", () => {
    expect(newestWorkNumberFor(output, "demo")).toBeNull();
  });

  it("does not let one axis value match inside another", () => {
    // `north` sits inside `mvd`. Bare inclusion would show mvd's builds under north.
    expect(newestWorkNumberFor(["manual-operador-mvd-trabajo-04.pdf"], "north")).toBeNull();
  });

  it("ignores an official build, which is not an iteration of work", () => {
    expect(newestWorkNumberFor(["manual-operador-north-v1.0.0.pdf"], "north")).toBeNull();
  });
});
