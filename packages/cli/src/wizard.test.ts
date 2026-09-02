import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  assembleContinuationPrompt,
  assemblePrompt,
  describeState,
  findExecutable,
  isShellSafePath,
  knownTenants,
  readManualStates,
  themeUsage,
  launchPlan,
  normaliseSourcePath,
  readRegistrySources,
  validateManualId,
  type ManualState,
  type WizardAnswers,
  assembleDeliveryPrompt,
  assembleUpdatePrompt,
  readDeliverableDocs,
  readBuildableManuals,
  BUILD_KINDS,
} from "./wizard.ts";

const answers = (over: Partial<WizardAnswers> = {}): WizardAnswers => ({
  sourcePath: "../atlasInternational",
  sourceId: null,
  manualId: "atlas-international",
  scope: "spike",
  target: null,
  design: { kind: "existing", theme: "atlas" },
  ...over,
});

/** A throwaway repo root, so nothing here reads the real one. */
function repo(): string {
  const root = mkdtempSync(join(tmpdir(), "wizard-"));
  mkdirSync(join(root, "sources"), { recursive: true });
  mkdirSync(join(root, "manuals"), { recursive: true });
  return root;
}

describe("findExecutable", () => {
  const probe = (present: readonly string[], pathext?: string) => ({
    path: ["/bin", "/opt/tools"].join(":"),
    pathext,
    delimiter: ":",
    exists: (c: string) => present.includes(c.split("\\").join("/")),
  });

  it("finds a bare executable on PATH", () => {
    expect(findExecutable("claude", probe(["/opt/tools/claude"]))).toMatch(/claude$/);
  });

  it("searches PATH in order, so the first hit wins", () => {
    const found = findExecutable("claude", probe(["/bin/claude", "/opt/tools/claude"]));
    expect(found).toMatch(/^[/\\]bin/);
  });

  it("finds a Windows .cmd shim through PATHEXT — which is what decides the launch", () => {
    const found = findExecutable("claude", probe(["/opt/tools/claude.cmd"], ".COM;.EXE;.CMD"));
    expect(found).toMatch(/claude\.cmd$/);
  });

  it("prefers the .cmd over the bare name when BOTH exist, as npm installs them", () => {
    // The bare `claude` an npm global install drops beside `claude.cmd` is a shell
    // script. Picking it on Windows means spawn fails with ENOEXEC after the
    // wizard has already said it was starting.
    const found = findExecutable(
      "claude",
      probe(["/opt/tools/claude", "/opt/tools/claude.cmd"], ".COM;.EXE;.CMD"),
    );
    expect(found).toMatch(/claude\.cmd$/);
  });

  it("uses the bare name where PATHEXT is unset, which is POSIX", () => {
    expect(findExecutable("claude", probe(["/opt/tools/claude"]))).toMatch(/claude$/);
  });

  it("is null when nothing matches, rather than guessing a path", () => {
    expect(findExecutable("claude", probe([]))).toBeNull();
  });

  it("survives an empty PATH", () => {
    expect(
      findExecutable("claude", { path: undefined, pathext: undefined, delimiter: ":", exists: () => true }),
    ).toBeNull();
  });
});

describe("launchPlan", () => {
  it("passes only a filename, never the prompt text", () => {
    const plan = launchPlan("/usr/bin/claude", ".manualforge/new-x.md");
    expect(plan.args).toEqual([
      "Lee el archivo .manualforge/new-x.md y aplica sus instrucciones.",
    ]);
    expect(plan.shell).toBe(false);
  });

  it("uses a shell only for a .cmd shim, and pre-quotes the argument for it", () => {
    const plan = launchPlan("C:\\npm\\claude.cmd", ".manualforge/new-x.md");
    expect(plan.shell).toBe(true);
    expect(plan.args).toEqual([
      '"Lee el archivo .manualforge/new-x.md y aplica sus instrucciones."',
    ]);
  });

  // The one string in the CLI that crosses a shell boundary. `cmd.exe` does not
  // default to a UTF-8 codepage, so an accent here can reach the agent mojibaked.
  it("keeps the sentence ASCII, because a .cmd shim goes through cmd.exe", () => {
    const plan = launchPlan("C:\\npm\\claude.cmd", ".manualforge/new-x.md");
    expect(plan.args[0]).toMatch(/^[\x20-\x7E]+$/);
  });

  it("treats .bat the same as .cmd", () => {
    expect(launchPlan("C:\\npm\\claude.BAT", "x.md").shell).toBe(true);
  });
});

describe("isShellSafePath", () => {
  it("accepts the names this tool generates", () => {
    expect(isShellSafePath(".manualforge/new-beacon-manual.md")).toBe(true);
  });

  it.each([" ", '"', "'", "&", "|", "$", "`", ";", "(", ">"])(
    "rejects a path containing %s",
    (ch) => {
      expect(isShellSafePath(`.manualforge/new${ch}x.md`)).toBe(false);
    },
  );
});

describe("normaliseSourcePath", () => {
  /** A repo root with a sibling product beside it, as the real layout has. */
  function siblings(): { root: string; product: string } {
    const parent = mkdtempSync(join(tmpdir(), "wizard-"));
    const root = join(parent, "TheManualRepo");
    const product = join(parent, "the-product");
    mkdirSync(join(root, "sources"), { recursive: true });
    mkdirSync(product, { recursive: true });
    return { root, product };
  }

  it("accepts an ABSOLUTE path and returns it relative to the repository root", () => {
    const { root, product } = siblings();
    expect(normaliseSourcePath(product, root)).toEqual({ path: "../the-product" });
  });

  it("accepts a relative path unchanged in meaning", () => {
    const { root } = siblings();
    expect(normaliseSourcePath("../the-product", root)).toEqual({ path: "../the-product" });
  });

  it("emits forward slashes, so a Windows answer produces a POSIX registry entry", () => {
    const { root, product } = siblings();
    const result = normaliseSourcePath(product, root);
    expect("path" in result && result.path.includes("\\")).toBe(false);
  });

  it("strips quotes, because a pasted path with spaces usually arrives wrapped", () => {
    const { root, product } = siblings();
    expect(normaliseSourcePath(`"${product}"`, root)).toEqual({ path: "../the-product" });
  });

  it("reports the resolved path when nothing is there", () => {
    const { root } = siblings();
    const result = normaliseSourcePath("../nope", root);
    expect("problem" in result && result.problem).toMatch(/^no hay nada en .*nope$/);
  });

  it("rejects a file", () => {
    const { root } = siblings();
    writeFileSync(join(root, "sources", "registry.yaml"), "version: 1\n");
    expect(normaliseSourcePath("sources/registry.yaml", root)).toEqual({
      problem: "eso es un archivo, no un repositorio",
    });
  });

  it("rejects the manual repository itself", () => {
    const { root } = siblings();
    expect(normaliseSourcePath(root, root)).toEqual({
      problem: "eso es este repositorio, no un producto fuente",
    });
  });

  it("requires an answer", () => {
    expect(normaliseSourcePath("   ", siblings().root)).toEqual({ problem: "hace falta una ruta" });
  });
});

describe("validateManualId", () => {
  it("accepts a lowercase hyphenated id", () => {
    expect(validateManualId("beacon-primera-entrega", repo())).toBeNull();
  });

  it.each(["Beacon", "con_guion_bajo", "-leading", "trailing-", "doble--guion", "con espacio"])(
    "rejects %s, because the id becomes a folder name",
    (id) => {
      expect(validateManualId(id, repo())).toMatch(/nombre de una carpeta/);
    },
  );

  it("rejects an id whose folder already exists, rather than writing into it", () => {
    const root = repo();
    mkdirSync(join(root, "manuals", "taken"));
    expect(validateManualId("taken", root)).toBe("manuals/taken/ ya existe");
  });
});

describe("readRegistrySources", () => {
  it("is empty when there is no registry, instead of throwing", () => {
    expect(readRegistrySources(mkdtempSync(join(tmpdir(), "wizard-")))).toEqual([]);
  });

  it("reads each source's id, name and path", () => {
    const root = repo();
    writeFileSync(
      join(root, "sources", "registry.yaml"),
      `version: 1\nsources:\n  alfa:\n    name: Alfa Product\n    path: ../alfa\n`,
    );
    expect(readRegistrySources(root)).toEqual([{ id: "alfa", name: "Alfa Product", path: "../alfa" }]);
  });
});

describe("knownTenants", () => {
  const withManual = (root: string, id: string, source: string, tenants: string[]) => {
    mkdirSync(join(root, "manuals", id, "knowledge"), { recursive: true });
    writeFileSync(join(root, "manuals", id, "manual.config.yaml"), `manual:\n  source: ${source}\n`);
    writeFileSync(
      join(root, "manuals", id, "knowledge", "module-map.json"),
      JSON.stringify({ tenants: tenants.map((t) => ({ id: t })) }),
    );
  };

  it("takes the deployments from a map already extracted for that source", () => {
    const root = repo();
    withManual(root, "uno", "alfa", ["north", "south"]);
    expect(knownTenants(root, "alfa")).toEqual(["north", "south"]);
  });

  // The map now names its axis and carries the values under `values`. Reading
  // only the old key would return an empty list for every regenerated map — and
  // an empty list is a legitimate answer here, so the regression would look
  // exactly like the honest one.
  it("reads a map that names its axis", () => {
    const root = repo();
    mkdirSync(join(root, "manuals", "uno", "knowledge"), { recursive: true });
    writeFileSync(join(root, "manuals", "uno", "manual.config.yaml"), "manual:\n  source: alfa\n");
    writeFileSync(
      join(root, "manuals", "uno", "knowledge", "module-map.json"),
      JSON.stringify({ axis: "tenant", values: [{ id: "north" }, { id: "south" }] }),
    );
    expect(knownTenants(root, "alfa")).toEqual(["north", "south"]);
  });

  it("is empty for an unmapped source — the tenant list is a finding, not a guess", () => {
    const root = repo();
    withManual(root, "uno", "alfa", ["north"]);
    expect(knownTenants(root, "beta")).toEqual([]);
  });

  it("ignores a manual that has a config but no map yet", () => {
    const root = repo();
    mkdirSync(join(root, "manuals", "sinmapa"), { recursive: true });
    writeFileSync(join(root, "manuals", "sinmapa", "manual.config.yaml"), `manual:\n  source: alfa\n`);
    expect(knownTenants(root, "alfa")).toEqual([]);
  });
});

describe("assemblePrompt", () => {
  it("carries the answers only the human could supply", () => {
    const text = assemblePrompt(answers());
    expect(text).toContain("../atlasInternational");
    expect(text).toContain("atlas-international");
    expect(text).toContain("Spike de pipeline");
  });

  // The prompt POINTS at the documentation instead of restating it. These are
  // the load-bearing tests of that decision: `manuals/AGENTS.md` says a rule
  // stated twice is a rule that drifts, and a Spanish restatement of an English
  // rule would drift invisibly — the divergence would not even be greppable.
  describe("does not restate what an AGENTS.md already owns", () => {
    const text = assemblePrompt(answers());

    it.each([
      ["the six onboarding steps", "Reportá todo esto antes de tocar sources/"],
      ["the extractor-fit verdicts", '"fits partly"'],
      ["how tenancy resolves", "cómo se resuelve la tenancy"],
      ["which steps are not optional", "Los pasos 1, 2 y"],
      ["why a copied registry entry is wrong", "confiadamente equivocado"],
      ["the per-language breakdown", "las claves de config y props de bloque"],
      ["the image ordering rule", "Las imágenes van al final"],
      ["the four invariants", "El AST es el contrato"],
      ["the nesting rule itself", "el más cercano manda"],
    ])("leaves %s to the documentation", (_what, restated) => {
      expect(text).not.toContain(restated);
    });

    it("names the document that owns the onboarding steps", () => {
      expect(text).toContain("sources/AGENTS.md");
    });

    it("names the document that owns the authoring rules", () => {
      expect(text).toContain("manuals/AGENTS.md");
    });

    // The root file is the one that says nested AGENTS.md files exist and which
    // one wins. Skip it and the agent never learns to look for the others — it
    // only ever reads the ones a prompt line happened to name by hand.
    it("opens at the root AGENTS.md, the only file that indexes the rest", () => {
      expect(text).toContain("AGENTS.md en la raíz");
    });
  });

  describe("for a product not in the registry", () => {
    const text = assemblePrompt(answers());

    it("sends it to the start of the onboarding path", () => {
      expect(text).toContain('"Adding a source" en sources/AGENTS.md desde el paso 1');
    });

    it("stops the agent after the report rather than letting it continue", () => {
      expect(text).toContain("detenete ahí y esperá");
    });

    it("says the spike target is decided later, because the tenants are unknown", () => {
      expect(text).toContain("se decide después del paso 6");
    });
  });

  describe("for a product already in the registry", () => {
    const text = assemblePrompt(answers({ sourceId: "alfa", target: "north" }));

    it("skips the survey and protects the existing entry", () => {
      expect(text).toContain("no la edites ni lo relevés de nuevo");
      expect(text).toContain("paso 4");
    });

    it("says the map is per manual, so a second manual extracts again", () => {
      expect(text).toContain("por MANUAL");
    });

    it("names the chosen spike target", () => {
      expect(text).toContain("Target del spike   north");
    });

    it("does not send it back to step 1", () => {
      expect(text).not.toContain("desde el paso 1");
    });
  });

  it.each([
    ["spike", "UNA sección"],
    ["module", "module-completeness"],
    ["full", "todas las secciones"],
  ] as const)("gives %s its own instruction", (scope, expected) => {
    expect(assemblePrompt(answers({ scope }))).toContain(expected);
  });

  describe("reusing an existing theme", () => {
    const text = assemblePrompt(answers({ design: { kind: "existing", theme: "beacon" } }));

    it("declares the theme and forbids editing it", () => {
      expect(text).toContain("manual.theme: beacon");
      expect(text).toContain("no lo edites");
    });

    it("asks for no proposal", () => {
      expect(text).not.toContain("identidad visual propia");
    });
  });

  describe("a new design", () => {
    const text = assemblePrompt(answers({ design: { kind: "new" } }));

    it("puts the proposal before the survey and waits for a decision", () => {
      expect(text).toContain("Proponela ANTES de relevar");
      expect(text).toContain("esperá una decisión");
      // Positional, not textual: the instruction has to physically precede the
      // onboarding path, which is the whole point of it.
      expect(text.indexOf("identidad visual propia")).toBeLessThan(
        text.indexOf("Adding a source"),
      );
    });

    it("names the product as where the design comes from", () => {
      expect(text).toContain("../atlasInternational");
    });

    it("points at the document that owns where a colour may come from", () => {
      expect(text).toContain("packages/tokens/AGENTS.md");
    });
  });

  // No AGENTS.md can anticipate this, because the prompt itself creates the
  // risk: a Spanish request invites the agent to mirror Spanish into comments.
  it("warns against mirroring its own language into the code", () => {
    const text = assemblePrompt(answers());
    expect(text).toContain("no espejes el");
    expect(text).toContain("idioma de este texto en el código");
  });
});

describe("themeUsage", () => {
  const withManual = (root: string, id: string, theme?: string) => {
    mkdirSync(join(root, "manuals", id), { recursive: true });
    writeFileSync(
      join(root, "manuals", id, "manual.config.yaml"),
      theme === undefined ? `manual:\n  id: ${id}\n` : `manual:\n  id: ${id}\n  theme: ${theme}\n`,
    );
  };

  it("counts an omitted theme as atlas, because that is what the build falls back to", () => {
    const root = repo();
    withManual(root, "sin-tema");
    expect(themeUsage(root, ["atlas", "beacon"]).get("atlas")).toEqual(["sin-tema"]);
  });

  it("groups manuals by the theme they declare", () => {
    const root = repo();
    withManual(root, "uno", "beacon");
    withManual(root, "dos", "beacon");
    // Sorted in the assertion: the order is whatever readdir gives, and nothing
    // downstream depends on it.
    expect(themeUsage(root, ["atlas", "beacon"]).get("beacon")?.sort()).toEqual(["dos", "uno"]);
  });

  it("lists a theme nothing uses yet, rather than hiding it", () => {
    expect(themeUsage(repo(), ["atlas", "nuevo"]).get("nuevo")).toEqual([]);
  });
});

describe("readManualStates", () => {
  /** A manual on disk, in whatever half-finished state the test needs. */
  function withManual(
    root: string,
    id: string,
    opts: {
      source?: string;
      title?: string;
      sections?: string[];
      map?: boolean;
      images?: { pending: number; total: number };
      state?: boolean;
    } = {},
  ): void {
    const dir = join(root, "manuals", id);
    mkdirSync(dir, { recursive: true });
    const source = opts.source === undefined ? "" : `  source: ${opts.source}\n`;
    writeFileSync(
      join(dir, "manual.config.yaml"),
      `manual:\n  id: ${id}\n  title: ${opts.title ?? id}\n${source}`,
    );
    if (opts.sections) {
      mkdirSync(join(dir, "sections"), { recursive: true });
      for (const s of opts.sections) writeFileSync(join(dir, "sections", s), "id: x\n");
    }
    if (opts.map) {
      mkdirSync(join(dir, "knowledge"), { recursive: true });
      writeFileSync(join(dir, "knowledge", "module-map.json"), JSON.stringify({ tenants: [] }));
    }
    if (opts.images) {
      writeFileSync(
        join(dir, "image-requests.json"),
        JSON.stringify({ counts: { ...opts.images, delivered: opts.images.total - opts.images.pending } }),
      );
    }
    if (opts.state) writeFileSync(join(dir, "ESTADO.md"), "# Estado\n");
  }

  it("is empty when nothing has been started, instead of throwing", () => {
    expect(readManualStates(mkdtempSync(join(tmpdir(), "wizard-")))).toEqual([]);
  });

  it("ignores a directory that carries no manual.config.yaml", () => {
    const root = repo();
    mkdirSync(join(root, "manuals", "no-es-un-manual"), { recursive: true });
    expect(readManualStates(root)).toEqual([]);
  });

  it("derives every signal from disk rather than from a written log", () => {
    const root = repo();
    withManual(root, "maduro", {
      source: "alfa",
      title: "Manual maduro",
      sections: ["04-a.yaml", "05-b.yaml"],
      map: true,
      images: { pending: 3, total: 10 },
      state: true,
    });
    expect(readManualStates(root)).toEqual<ManualState[]>([
      {
        id: "maduro",
        title: "Manual maduro",
        source: "alfa",
        hasMap: true,
        sections: 2,
        pending: 3,
        totalImages: 10,
        hasState: true,
      },
    ]);
  });

  it("reports a missing source as null — it is what blocks extraction", () => {
    const root = repo();
    withManual(root, "huerfano", { sections: ["04-a.yaml"] });
    const [s] = readManualStates(root);
    expect(s?.source).toBeNull();
    expect(s?.hasMap).toBe(false);
  });

  it("reports pending as null when no requests have been exported yet", () => {
    const root = repo();
    withManual(root, "recien", { source: "alfa" });
    // Null, not zero: nothing exported is NOT the same as nothing pending, and
    // conflating them would report a manual with no images as finished.
    expect(readManualStates(root)[0]?.pending).toBeNull();
  });

  it("counts only .yaml sections, so a stray file is not progress", () => {
    const root = repo();
    withManual(root, "m", { source: "alfa", sections: ["04-a.yaml", "notas.md", "05-b.yaml"] });
    expect(readManualStates(root)[0]?.sections).toBe(2);
  });

  it("lists manuals in a stable order, so the picker does not shuffle", () => {
    const root = repo();
    withManual(root, "zeta", { source: "a" });
    withManual(root, "alfa", { source: "a" });
    expect(readManualStates(root).map((s) => s.id)).toEqual(["alfa", "zeta"]);
  });
});

describe("describeState", () => {
  const state = (over: Partial<ManualState> = {}): ManualState => ({
    id: "m",
    title: "M",
    source: "alfa",
    hasMap: true,
    sections: 4,
    pending: 2,
    totalImages: 10,
    hasState: true,
    ...over,
  });

  it("shouts about the two states that block the work", () => {
    expect(describeState(state({ source: null }))).toContain("SIN fuente declarada");
    expect(describeState(state({ hasMap: false }))).toContain("SIN mapa");
  });

  it("says images are complete rather than printing a zero", () => {
    expect(describeState(state({ pending: 0 }))).toContain("imágenes completas");
  });

  it("omits the image count entirely when nothing was exported", () => {
    expect(describeState(state({ pending: null }))).not.toContain("imagen");
  });

  it("reports whether decisions were ever written down", () => {
    expect(describeState(state({ hasState: false }))).toContain("sin ESTADO.md");
    expect(describeState(state({ hasState: true }))).toContain("con ESTADO.md");
  });
});

describe("assembleContinuationPrompt", () => {
  const state = (over: Partial<ManualState> = {}): ManualState => ({
    id: "atlas",
    title: "Manual de operador",
    source: "atlas",
    hasMap: true,
    sections: 9,
    pending: 16,
    totalImages: 240,
    hasState: true,
    ...over,
  });

  describe("a manual that is ready to continue", () => {
    const text = assembleContinuationPrompt(state());

    it("carries the derived state, so the agent is not guessing at it", () => {
      expect(text).toContain("Secciones escritas 9");
      expect(text).toContain("16 pendiente(s) de 240");
    });

    it("does not open a blocking gate when nothing is blocking", () => {
      expect(text).not.toContain("Antes de escribir una palabra");
    });

    it("ranks the two sources of truth, and the disk wins", () => {
      expect(text).toContain("Derivá el PROGRESO del disco");
      expect(text).toContain("gana el");
    });

    it("names the four places progress is actually readable from", () => {
      for (const place of ["sections/", "module-map.json", "image-requests.json", "git log"]) {
        expect(text).toContain(place);
      }
    });

    it("forbids rewriting work that already exists", () => {
      expect(text).toContain("No reescribas una sección que ya existe");
    });

    // The map emits tenants, capabilities and references — never a module list.
    // Nothing else declares one, so "finish the manual" has no denominator.
    it("forbids inventing the total scope, because nothing declares one", () => {
      expect(text).toContain("no inventes el inventario total de módulos");
      expect(text).toContain("pedí aprobación");
    });

    it("proposes and waits rather than starting to write", () => {
      expect(text).toContain("ESPERÁ una");
    });

    it("closes by asking for the decisions to be recorded", () => {
      expect(text).toContain("manuals/atlas/ESTADO.md");
    });

    it("leaves the state file's contract to the documentation that owns it", () => {
      // The rule lives in manuals/AGENTS.md. Restating the four bullet points
      // here is what would drift the moment that file is edited.
      expect(text).not.toContain("Registrá SOLO decisiones");
      expect(text).toContain("manuals/AGENTS.md");
    });

    it("opens at the root AGENTS.md, exactly as the creation prompt does", () => {
      expect(text).toContain("AGENTS.md en la raíz");
    });
  });

  describe("a manual with no declared source", () => {
    const text = assembleContinuationPrompt(state({ source: null, hasMap: false }));

    it("gates the work before any content, and says extraction cannot run", () => {
      expect(text).toContain("Antes de escribir una palabra");
      expect(text).toContain("no declara `manual.source`");
      expect(text).toContain("`extract` no puede ni correr");
    });

    it("puts the gate ahead of everything else, which is the point of a gate", () => {
      expect(text.indexOf("Antes de escribir una palabra")).toBeLessThan(
        text.indexOf("Dónde quedó"),
      );
    });

    it("refuses to let content paper over the problem", () => {
      expect(text).toContain("No escribas secciones para tapar esto");
    });
  });

  describe("a manual with a source but no map", () => {
    const text = assembleContinuationPrompt(state({ hasMap: false }));

    it("asks for extract by name", () => {
      expect(text).toContain("extract atlas");
    });

    it("does not complain about a source that is declared", () => {
      expect(text).not.toContain("no declara `manual.source`");
    });

    // `extract` refuses outright for a product whose tenancy is not in its own
    // repository, and there is no map to wait for until somebody writes an
    // extractor for it. A prompt that only says "run extract" sends the agent
    // back to a command that cannot succeed, with nothing to do about it.
    it("names the refusal as an answer, so the agent reports it instead of retrying", () => {
      expect(text).toContain("se niega");
    });
  });

  describe("a manual that never recorded its decisions", () => {
    const text = assembleContinuationPrompt(state({ hasState: false }));

    it("says the file is missing rather than pointing at nothing", () => {
      expect(text).toContain("Estado registrado  NO existe todavía");
    });

    it("asks for it to be created, and points at its contract", () => {
      expect(text).toContain("crealo cuando pares");
      expect(text).toContain("manuals/AGENTS.md");
    });
  });

  it("reports images honestly when none have been exported", () => {
    const text = assembleContinuationPrompt(state({ pending: null, totalImages: null }));
    expect(text).toContain("todavía no se exportaron pedidos");
  });
});

describe("the creation prompt hands off to the continuation prompt", () => {
  // The two flows meet at one file. If the creation prompt stops asking for it,
  // every later session starts blind — so this is asserted from both ends.
  it("asks the creation run to keep the same file up to date", () => {
    const text = assemblePrompt(answers());
    expect(text).toContain("manuals/atlas-international/ESTADO.md");
  });

  it("points both flows at one contract rather than carrying two copies", () => {
    for (const text of [
      assemblePrompt(answers()),
      assembleContinuationPrompt({
        id: "m",
        title: "M",
        source: "alfa",
        hasMap: true,
        sections: 1,
        pending: 0,
        totalImages: 1,
        hasState: true,
      }),
    ]) {
      expect(text).toContain("manuals/AGENTS.md");
    }
  });
});

describe("assembleDeliveryPrompt", () => {
  const beacon = { axis: "permission", value: "todas-las-agencias" };

  it("anchors a later delivery on the previous one's commit", () => {
    const p = assembleDeliveryPrompt(
      "beacon-manual",
      "summarise-since",
      "1.1.0",
      "8a0ab58",
      beacon,
    );
    expect(p).toContain("git log 8a0ab58..HEAD");
    expect(p).toContain("delivery-summary");
  });

  /**
   * A first delivery has nothing to diff against, so asking for "what changed"
   * would invite an answer invented to fit the question.
   */
  it("asks a first delivery to describe what the manual covers, not what changed", () => {
    const p = assembleDeliveryPrompt("beacon-manual", "summarise-first", "1.0.0", null, beacon);
    expect(p).toContain("CUBRE");
    expect(p).not.toContain("git log");
  });

  /**
   * The version on the cover is read from the highest change-log row, so a row
   * written after the build would ship a PDF whose own history is blank.
   */
  it("puts the row and its commit BEFORE the build", () => {
    const p = assembleDeliveryPrompt("m", "summarise-first", "1.0.0", null, beacon);
    const row = p.indexOf("Escribí la fila");
    const commit = p.indexOf("Commiteá esa fila");
    const deliver = p.indexOf("deliver m");
    expect(row).toBeGreaterThan(-1);
    expect(commit).toBeGreaterThan(row);
    expect(deliver).toBeGreaterThan(commit);
  });

  /**
   * `deliver` commits its own stamp. A prompt still asking for a fourth step
   * would have the agent commit nothing, look for a change that is not there,
   * and start improvising — which is how an agent ends up committing something
   * else.
   */
  it("stops at three steps, because the stamp commits itself", () => {
    const p = assembleDeliveryPrompt("m", "summarise-first", "1.0.0", null, beacon);
    expect(p).toContain("Tres pasos");
    expect(p).toContain("COMMITEA EL SELLO");
    expect(p).not.toMatch(/^4\./m);
  });

  it("names the exact target, so the agent cannot deliver the other document", () => {
    const p = assembleDeliveryPrompt("atlas", "summarise-first", "1.6.0", null, {
      axis: "tenant",
      value: "north",
    });
    expect(p).toContain("--axis tenant=north");
    expect(p).not.toContain("tenant=south");
  });

  /**
   * The owner already confirmed the delivery in the wizard, with this version
   * and this document. An agent that asks again is asking them to authorise the
   * same irreversible act twice, which teaches them to wave it through.
   */
  it("says the authorisation was already given", () => {
    const p = assembleDeliveryPrompt("m", "summarise-first", "1.0.0", null, beacon);
    expect(p).toContain("ya autorizó");
  });

  it("tells the agent to stop rather than push through a refusal", () => {
    const p = assembleDeliveryPrompt("m", "summarise-since", "1.1.0", "abc1234", beacon);
    expect(p).toContain("PARÁ");
  });
});

describe("readDeliverableDocs", () => {
  /** A manual with an axis, targets, a change log, and whatever is in output/. */
  const withManual = (
    root: string,
    id: string,
    opts: {
      readonly axis: string;
      readonly values: readonly { id: string; name: string }[];
      readonly rows: string;
      readonly built?: readonly string[];
    },
  ) => {
    mkdirSync(join(root, "manuals", id, "sections"), { recursive: true });
    writeFileSync(
      join(root, "manuals", id, "manual.config.yaml"),
      [
        `manual:`,
        `  title: Manual de ${id}`,
        `axes:`,
        `  ${opts.axis}:`,
        `    values:`,
        ...opts.values.map((v) => `      - id: ${v.id}\n        name: ${v.name}`),
        `targets:`,
        ...opts.values.map((v) => `  - ${opts.axis}: ${v.id}`),
        `output:`,
        `  dir: output`,
        `  filename: "manual-{${opts.axis}}-v{contentVersion}.pdf"`,
        ``,
      ].join("\n"),
    );
    writeFileSync(
      join(root, "manuals", id, "sections", "99-historial.yaml"),
      [`blocks:`, `  - id: log`, `    type: change-log`, `    props:`, `      rows:`, opts.rows, ``].join(
        "\n",
      ),
    );
    if (opts.built !== undefined) {
      mkdirSync(join(root, "manuals", id, "output"), { recursive: true });
      for (const f of opts.built) writeFileSync(join(root, "manuals", id, "output", f), "");
    }
  };

  it("offers one document per target, not one per manual", () => {
    const root = repo();
    withManual(root, "uno", {
      axis: "tenant",
      values: [
        { id: "north", name: "Movilidad" },
        { id: "south", name: "Medellín" },
      ],
      rows: `        - id: r1\n          version: 1.0.0`,
    });
    const { docs } = readDeliverableDocs(root);
    expect(docs.map((d) => `${d.manualId}:${d.axisValue}`)).toEqual(["uno:north", "uno:south"]);
  });

  /**
   * atlas's real shape. `north` was handed a module `south` never received,
   * so their tables genuinely differ — and a picker showing `south` the version it
   * never got would be offering to archive the wrong document under it.
   */
  it("narrows each document's history by the rows' own selectors", () => {
    const root = repo();
    withManual(root, "dos", {
      axis: "tenant",
      values: [
        { id: "north", name: "Movilidad" },
        { id: "south", name: "Medellín" },
      ],
      rows: [
        `        - id: r1`,
        `          version: 1.0.0`,
        `        - id: r2`,
        `          version: 1.1.0`,
        `          when:`,
        `            tenant: [north]`,
      ].join("\n"),
    });
    const { docs } = readDeliverableDocs(root);
    const north = docs.find((d) => d.axisValue === "north");
    const south = docs.find((d) => d.axisValue === "south");
    expect(north?.printing).toBe("1.1.0");
    expect(south?.printing).toBe("1.0.0");
    expect(south?.rows).toHaveLength(1);
  });

  it("reports each target's own newest working build", () => {
    const root = repo();
    withManual(root, "tres", {
      axis: "tenant",
      values: [
        { id: "north", name: "Movilidad" },
        { id: "south", name: "Medellín" },
      ],
      rows: `        - id: r1\n          version: 1.0.0`,
      built: ["manual-north-trabajo-09.pdf", "manual-south-trabajo-08.pdf"],
    });
    const { docs } = readDeliverableDocs(root);
    expect(docs.find((d) => d.axisValue === "north")?.work).toBe(9);
    expect(docs.find((d) => d.axisValue === "south")?.work).toBe(8);
  });

  it("reports nothing built rather than guessing a number", () => {
    const root = repo();
    withManual(root, "cuatro", {
      axis: "tenant",
      values: [{ id: "north", name: "Movilidad" }],
      rows: `        - id: r1\n          version: 1.0.0`,
    });
    expect(readDeliverableDocs(root).docs[0]?.work).toBeNull();
  });

  /**
   * A manual missing from the list without explanation reads as a bug, and the
   * operator's next move is to go looking for one.
   */
  it("says why a manual with no change log was left out", () => {
    const root = repo();
    mkdirSync(join(root, "manuals", "sin-log"), { recursive: true });
    writeFileSync(
      join(root, "manuals", "sin-log", "manual.config.yaml"),
      `manual:\n  title: Catálogo\naxes:\n  tenant:\n    values:\n      - id: north\n        name: NORTH\ntargets:\n  - tenant: north\n`,
    );
    const { docs, skipped } = readDeliverableDocs(root);
    expect(docs).toEqual([]);
    expect(skipped).toEqual([{ id: "sin-log", why: "no tiene Historial de cambios" }]);
  });

  it("says why a manual without a single axis was left out", () => {
    const root = repo();
    withManual(root, "cinco", {
      axis: "tenant",
      values: [{ id: "north", name: "Movilidad" }],
      rows: `        - id: r1\n          version: 1.0.0`,
    });
    // Two axes: one filename and one figure set need a single value, so nothing
    // can say which document a target names. See `soleAxis`.
    const config = join(root, "manuals", "cinco", "manual.config.yaml");
    writeFileSync(
      config,
      `manual:\n  title: Cinco\naxes:\n  tenant:\n    values:\n      - id: north\n        name: NORTH\n  role:\n    values:\n      - id: admin\n        name: Admin\ntargets:\n  - tenant: north\n    role: admin\noutput:\n  dir: output\n  filename: "m.pdf"\n`,
    );
    expect(readDeliverableDocs(root).skipped).toEqual([
      { id: "cinco", why: "no declara exactamente un eje" },
    ]);
  });

  it("is empty, not a crash, in a repo with no manuals directory", () => {
    expect(readDeliverableDocs(mkdtempSync(join(tmpdir(), "wizard-")))).toEqual({
      docs: [],
      skipped: [],
    });
  });
});

describe("BUILD_KINDS", () => {
  const flags = (label: string) =>
    BUILD_KINDS.find((k) => k.label.includes(label))?.flags ?? null;

  it("makes the plain build ask for nothing", () => {
    expect(flags("nada más")).toEqual([]);
  });

  /**
   * The Word takes far longer than the PDF, so it is opt-in rather than part of
   * every iteration. Only a delivery gets it unconditionally, because a client
   * receives the set.
   */
  it("keeps the Word behind its own choice", () => {
    expect(flags("Word")).toEqual(["--docx"]);
  });

  /**
   * The draft PDF and the pending-image table go to the same people, and the
   * two COMO-ENTREGAR-IMAGENES.md files tell them to use both. Offering them
   * separately would invite handing over half of what those documents describe.
   */
  it("sends the draft and the pending table together", () => {
    expect(flags("Borrador")).toEqual(["--draft", "--pending-table"]);
  });

  /**
   * A version-named document is a delivery: it is a different menu entry, it
   * renders the file itself, and it is the one act that needs the owner's
   * authorisation. No build option may reach it.
   */
  it("offers no way to produce a client's document", () => {
    for (const kind of BUILD_KINDS) {
      expect(kind.flags).not.toContain("--version");
      expect(kind.flags.join(" ")).not.toMatch(/deliver|official/);
    }
  });
});

describe("readBuildableManuals", () => {
  const withConfig = (root: string, id: string, body: string) => {
    mkdirSync(join(root, "manuals", id), { recursive: true });
    writeFileSync(join(root, "manuals", id, "manual.config.yaml"), body);
  };

  const oneAxis = [
    `manual:`,
    `  title: Manual`,
    `axes:`,
    `  tenant:`,
    `    values:`,
    `      - id: north`,
    `        name: Movilidad Medellín`,
    `targets:`,
    `  - tenant: north`,
    `output:`,
    `  dir: output`,
    ``,
  ].join("\n");

  /**
   * Looser than `readDeliverableDocs` on purpose. A manual with no change log
   * cannot be versioned but builds perfectly well — `_catalog` and
   * `beacon-primera-entrega` are exactly that, and hiding them would hide the
   * gallery from whoever maintains it.
   */
  it("includes a manual with no change log at all", () => {
    const root = repo();
    withConfig(root, "sin-log", oneAxis);
    expect(readBuildableManuals(root).map((m) => m.id)).toEqual(["sin-log"]);
  });

  it("resolves an axis value's display name", () => {
    const root = repo();
    withConfig(root, "uno", oneAxis);
    expect(readBuildableManuals(root)[0]?.nameFor("north")).toBe("Movilidad Medellín");
  });

  it("falls back to the value itself when nothing names it", () => {
    const root = repo();
    withConfig(root, "uno", oneAxis);
    expect(readBuildableManuals(root)[0]?.nameFor("desconocido")).toBe("desconocido");
  });

  /**
   * Reported as `axis: null` rather than dropped, so each caller decides: a
   * build can still run unfiltered, while a delivery has to refuse because it
   * could not say which document a target names.
   */
  it("reports a manual without a single axis instead of hiding it", () => {
    const root = repo();
    withConfig(
      root,
      "dos-ejes",
      `manual:\n  title: Dos\naxes:\n  tenant:\n    values: []\n  role:\n    values: []\ntargets: []\n`,
    );
    const found = readBuildableManuals(root);
    expect(found).toHaveLength(1);
    expect(found[0]?.axis).toBeNull();
  });

  it("reports an empty output/ rather than failing on a manual never built", () => {
    const root = repo();
    withConfig(root, "uno", oneAxis);
    expect(readBuildableManuals(root)[0]?.built).toEqual([]);
  });

  it("skips a directory with no config", () => {
    const root = repo();
    mkdirSync(join(root, "manuals", "basura"), { recursive: true });
    expect(readBuildableManuals(root)).toEqual([]);
  });
});

describe("assembleUpdatePrompt", () => {
  const state: ManualState = {
    id: "atlas",
    title: "Manual de operador",
    source: "atlas",
    hasMap: true,
    sections: 14,
    pending: 1,
    totalImages: 240,
    hasState: true,
  };

  /**
   * The decisions this repository keeps in memory are not derivable from
   * `sections/` — which module comes next, what was ruled out, what the team
   * agreed. An agent that starts editing without them re-proposes what was
   * already discarded.
   */
  it("puts the memory recall before anything else", () => {
    const p = assembleUpdatePrompt(state, "Agregá el módulo de reportes.");
    const recall = p.indexOf("mem_context");
    const task = p.indexOf("Lo que hay que hacer");
    expect(recall).toBeGreaterThan(-1);
    expect(recall).toBeLessThan(task);
  });

  /** Search results come back truncated, so the detail needs a second call. */
  it("names all three recovery calls, not just the search", () => {
    const p = assembleUpdatePrompt(state, "x");
    for (const call of ["mem_context", "mem_search", "mem_get_observation"]) {
      expect(p).toContain(call);
    }
  });

  /**
   * The tools may simply not be there — a teammate's checkout, a headless run.
   * An agent that stalls waiting for them has turned a missing convenience into
   * a blocked task.
   */
  it("says what to do when memory is unavailable", () => {
    expect(assembleUpdatePrompt(state, "x")).toContain("no están disponibles");
  });

  /**
   * Everything around the instruction is this harness talking; the fenced block
   * is the owner talking. An agent that cannot tell them apart treats a
   * suggestion as a rule, or a rule as a suggestion.
   */
  it("quotes the instruction verbatim and fenced", () => {
    const instruction = "Corregí el paso 3 de turnos: el botón se llama Guardar, no Aceptar.";
    const p = assembleUpdatePrompt(state, instruction);
    expect(p).toContain("```\n" + instruction + "\n```");
  });

  it("keeps a multi-line instruction whole", () => {
    const p = assembleUpdatePrompt(state, "Primera línea.\nSegunda línea.");
    expect(p).toContain("Primera línea.\nSegunda línea.");
  });

  /**
   * The version marks a DELIVERY and only the owner moves it. A content update
   * that bumped it on its way past is exactly the behaviour `manuals/AGENTS.md`
   * removed, and nothing in the build would stop it.
   */
  it("forbids moving the version on the way past", () => {
    const p = assembleUpdatePrompt(state, "x");
    expect(p).toContain("La versión no se mueve sola");
    expect(p).toContain("sólo Daniel la");
  });

  it("tells the agent to stop when the task collides with a rule", () => {
    expect(assembleUpdatePrompt(state, "x")).toContain("PARÁ y contá el choque");
  });

  /**
   * Unlike `assembleContinuationPrompt`, the step here is already decided. A
   * prompt that also asked for a proposal would have the agent negotiating with
   * an instruction it was handed.
   */
  it("hands over an instruction instead of asking for a proposal", () => {
    const p = assembleUpdatePrompt(state, "x");
    expect(p).not.toContain("Proponé el próximo paso");
  });

  it("reports a manual with no map or no source rather than hiding it", () => {
    const blocked = assembleUpdatePrompt(
      { ...state, source: null, hasMap: false, pending: null, hasState: false },
      "x",
    );
    expect(blocked).toContain("(ninguna declarada)");
    expect(blocked).toContain("NO existe");
    expect(blocked).toContain("todavía no se exportaron pedidos");
  });
});
