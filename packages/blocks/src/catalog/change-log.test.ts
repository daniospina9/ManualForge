import { describe, expect, it } from "vitest";
import { changeLog, changeLogProps, formatChangeLogDate } from "./change-log.ts";
import { catalog } from "./index.ts";

describe("change-log — the block the manual's own history lives in", () => {
  const minimal = {
    versionHeader: "Versión",
    dateHeader: "Fecha",
    descriptionHeader: "Descripción de cambios",
    rows: [
      { id: "cl.1", version: "0.0.1", date: "2026-08-26", description: "Primera entrega." },
    ],
  };

  it("is in the catalogue under its own type", () => {
    expect(catalog.get("change-log")).toBe(changeLog);
  });

  it("accepts the minimal table — three headers and one row", () => {
    expect(changeLogProps.parse(minimal)).toEqual(minimal);
  });

  /**
   * The reason this block exists rather than reusing `data-table`: nothing here
   * is quoted from the product, so the label checker must not be pointed at it.
   * A `labels` policy would have it hunting for the string `0.0.1` in the source
   * repository and reporting the delivery history as drifted.
   */
  it("declares NO label policy, because it quotes nothing from the product", () => {
    expect(changeLog.labels).toBeUndefined();
  });

  /** The one module in a manual that opens with no screenshot. */
  it("declares no images and no numbering", () => {
    expect(changeLog.images).toBeUndefined();
    expect(changeLog.numbering).toBeUndefined();
  });

  it("rejects a table with no rows — an empty history is an authoring mistake", () => {
    expect(() => changeLogProps.parse({ ...minimal, rows: [] })).toThrow();
  });

  it.each([
    ["28/02/2026", "the display format, written into the source by mistake"],
    ["2026-2-28", "unpadded month and day"],
    ["2026-02-28T00:00:00Z", "an instant rather than a date"],
    ["", "empty"],
  ])("rejects %s as a date — %s", (date) => {
    expect(() =>
      changeLogProps.parse({ ...minimal, rows: [{ ...minimal.rows[0], date }] }),
    ).toThrow();
  });

  /**
   * The case that made row-level conditioning non-negotiable: a version
   * delivered to one tenant and not another. `south` stops at 1.4.7 while `north`
   * receives 1.5.0, and one table has to say both.
   */
  it("carries a per-row selector, so one delivery can belong to one target only", () => {
    const parsed = changeLogProps.parse({
      ...minimal,
      rows: [
        minimal.rows[0],
        {
          id: "cl.2",
          version: "1.5.0",
          date: "2026-08-26",
          description: "Beacon of Things.",
          when: { tenant: ["north"] },
        },
      ],
    });
    expect(parsed.rows[1]?.when).toEqual({ tenant: ["north"] });
  });

  /**
   * The scalar shorthand `when: { tenant: north }` must be rejected here for the
   * reason `conditioning.ts` spells out: unvalidated it turns `Array#includes`
   * into `String#includes`, which substring-matches and leaks content across
   * targets.
   */
  it("rejects the scalar selector shorthand", () => {
    expect(() =>
      changeLogProps.parse({
        ...minimal,
        rows: [{ ...minimal.rows[0], when: { tenant: "north" } }],
      }),
    ).toThrow();
  });
});

describe("formatChangeLogDate", () => {
  it("renders ISO as the day-first form a Spanish manual prints", () => {
    expect(formatChangeLogDate("2026-02-28")).toBe("28/02/2026");
  });

  /**
   * The reason this is string surgery and not `Intl.DateTimeFormat`: a date
   * with no time in it, parsed as a Date, is midnight UTC — which is the day
   * before, anywhere west of Greenwich. A delivery date is a fact, not an
   * instant, and it must not move with the machine that builds the manual.
   */
  it("does not shift the day, whatever the host timezone is", () => {
    expect(formatChangeLogDate("2026-01-01")).toBe("01/01/2026");
    expect(formatChangeLogDate("2026-12-31")).toBe("31/12/2026");
  });
});

describe("delivery proof — the state is the evidence, not a flag", () => {
  const SHA = "f5eafb8dd59764899e79bbae5753f58a2b018e8780856102ed89fd7842b8a99a";
  const row = {
    id: "cl.1",
    version: "1.0.0",
    date: "2026-08-26",
    description: "Primera entrega.",
  };
  const props = (r: Record<string, unknown>) => ({
    versionHeader: "Versión",
    dateHeader: "Fecha",
    descriptionHeader: "Descripción de cambios",
    rows: [r],
  });

  /**
   * A row with no proof is a version declared but not handed over. That is the
   * normal state of every row in this repository right now, so it must parse.
   */
  it("accepts a row with no proof — declared, not yet delivered", () => {
    expect(() => changeLogProps.parse(props(row))).not.toThrow();
  });

  it("accepts a row carrying one commit and one hash per file, per target", () => {
    const parsed = changeLogProps.parse(
      props({
        ...row,
        delivered: {
          "agencia-propia": {
            commit: "a9f780e",
            files: { "m-ap.pdf": SHA, "m-ap.docx": SHA },
          },
          "todas-las-agencias": { commit: "cd40d46", files: { "m-tla.pdf": SHA } },
        },
      }),
    );
    expect(Object.keys(parsed.rows[0]?.delivered ?? {})).toHaveLength(2);
  });

  /**
   * The reason `commit` sits under each target rather than above them. A target
   * can be handed a version long after another one got it, and one row-level
   * commit could only ever have described one of the two — sending the other's
   * next summary to diff from a point it was never built at.
   */
  it("lets two targets of one version carry two different commits", () => {
    const parsed = changeLogProps.parse(
      props({
        ...row,
        delivered: {
          "agencia-propia": { commit: "274e66f", files: { "m-ap.pdf": SHA } },
          "todas-las-agencias": { commit: "9348ddb", files: { "m-tla.pdf": SHA } },
        },
      }),
    );
    expect(parsed.rows[0]?.delivered?.["agencia-propia"]?.commit).toBe("274e66f");
    expect(parsed.rows[0]?.delivered?.["todas-las-agencias"]?.commit).toBe("9348ddb");
  });

  /**
   * A truncated or mistyped hash proves nothing but looks like it does, which
   * is worse than an absent one — it would pass a glance and fail a comparison
   * years later, when nobody can tell whether the file or the record is wrong.
   */
  it.each([
    ["f5eafb8d", "truncated"],
    [`${SHA}00`, "too long"],
    [SHA.toUpperCase(), "upper case, so a comparison against a lower-case digest fails"],
    ["z".repeat(64), "right length, not hex"],
  ])("rejects %s as a hash — %s", (hash) => {
    expect(() =>
      changeLogProps.parse(
        props({ ...row, delivered: { commit: "a9f780e", files: { north: { "m.pdf": hash } } } }),
      ),
    ).toThrow();
  });

  it("rejects a proof with no files, which proves nothing", () => {
    expect(() =>
      changeLogProps.parse(props({ ...row, delivered: { commit: "a9f780e", files: {} } })),
    ).toThrow();
  });

  /** The anchor for "what changed since the last delivery". It has to be real. */
  it("rejects a commit that is not a git SHA", () => {
    expect(() =>
      changeLogProps.parse(props({ ...row, delivered: { commit: "HEAD", files: { north: { "m.pdf": SHA } } } })),
    ).toThrow();
  });
});
