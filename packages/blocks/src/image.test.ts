import { describe, expect, it } from "vitest";
import { declaredRef, imageRefSchema, slotFor, slotToPath } from "./image.ts";

/** The message zod produced for `value`, or `undefined` if it was accepted. */
const reject = (value: unknown): string | undefined => {
  const parsed = imageRefSchema.safeParse(value);
  return parsed.success ? undefined : parsed.error.issues[0]?.message;
};

describe("imageRefSchema", () => {
  it("accepts `true`, the derive-from-this-node's-id form", () => {
    expect(imageRefSchema.parse(true)).toBe(true);
  });

  it("accepts an explicit slot name", () => {
    expect(imageRefSchema.parse("barra.busqueda")).toBe("barra.busqueda");
  });

  it("accepts hyphens inside a segment", () => {
    expect(imageRefSchema.parse("interfaz-general.fig-home")).toBe("interfaz-general.fig-home");
  });

  it("accepts digits", () => {
    expect(imageRefSchema.parse("pmv.panel2")).toBe("pmv.panel2");
  });

  // The whole point of the slot indirection: a path in content cannot vary by
  // deployment and gives the delivering area no key to synchronise against.
  it("rejects a path, and says what to write instead", () => {
    const message = reject("icons/search.png");
    expect(message).toMatch(/file path/i);
    expect(message).toMatch(/_common/);
    expect(message).toMatch(/image: true/);
  });

  it("rejects a backslash path", () => {
    expect(reject("icons\\search.png")).toMatch(/file path/i);
  });

  it("rejects a bare filename — an extension is still naming a file", () => {
    const message = reject("home-overview.png");
    expect(message).toMatch(/extension/i);
    expect(message).toMatch(/home-overview/);
  });

  it("rejects every image extension we might be handed, in any case", () => {
    for (const name of ["a.PNG", "a.jpg", "a.jpeg", "a.svg", "a.webp", "a.gif"]) {
      expect(reject(name), name).toMatch(/extension/i);
    }
  });

  it("rejects uppercase, so one slot cannot become two files on a case-insensitive disk", () => {
    expect(reject("Barra.Busqueda")).toMatch(/lowercase/i);
  });

  it("rejects spaces", () => {
    expect(reject("barra busqueda")).toBeDefined();
  });

  it("rejects an empty, dangling or doubled separator", () => {
    for (const name of ["", ".", "barra.", ".barra", "barra..busqueda", "-barra", "barra-"]) {
      expect(reject(name), JSON.stringify(name)).toBeDefined();
    }
  });

  // Not a third state alongside "declared" and "omitted": under the `always`
  // policy, omitting the prop still declares a slot — that is what makes a
  // module writable before a single capture exists. `false` is how an author
  // says this particular place needs no image at all.
  it("accepts `false`, the opt-out for a place no image explains", () => {
    expect(imageRefSchema.parse(false)).toBe(false);
  });

  it("rejects a number", () => {
    expect(reject(3)).toBeDefined();
  });
});

describe("declaredRef", () => {
  const always = { prop: "image", policy: "always" } as const;
  const optional = { prop: "image", policy: "optional" } as const;

  it("takes what the author wrote", () => {
    expect(declaredRef({ image: "barra.busqueda" }, always)).toBe("barra.busqueda");
  });

  it("assumes an image under `always`, so a module is writable before a capture exists", () => {
    expect(declaredRef({}, always)).toBe(true);
  });

  it("assumes nothing under `optional`", () => {
    expect(declaredRef({}, optional)).toBeUndefined();
  });

  // The escape hatch `always` otherwise lacks. Some steps are a button press
  // that no screenshot explains, and without this the slot exists forever: the
  // manual shows a placeholder, and the manifest asks a capture team for a file
  // nobody will ever take.
  it("reads `false` as no image, even where the policy is `always`", () => {
    expect(declaredRef({ image: false }, always)).toBeUndefined();
  });

  it("reads `false` as no image under `optional` too", () => {
    expect(declaredRef({ image: false }, optional)).toBeUndefined();
  });
});

describe("slotFor", () => {
  it("derives the slot from the node id when the author wrote `true`", () => {
    expect(slotFor(true, "barra.busqueda")).toBe("barra.busqueda");
  });

  it("keeps an explicit slot, so two places can share one delivered image", () => {
    expect(slotFor("compartido.buscar", "barra.busqueda")).toBe("compartido.buscar");
  });

  // A node id is only required to be non-empty by the loader, so deriving a
  // slot from it can produce a name no file could ever match. Fail loudly at
  // build time rather than emit a manifest entry nobody can deliver against.
  it("refuses to derive a slot from a node id that is not a valid slot name", () => {
    expect(() => slotFor(true, "Barra Superior")).toThrow(/Barra Superior/);
    expect(() => slotFor(true, "Barra Superior")).toThrow(/slot/i);
  });
});

describe("slotToPath", () => {
  it("turns dots into folders so the tree mirrors the manual", () => {
    expect(slotToPath("barra.filtro.fig")).toBe("barra/filtro/fig");
  });

  it("leaves a single-segment slot alone", () => {
    expect(slotToPath("dashboard")).toBe("dashboard");
  });
});
