import { describe, expect, it } from "vitest";
import { checkLabel } from "./label-check.ts";

const FILE = [
  "export function Toolbar() {",
  "  return (",
  '    <button title="Editar distribución" aria-label="Editar distribución">',
  "      <Pencil />",
  "    </button>",
  "  );",
  "}",
].join("\n");

describe("checkLabel", () => {
  it("passes when the cited line still says it", () => {
    expect(checkLabel(FILE, "Editar distribución", 3)).toEqual({ state: "ok" });
  });

  // The common case when the product is edited above the label: the citation is
  // stale, not wrong. Naming the line it moved to turns a hunt into a one-line
  // fix, which is the difference between a report people act on and one they skip.
  it("says where the label moved to", () => {
    expect(checkLabel(FILE, "Editar distribución", 1)).toEqual({
      state: "moved",
      foundAt: [3],
    });
  });

  it("lists every line it now appears on", () => {
    const twice = `${FILE}\n// <button title="Editar distribución" />`;
    expect(checkLabel(twice, "Editar distribución", 1)).toEqual({
      state: "moved",
      foundAt: [3, 8],
    });
  });

  // The case the whole feature exists for: the product renamed the control and
  // the manual is now telling the operator to press something that is not there.
  it("says the label is gone when the file no longer contains it", () => {
    expect(checkLabel(FILE, "Franja horaria", 3)).toEqual({ state: "gone" });
  });

  it("reports a missing file rather than guessing", () => {
    expect(checkLabel(undefined, "Editar distribución", 3)).toEqual({ state: "no-file" });
  });

  it("handles a line number past the end of the file", () => {
    expect(checkLabel(FILE, "Editar distribución", 900)).toEqual({
      state: "moved",
      foundAt: [3],
    });
    expect(checkLabel(FILE, "Franja horaria", 900)).toEqual({ state: "gone" });
  });

  // Substring, not equality: the label sits inside a JSX prop, an object
  // property or a call argument, and the check has no business parsing which.
  it("matches the label inside whatever syntax holds it", () => {
    expect(checkLabel('    header: "Operador ID",', "Operador ID", 1)).toEqual({ state: "ok" });
    expect(checkLabel('  <span>Llamadas en espera</span>', "Llamadas en espera", 1)).toEqual({
      state: "ok",
    });
  });

  // Accents and case are part of the label. A manual that writes "Editar
  // Distribución" is quoting something the screen does not say.
  it("is exact about case and accents", () => {
    expect(checkLabel(FILE, "editar distribución", 3).state).toBe("gone");
    expect(checkLabel(FILE, "Editar distribucion", 3).state).toBe("gone");
  });

  it("handles CRLF source without reporting every label as moved", () => {
    expect(checkLabel(FILE.split("\n").join("\r\n"), "Editar distribución", 3)).toEqual({
      state: "ok",
    });
  });
});
