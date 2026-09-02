import { describe, expect, it } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { parse as parseYaml } from "yaml";
import { archive, hashFile, planDelivery, stampProof, unstampProof } from "./deliver.ts";

const tmp = (): string => mkdtempSync(join(tmpdir(), "deliver-"));
const file = (dir: string, name: string, body: string): string => {
  const p = join(dir, name);
  writeFileSync(p, body, "utf8");
  return p;
};

describe("hashFile", () => {
  it("is the SHA-256 of the bytes, lower-case hex", () => {
    const dir = tmp();
    // The digest of the empty string, which is a value anyone can check.
    expect(hashFile(file(dir, "empty", ""))).toBe(
      "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
    );
  });

  it("changes completely when one byte changes", () => {
    const dir = tmp();
    const a = hashFile(file(dir, "a", "manual"));
    const b = hashFile(file(dir, "b", "manuaL"));
    expect(a).not.toBe(b);
    expect(a.slice(0, 8)).not.toBe(b.slice(0, 8));
  });
});

describe("planDelivery", () => {
  const setup = () => {
    const out = tmp();
    file(out, "m-north-v1.0.0.pdf", "pdf");
    file(out, "m-north-v1.0.0.docx", "docx");
    file(out, "m-north-v1.0.0-BORRADOR.pdf", "draft");
    file(out, "m-north-v1.0.0-NO-ENTREGADO.pdf", "superseded");
    return out;
  };

  it("collects every named file for a target and hashes it", () => {
    const { plan, missing } = planDelivery(
      setup(),
      "1.0.0",
      new Map([["north", ["m-north-v1.0.0.pdf", "m-north-v1.0.0.docx"]]]),
    );
    expect(plan).toHaveLength(2);
    expect(missing).toEqual([]);
    expect(plan[0]?.sha).toMatch(/^[0-9a-f]{64}$/);
  });

  /**
   * A draft carries internal slot paths and must never reach a client. It is
   * excluded by never being asked for, rather than by a filter someone has to
   * remember to write.
   */
  it("cannot pick up a draft or a superseded build, because it never names one", () => {
    const { plan } = planDelivery(
      setup(),
      "1.0.0",
      new Map([["north", ["m-north-v1.0.0.pdf"]]]),
    );
    expect(plan.map((f) => basename(f.path))).toEqual(["m-north-v1.0.0.pdf"]);
  });

  it("reports a target whose files were never built", () => {
    const { missing } = planDelivery(
      setup(),
      "1.0.0",
      new Map([["north", ["m-north-v1.0.0.pdf"]], ["south", ["m-south-v1.0.0.pdf"]]]),
    );
    expect(missing).toEqual(["south"]);
  });
});

describe("archive", () => {
  const plan = (dir: string) => [
    { axisValue: "north", path: file(dir, "m-north-v1.0.0.pdf", "pdf"), sha: "a".repeat(64) },
  ];

  it("copies into a per-manual subfolder", () => {
    const src = tmp();
    const dest = tmp();
    const { copied, refused } = archive(dest, "atlas", plan(src));
    expect(copied).toEqual(["m-north-v1.0.0.pdf"]);
    expect(refused).toEqual([]);
    expect(existsSync(join(dest, "atlas", "m-north-v1.0.0.pdf"))).toBe(true);
  });

  /**
   * The archive is the only copy of what a client received, and the proof in
   * the repository refers to exactly those bytes. Overwriting destroys the
   * thing the proof is about.
   */
  it("REFUSES to overwrite a file already in the archive", () => {
    const src = tmp();
    const dest = tmp();
    mkdirSync(join(dest, "m"), { recursive: true });
    writeFileSync(join(dest, "m", "m-north-v1.0.0.pdf"), "el que recibió el cliente", "utf8");

    const { copied, refused } = archive(dest, "m", plan(src));
    expect(copied).toEqual([]);
    expect(refused).toEqual(["m-north-v1.0.0.pdf"]);
    expect(readFileSync(join(dest, "m", "m-north-v1.0.0.pdf"), "utf8")).toBe(
      "el que recibió el cliente",
    );
  });
});

describe("stampProof", () => {
  const SECTION = `# A comment carrying reasoning that must survive.
id: historial-cambios
children:
  - id: historial.tabla
    type: change-log
    props:
      rows:
        - id: historial.tabla.1-0-0
          version: 1.0.0
          date: 2026-08-26
          description: >-
            Primera entrega.
`;

  const proof = {
    commit: "8a0ab58",
    files: [
      { axisValue: "agencia-propia", path: "out/ap.pdf", sha: "a".repeat(64) },
      { axisValue: "todas-las-agencias", path: "out/tla.pdf", sha: "b".repeat(64) },
    ],
  };

  /**
   * Asserted as WHOLE LINES, not with `toContain`. Substring matching is blind
   * to leading whitespace — `"    commit:"` matches inside `"      commit:"` —
   * so the first version of this test passed unchanged through the move of
   * `commit` from row level down under each target. A test that survives the
   * change it should have caught is not a test.
   */
  it("nests commit and files UNDER each target, at the right depth", () => {
    const out = (stampProof(SECTION, "1.0.0", proof) as string).split("\n");
    const from = out.indexOf("          delivered:");
    expect(from).toBeGreaterThan(-1);
    expect(out.slice(from, from + 9)).toEqual([
      "          delivered:",
      "            agencia-propia:",
      "              commit: 8a0ab58",
      "              files:",
      `                ap.pdf: ${"a".repeat(64)}`,
      "            todas-las-agencias:",
      "              commit: 8a0ab58",
      "              files:",
      `                tla.pdf: ${"b".repeat(64)}`,
    ]);
  });

  /**
   * The whole point of the shape. Two targets delivered from two commits is
   * normal — one can be handed a version months after the other — and a single
   * row-level commit could only ever have described one of them.
   */
  it("lets a second target carry its OWN commit", () => {
    const first = stampProof(SECTION, "1.0.0", {
      commit: "9348ddb",
      files: [{ axisValue: "todas-las-agencias", path: "out/tla.pdf", sha: "b".repeat(64) }],
    }) as string;
    const both = stampProof(first, "1.0.0", {
      commit: "274e66f",
      files: [{ axisValue: "agencia-propia", path: "out/ap.pdf", sha: "a".repeat(64) }],
    }) as string;

    // ONE block, not two. Two `delivered:` keys in one mapping is a duplicate
    // key, YAML rejects it, and the manual stops parsing — after the files have
    // already been archived and committed.
    expect(both.split("\n").filter((l) => /^\s+delivered:$/.test(l))).toHaveLength(1);
    expect(both).toContain("commit: 9348ddb");
    expect(both).toContain("commit: 274e66f");
    expect(parseYaml(both)).toBeTruthy();
  });

  it("puts it after the date, leaving the human-facing fields together", () => {
    const out = stampProof(SECTION, "1.0.0", proof) as string;
    const lines = out.split("\n");
    expect(lines.findIndex((l) => l.includes("date:"))).toBeLessThan(
      lines.findIndex((l) => l.includes("delivered:")),
    );
    expect(lines.findIndex((l) => l.includes("delivered:"))).toBeLessThan(
      lines.findIndex((l) => l.includes("description:")),
    );
  });

  /**
   * The comments in these files carry why the manual is the way it is. A YAML
   * round-trip would erase them, which is why this edits text.
   */
  it("leaves every comment and every other line untouched", () => {
    const out = stampProof(SECTION, "1.0.0", proof) as string;
    expect(out).toContain("# A comment carrying reasoning that must survive.");
    for (const line of SECTION.split("\n")) expect(out).toContain(line);
  });

  /** The caller's signal that this is a new row, which an agent must write. */
  it("returns null when no row declares that version", () => {
    expect(stampProof(SECTION, "2.0.0", proof)).toBeNull();
  });

  it("does not confuse 1.0.0 with 1.0.01 or 11.0.0", () => {
    const odd = SECTION.replace("version: 1.0.0", "version: 11.0.0");
    expect(stampProof(odd, "1.0.0", proof)).toBeNull();
  });
});

/**
 * The defect a real run found. A target receives a SET — the PDF and the Word
 * file — and the first version of `stampProof` wrote one line per FILE under
 * the target's own key. The two collided on the same YAML key, duplicates
 * collapse silently with the last one winning, and the PDF's hash was simply
 * gone. Nothing downstream could have caught it: by the time the schema sees
 * the document, the parser has already discarded the loser.
 */
describe("stampProof with more than one file per target", () => {
  const SECTION = [
    "        - id: historial.tabla.1-0-0",
    "          version: 1.0.0",
    "          date: 2026-08-26",
    "          description: Primera entrega.",
    "",
  ].join("\n");

  const two = {
    commit: "f485b0d",
    files: [
      { axisValue: "agencia-propia", path: "out/m-ap-v1.0.0.pdf", sha: "a".repeat(64) },
      { axisValue: "agencia-propia", path: "out/m-ap-v1.0.0.docx", sha: "b".repeat(64) },
      { axisValue: "todas-las-agencias", path: "out/m-tla-v1.0.0.pdf", sha: "c".repeat(64) },
      { axisValue: "todas-las-agencias", path: "out/m-tla-v1.0.0.docx", sha: "d".repeat(64) },
    ],
  };

  it("groups by target and keys each file by its own name", () => {
    const out = (stampProof(SECTION, "1.0.0", two) as string).split("\n");
    const from = out.indexOf("          delivered:");
    expect(out.slice(from, from + 5)).toEqual([
      "          delivered:",
      "            agencia-propia:",
      "              commit: f485b0d",
      "              files:",
      `                m-ap-v1.0.0.pdf: ${"a".repeat(64)}`,
    ]);
    expect(out).toContain(`                m-ap-v1.0.0.docx: ${"b".repeat(64)}`);
  });

  it("writes each target's key exactly once", () => {
    const out = stampProof(SECTION, "1.0.0", two) as string;
    const count = (needle: string): number =>
      out.split("\n").filter((l) => l.trim().startsWith(needle)).length;
    expect(count("agencia-propia:")).toBe(1);
    expect(count("todas-las-agencias:")).toBe(1);
  });

  /** Every hash must survive. Losing one is the whole failure. */
  it("keeps all four hashes", () => {
    const out = stampProof(SECTION, "1.0.0", two) as string;
    for (const c of ["a", "b", "c", "d"]) expect(out).toContain(c.repeat(64));
  });
});

describe("unstampProof", () => {
  const SHA_A = "a".repeat(64);
  const SHA_B = "b".repeat(64);

  /** A row shaped exactly as `stampProof` leaves it, comment included. */
  const rowWith = (targets: string) =>
    [
      `      rows:`,
      `        # Este comentario existe para probar que la cirugía no lo pierde.`,
      `        - id: historial.tabla.1-0-0`,
      `          version: 1.0.0`,
      `          date: 2026-08-26`,
      `          delivered:`,
      targets,
      `          description: >-`,
      `            Primera entrega.`,
      ``,
    ].join("\n");

  const target = (name: string, commit: string, file: string, sha: string) =>
    [
      `            ${name}:`,
      `              commit: ${commit}`,
      `              files:`,
      `                ${file}: ${sha}`,
    ].join("\n");

  const oneTarget = rowWith(target("north", "9348ddb", "m-north-v1.0.0.pdf", SHA_A));
  const twoTargets = rowWith(
    [
      target("north", "9348ddb", "m-north-v1.0.0.pdf", SHA_A),
      // Its own commit, delivered later. That is the case the old shape could
      // not hold, and the reason this one is keyed by target all the way down.
      target("south", "274e66f", "m-south-v1.0.0.pdf", SHA_B),
    ].join("\n"),
  );

  it("names the files it took off, so the caller knows what to delete", () => {
    expect(unstampProof(oneTarget, "1.0.0", "north")?.files).toEqual(["m-north-v1.0.0.pdf"]);
  });

  it("removes the whole block when that was the last target", () => {
    const out = unstampProof(oneTarget, "1.0.0", "north");
    expect(out?.yaml).not.toContain("delivered:");
    expect(out?.yaml).not.toContain(SHA_A);
  });

  /**
   * The guarantee that matters. The other document went out and its bytes are
   * in the archive; erasing its proof to undo this one would destroy the only
   * record of a delivery nobody asked about.
   */
  it("leaves the OTHER target's proof untouched", () => {
    const out = unstampProof(twoTargets, "1.0.0", "south");
    expect(out?.files).toEqual(["m-south-v1.0.0.pdf"]);
    expect(out?.yaml).toContain("delivered:");
    expect(out?.yaml).toContain(`m-north-v1.0.0.pdf: ${SHA_A}`);
    expect(out?.yaml).toContain("commit: 9348ddb");
    expect(out?.yaml).not.toContain("commit: 274e66f");
    expect(out?.yaml).not.toContain(SHA_B);
    expect(out?.yaml).not.toMatch(/^\s+south:$/m);
  });

  it("keeps the row's own fields and its comments", () => {
    const out = unstampProof(oneTarget, "1.0.0", "north");
    expect(out?.yaml).toContain("version: 1.0.0");
    expect(out?.yaml).toContain("date: 2026-08-26");
    expect(out?.yaml).toContain("Primera entrega.");
    expect(out?.yaml).toContain("# Este comentario existe");
  });

  it("is null for a version no row declares", () => {
    expect(unstampProof(oneTarget, "9.9.9", "north")).toBeNull();
  });

  it("is null for a target that row never delivered", () => {
    expect(unstampProof(oneTarget, "1.0.0", "south")).toBeNull();
  });

  it("is null for a row with no proof at all", () => {
    const bare = [
      `      rows:`,
      `        - id: historial.tabla.1-0-0`,
      `          version: 1.0.0`,
      `          date: 2026-08-26`,
      `          description: Nada entregado.`,
      ``,
    ].join("\n");
    expect(unstampProof(bare, "1.0.0", "north")).toBeNull();
  });

  /**
   * Bounded to the row asked for. Scanning on would find the NEXT row's proof
   * and quietly undo a delivery nobody mentioned.
   */
  it("does not reach into the next row's proof", () => {
    const two = [
      `      rows:`,
      `        - id: historial.tabla.1-0-0`,
      `          version: 1.0.0`,
      `          date: 2026-08-26`,
      `          description: Sin entregar.`,
      `        - id: historial.tabla.1-1-0`,
      `          version: 1.1.0`,
      `          date: 2026-09-01`,
      `          delivered:`,
      target("north", "abc1234", "m-north-v1.1.0.pdf", SHA_A),
      `          description: Entregada.`,
      ``,
    ].join("\n");
    expect(unstampProof(two, "1.0.0", "north")).toBeNull();
    expect(unstampProof(two, "1.1.0", "north")?.files).toEqual(["m-north-v1.1.0.pdf"]);
  });

  /** Round trip: stamp, unstamp, and the file is what it was. */
  it("undoes exactly what stampProof did", () => {
    const bare = [
      `      rows:`,
      `        - id: historial.tabla.1-0-0`,
      `          version: 1.0.0`,
      `          date: 2026-08-26`,
      `          description: Primera entrega.`,
      ``,
    ].join("\n");
    const stamped = stampProof(bare, "1.0.0", {
      commit: "9348ddb",
      files: [{ axisValue: "north", path: "out/m-north-v1.0.0.pdf", sha: SHA_A }],
    });
    expect(stamped).not.toBeNull();
    expect(unstampProof(stamped as string, "1.0.0", "north")?.yaml).toBe(bare);
  });
});
