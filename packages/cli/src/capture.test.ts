import { describe, expect, it } from "vitest";
import {
  deploymentFor,
  isAttachTarget,
  parseEnvFile,
  parseRecipes,
  planCaptures,
} from "./capture.ts";

const deployments = {
  north: {
    baseUrl: "https://central.example.com/north",
    verify: { route: "/#/atlas-of-things", selector: "button::-p-text(Alarmas)" },
  },
  demo: {
    baseUrl: "https://web.example.com/lite",
    verify: { route: "/#/atlas-of-things", selector: "button::-p-text(Alarmas)" },
  },
};

const target = {
  deployments,
  auth: {
    route: "/login",
    userEnv: "MANUALFORGE_CAPTURE_USER",
    passwordEnv: "MANUALFORGE_CAPTURE_PASSWORD",
    userSelector: 'input[name="email"]',
    passwordSelector: 'input[name="password"]',
    submitSelector: "#submit-button",
    doneWhen: "nav",
  },
};

const recipe = (slot: string, over: Record<string, unknown> = {}) => ({
  slot,
  route: "/bot/alarms",
  dataReady: "table tbody tr",
  screenIs: "::-p-text(GESTION DE ALARMAS)",
  clip: ".panel",
  ...over,
});

const doc = (recipes: unknown[]) => ({ version: 1, target, recipes });

describe("parseRecipes", () => {
  it("accepts a well-formed document", () => {
    const parsed = parseRecipes(doc([recipe("bot.alarmas.fig")]));
    expect(parsed.recipes).toHaveLength(1);
    // Narrowed rather than asserted: the target is now one of two shapes, and a
    // cast here would hide the day this document stops being the URL kind.
    expect(isAttachTarget(parsed.target)).toBe(false);
    if (!isAttachTarget(parsed.target)) {
      expect(parsed.target.deployments["north"]?.baseUrl).toBe("https://central.example.com/north");
    }
  });

  // A run that cannot check it reached the right place before shooting would
  // deliver a whole batch of wrong images in one go.
  it("refuses a deployment with no reachability check", () => {
    const bad = { north: { baseUrl: "https://x/north" } };
    expect(() => parseRecipes({ version: 1, target: { deployments: bad, auth: target.auth }, recipes: [] })).toThrow(
      /verify/,
    );
  });

  // The single rule that keeps this from producing garbage. A route can render
  // its chrome — header, empty table, spinner gone — long before any data
  // arrives, and a screenshot of an empty alarms list teaches the operator that
  // the screen is empty. That is worse than the placeholder it replaced.
  it("refuses a recipe with no proof that DATA arrived", () => {
    expect(() => parseRecipes(doc([recipe("bot.alarmas.fig", { dataReady: undefined })]))).toThrow(
      /dataReady/,
    );
  });

  // dataReady proves DATA is on screen. It does not prove WHICH screen: a
  // sidebar parent that only expands leaves the previous section's table up,
  // and it satisfies dataReady instantly. Both bot.cctv.fig and bot.pmv.fig
  // came back as PRT that way.
  it("refuses a recipe with no proof of WHICH screen it is on", () => {
    expect(() => parseRecipes(doc([recipe("bot.alarmas.fig", { screenIs: undefined })]))).toThrow(
      /screenIs/,
    );
  });

  it("refuses an empty screenIs", () => {
    expect(() => parseRecipes(doc([recipe("bot.alarmas.fig", { screenIs: " " })]))).toThrow(
      /screenIs/,
    );
  });

  it("refuses an empty dataReady, which would satisfy the schema and prove nothing", () => {
    expect(() => parseRecipes(doc([recipe("bot.alarmas.fig", { dataReady: "  " })]))).toThrow(
      /dataReady/,
    );
  });

  // Credentials in a file get committed. The recipe names the VARIABLE.
  it("refuses a literal password anywhere in the auth block", () => {
    const bad = { ...target, auth: { ...target.auth, password: "hunter2" } };
    expect(() => parseRecipes({ version: 1, target: bad, recipes: [recipe("a")] })).toThrow(
      /password/i,
    );
  });

  // The whole BoT module is ONE route; its sections are sidebar state. So a
  // route alone cannot reach the Alarmas pane and a recipe needs clicks. The
  // product puts no test id on those buttons and its repository is read-only,
  // so the only stable handle is the visible label — which comes from the same
  // i18n catalogue the manual already quotes its labels from.
  it("accepts the clicks needed to reach a pane that has no route of its own", () => {
    const parsed = parseRecipes(
      doc([recipe("bot.alarmas.fig", { steps: [{ click: "button::-p-text(Alarmas)" }] })]),
    );
    expect(parsed.recipes[0]?.steps).toHaveLength(1);
  });

  // The CCTV mosaic fills by dragging a camera onto a tile. Without a drag step
  // that grid can only ever be photographed empty — four black rectangles.
  it("accepts a drag step", () => {
    const parsed = parseRecipes(
      doc([recipe("bot.alarmas.fig", { steps: [{ drag: { from: ".cam", to: ".tile" } }] })]),
    );
    expect(parsed.recipes[0]?.steps?.[0]).toEqual({ drag: { from: ".cam", to: ".tile" } });
  });

  it("keeps click and drag mixable in one sequence, in order", () => {
    const parsed = parseRecipes(
      doc([
        recipe("bot.alarmas.fig", {
          steps: [{ click: "button" }, { drag: { from: ".cam", to: ".tile" } }],
        }),
      ]),
    );
    expect(parsed.recipes[0]?.steps).toHaveLength(2);
  });

  // A control the product only shows on hover is absent from a still frame taken
  // without one, and absent in the worst way: the clip succeeds and the caption
  // promises a button that is not in the picture. `bot.cctv.presets.volver` was
  // captured and deleted once for exactly that.
  it("accepts a hover step, which is not a click", () => {
    const parsed = parseRecipes(
      doc([recipe("bot.alarmas.fig", { steps: [{ hover: '[title="Ir a preset"]' }] })]),
    );
    expect(parsed.recipes[0]?.steps?.[0]).toEqual({ hover: '[title="Ir a preset"]' });
  });

  // Order is load-bearing in the runner: a drag drives the same mouse a hover
  // does, so a hover before one is carried off whatever it uncovered. Parsing
  // cannot enforce that, but it must at least preserve the sequence.
  it("keeps a drag-then-hover sequence in the order it was written", () => {
    const parsed = parseRecipes(
      doc([
        recipe("bot.alarmas.fig", {
          steps: [{ drag: { from: ".cam", to: ".grid" } }, { hover: ".row" }],
        }),
      ]),
    );
    expect(parsed.recipes[0]?.steps).toEqual([
      { drag: { from: ".cam", to: ".grid" } },
      { hover: ".row" },
    ]);
  });

  it("refuses an empty hover selector, which would hover nothing and reveal nothing", () => {
    expect(() =>
      parseRecipes(doc([recipe("bot.alarmas.fig", { steps: [{ hover: " " }] })])),
    ).toThrow(/hover/);
  });

  // A drag with only one end is a typo that would otherwise throw deep inside
  // the browser, long after the run has logged in.
  // A video stream satisfies a `video` selector the moment the element exists,
  // long before it has decoded a frame. There is no selector for "has pixels".
  it("accepts an explicit settle before the shot", () => {
    const parsed = parseRecipes(doc([recipe("bot.alarmas.fig", { settleMs: 8000 })]));
    expect(parsed.recipes[0]?.settleMs).toBe(8000);
  });

  it("refuses a settle long enough to look like a hang", () => {
    expect(() => parseRecipes(doc([recipe("bot.alarmas.fig", { settleMs: 120000 })]))).toThrow();
  });

  it("refuses a drag missing an end", () => {
    expect(() =>
      parseRecipes(doc([recipe("bot.alarmas.fig", { steps: [{ drag: { from: ".cam" } }] })])),
    ).toThrow(/to/);
  });

  // The union is CLOSED, and that is the point of this one. `hover` used to be
  // the example here; it is a real step now, so the example moved to a kind the
  // runner still cannot perform. A step the runner ignores is worse than a
  // rejected one — the shot succeeds having skipped it.
  it("refuses a step kind the runner cannot perform", () => {
    expect(() =>
      parseRecipes(doc([recipe("bot.alarmas.fig", { steps: [{ scroll: ".x" }] })])),
    ).toThrow();
  });

  it("refuses an empty click selector, which would silently click nothing", () => {
    expect(() =>
      parseRecipes(doc([recipe("bot.alarmas.fig", { steps: [{ click: " " }] })])),
    ).toThrow(/click/);
  });

  it("refuses two recipes claiming the same slot", () => {
    expect(() =>
      parseRecipes(doc([recipe("bot.alarmas.fig"), recipe("bot.alarmas.fig", { route: "/x" })])),
    ).toThrow(/bot\.alarmas\.fig/);
  });
});

describe("deploymentFor", () => {
  const parsed = () => parseRecipes(doc([recipe("bot.alarmas.fig")]));

  it("picks the deployment for the tenant being built", () => {
    expect(deploymentFor(parsed(), "north").baseUrl).toBe("https://central.example.com/north");
    expect(deploymentFor(parsed(), "demo").baseUrl).toBe("https://web.example.com/lite");
  });

  // The alternative is capturing north's figures off whatever deployment happens to
  // be first in the file, which is the exact mistake this indirection exists to
  // stop. The message lists what IS configured so the fix is obvious.
  it("refuses a tenant with no deployment, and says which ones exist", () => {
    expect(() => deploymentFor(parsed(), "south")).toThrow(/south/);
    expect(() => deploymentFor(parsed(), "south")).toThrow(/north, demo|demo, north/);
  });
});

describe("parseEnvFile", () => {
  it("reads a plain KEY=VALUE", () => {
    expect(parseEnvFile("MANUALFORGE_CAPTURE_USER=operador@example.com")).toEqual({
      MANUALFORGE_CAPTURE_USER: "operador@example.com",
    });
  });

  it("ignores blank lines and comments", () => {
    const got = parseEnvFile("# el usuario\n\nA=1\n   \n# otro\nB=2\n");
    expect(got).toEqual({ A: "1", B: "2" });
  });

  // A password is not prose. Treating a "#" as the start of a comment would
  // silently truncate it and the login would fail with no clue why.
  it("keeps a # inside a value — it is a password character, not a comment", () => {
    expect(parseEnvFile("P=abc#123")).toEqual({ P: "abc#123" });
  });

  it("keeps an = inside a value, splitting on the first one only", () => {
    expect(parseEnvFile("P=a=b=c")).toEqual({ P: "a=b=c" });
  });

  it("strips surrounding quotes, so a value with spaces survives", () => {
    expect(parseEnvFile('P="con espacio"\nQ=\'otro\'')).toEqual({ P: "con espacio", Q: "otro" });
  });

  // Trailing whitespace is invisible in an editor and would be typed into the
  // password field verbatim.
  it("trims the key and unquoted value", () => {
    expect(parseEnvFile("  A  =  hola  ")).toEqual({ A: "hola" });
  });

  it("keeps deliberate whitespace when the value is quoted", () => {
    expect(parseEnvFile('A="  hola  "')).toEqual({ A: "  hola  " });
  });

  it("survives CRLF, which is what an editor writes on this machine", () => {
    expect(parseEnvFile("A=1\r\nB=2\r\n")).toEqual({ A: "1", B: "2" });
  });

  it("skips a line with no = rather than throwing on a half-typed file", () => {
    expect(parseEnvFile("A=1\nbasura\nB=2")).toEqual({ A: "1", B: "2" });
  });
});

describe("planCaptures", () => {
  const pending = new Set(["bot.alarmas.fig", "bot.cctv.fig", "bot.pmv.fig"]);

  it("plans only the pending slots a recipe covers", () => {
    const plan = planCaptures([recipe("bot.alarmas.fig"), recipe("bot.cctv.fig")], pending);
    expect(plan.ready.map((r) => r.slot)).toEqual(["bot.alarmas.fig", "bot.cctv.fig"]);
  });

  it("reports the pending slots nobody wrote a recipe for", () => {
    const plan = planCaptures([recipe("bot.alarmas.fig")], pending);
    expect(plan.uncovered).toEqual(["bot.cctv.fig", "bot.pmv.fig"]);
  });

  // Same rule the image manifest enforces: extraction cannot create demand. A
  // recipe for a slot nobody asks for would deliver an orphan file, and the
  // undeclared check would then report it as a stray.
  it("refuses a recipe for a slot that is not pending", () => {
    expect(() => planCaptures([recipe("bot.nope.fig")], pending)).toThrow(/bot\.nope\.fig/);
  });

  it("says so plainly when a delivered slot is re-listed, rather than re-shooting it", () => {
    expect(() => planCaptures([recipe("already.delivered")], pending)).toThrow(/not pending/i);
  });

  it("carries the delivery path, so a capture lands on the file the manual asked for", () => {
    const plan = planCaptures([recipe("bot.alarmas.fig")], pending);
    expect(plan.ready[0]?.deliverTo).toBe("_common/bot.alarmas.fig.png");
  });

  it("plans nothing at all when every recipe is already delivered", () => {
    const plan = planCaptures([], pending);
    expect(plan.ready).toHaveLength(0);
    expect(plan.uncovered).toHaveLength(3);
  });
});

// --- attaching to a product that cannot be reached by URL --------------------
//
// Beacon360 is the case. Its window is a Tauri webview, and a browser pointed at
// the dev server lands on /setup and cannot leave: `workstationConfigExists()`
// returns false outside Tauri and the gate wrapping every route redirects there.
// So the run ATTACHES to the signed-in window over CDP, and navigates by
// clicking the rail rather than by URL — the product declares five routes and
// one of them is the whole application.

const attachTarget = {
  attach: {
    browserURL: "http://localhost:9222",
    /**
     * The rail's order, declared once. Copied from the product, cited, so a
     * recipe can say `view: dashboard` instead of carrying a position.
     */
    views: ["home", "sitemap", "dashboard", "beacon-of-things", "forces-in-field", "create-incident"],
    verify: { selector: "h3::-p-text(Agencias)" },
  },
};

const viewRecipe = {
  slot: "home.fig",
  view: "home",
  screenIs: "h3::-p-text(Mi Turno)",
  dataReady: "h3::-p-text(Agencias)",
};

describe("parseRecipes — attaching instead of signing in", () => {
  const attachDoc = (over = {}) => ({
    version: 1,
    target: attachTarget,
    recipes: [viewRecipe],
    ...over,
  });

  it("accepts a document that attaches and navigates by view", () => {
    const parsed = parseRecipes(attachDoc());
    expect(parsed.recipes[0]?.view).toBe("home");
  });

  // The whole point of the mode: there are no credentials to put anywhere,
  // because a person signs in to the window and the run joins it.
  it("carries no auth block at all", () => {
    expect(parseRecipes(attachDoc()).target).not.toHaveProperty("auth");
  });

  it("refuses a recipe naming a view the target never declared", () => {
    const stray = { ...viewRecipe, view: "libro-del-caso" };
    expect(() => parseRecipes(attachDoc({ recipes: [stray] }))).toThrow(/libro-del-caso/);
  });

  // A recipe has to say where it is going, exactly one way. Both is ambiguous
  // and neither is a shot with no destination.
  it("refuses a recipe that gives both a route and a view", () => {
    const both = { ...viewRecipe, route: "/dashboard" };
    expect(() => parseRecipes(attachDoc({ recipes: [both] }))).toThrow(/route|view/);
  });

  it("refuses a recipe that gives neither", () => {
    const { view: _dropped, ...none } = viewRecipe;
    expect(() => parseRecipes(attachDoc({ recipes: [none] }))).toThrow(/route|view/);
  });

  // The two modes are alternatives, not a mixture. A document that declared
  // both would leave the run choosing, and a run that chooses is a run whose
  // output nobody can predict.
  it("refuses a document that both attaches and declares deployments", () => {
    const mixed = { version: 1, target: { ...attachTarget, ...target }, recipes: [viewRecipe] };
    expect(() => parseRecipes(mixed)).toThrow();
  });

  it("still accepts the route-based document atlas uses", () => {
    expect(() => parseRecipes(doc([recipe("bot.alarmas.fig")]))).not.toThrow();
  });
});
