import { z } from "zod";
import { COMMON_SET } from "./images.ts";

/**
 * Capturing a manual's pending figures from the running product.
 *
 * The screenshot is the easy half. What makes this worth building is that the
 * recipes are RE-RUNNABLE: today a UI change silently rots every figure that
 * shows it, and nobody finds out. With a recipe per slot, that drift becomes one
 * command.
 *
 * This module is the pure half — schema and planning. Driving the browser lives
 * in `chrome.ts`, so all of the judgement here is testable without a network.
 */

/** A selector that must be non-empty once trimmed. */
const selector = (field: string) =>
  z
    .string()
    .refine((s) => s.trim().length > 0, { message: `${field} must be a real selector` });

const authSchema = z
  .object({
    route: z.string(),
    /** NAMES of environment variables. Never the values. */
    userEnv: z.string(),
    passwordEnv: z.string(),
    userSelector: selector("userSelector"),
    passwordSelector: selector("passwordSelector"),
    submitSelector: selector("submitSelector"),
    /** Proof the login actually succeeded, rather than silently re-rendering. */
    doneWhen: selector("doneWhen"),
  })
  // A credential in this file gets committed, and then it is in the history for
  // good. Rejecting the shape is the only moment we can stop it cheaply.
  .strict();

const recipeSchema = z
  .object({
    slot: z.string(),
    /**
     * Where to go, ONE of two ways — see `recipeDocSchema.target`.
     *
     * `route` for a product whose screens are URLs. `view` for one whose screens
     * are not: Beacon360 declares five routes and one of them is the whole
     * application, so its screens are reached by clicking the rail. Naming both
     * would leave the run choosing; naming neither is a shot with no
     * destination.
     */
    route: z.string().optional(),
    view: z.string().optional(),
    /**
     * A selector that only matches once real DATA has rendered.
     *
     * Required, and the reason this whole module can be trusted. A route paints
     * its chrome — header, empty table, spinner gone — well before the first row
     * arrives, so "the page loaded" is not a capture signal. An empty alarms
     * list is not a neutral screenshot; it tells the operator the screen is
     * empty, which is worse than the placeholder it replaced.
     */
    dataReady: selector("dataReady"),
    /**
     * Something only THIS screen shows — its own heading, normally.
     *
     * Required, and separate from `dataReady` on purpose. `dataReady` proves
     * data is on screen; it cannot prove WHOSE data. A sidebar parent like CCTV
     * or PMV only expands its submenu, leaving the previous section's table up,
     * and that table satisfies `dataReady` the instant it is checked. Both
     * bot.cctv.fig and bot.pmv.fig were captured as PRT exactly that way, and
     * the run reported 4 of 4.
     */
    screenIs: selector("screenIs"),
    /**
     * Interactions needed to reach — or to REVEAL — the pane, in order.
     *
     * Not every screen has a route. The whole Atlas of Things module is one
     * route and its sections are sidebar state, so Alarmas is unreachable by URL.
     * The product puts no test id on those buttons and its repository is
     * read-only, which leaves the visible label as the only stable handle — the
     * same i18n catalogue the manual already takes its labels from.
     */
    steps: z
      .array(
        z.union([
          z.object({ click: selector("click") }).strict(),
          // Dragging is not a convenience. The CCTV mosaic fills ONLY by
          // dragging a camera onto a tile, so without this its grid can only
          // ever be photographed empty — four black rectangles.
          z
            .object({
              drag: z
                .object({ from: selector("drag.from"), to: selector("drag.to") })
                .strict(),
            })
            .strict(),
          // Hovering is not a convenience either, and it is not a click: a click
          // on a control the manual only DESCRIBES would operate the product on
          // somebody's signed-in window.
          //
          // A control the product reveals on hover is absent from any still
          // frame taken without one, and absent in the worst way — the clip
          // succeeds, the file is real, and the caption promises a button that
          // is not in the picture. `bot.cctv.presets.volver` was captured and
          // deleted exactly once for that: `cctv-presets.tsx:109` gives the
          // "Ir a preset" button `opacity-0 group-hover:opacity-100`.
          //
          // Opacity, not display or visibility — so the element keeps its box
          // and its pointer events, and a hover can target the very selector
          // the shot is about to clip.
          z.object({ hover: selector("hover") }).strict(),
        ]),
      )
      .optional(),
    /**
     * Extra wait after the gates, before the shot.
     *
     * For content no selector can assert. A video element satisfies `video` the
     * instant it is created, long before it has decoded a frame — the CCTV
     * mosaic came back as a black tile with a spinner that way. Capped, because
     * a long settle is indistinguishable from a hang.
     */
    settleMs: z.number().int().min(0).max(30000).optional(),
    /** What to photograph. Omitted means the whole viewport. */
    clip: z.string().optional(),
    /**
     * Climb from what `clip` matched to the nearest ancestor matching this.
     *
     * Needed because a product may offer no handle on the thing worth
     * photographing. Beacon360's panels are all `div.panel` with no id, no test
     * id and nothing to tell them apart; the only distinguishing thing inside
     * one is its heading. So `clip` finds the heading and this climbs to the
     * panel around it.
     *
     * The alternative was a full-viewport shot for a caption that promises one
     * panel, which is a picture that does not answer its own caption.
     */
    clipUp: z.string().optional(),
    viewport: z.object({ width: z.number().int(), height: z.number().int() }).optional(),
  })
  .strict()
  .refine((r) => (r.route === undefined) !== (r.view === undefined), {
    message: "a recipe needs exactly one of `route` or `view`, never both and never neither",
  });

/**
 * One deployed build of the product.
 *
 * The tenant is compiled INTO the bundle: `src/render/config/index.ts` selects
 * it from `VITE_NAME_PROJECT`, a build-time variable. So one URL is one tenant,
 * and there is no way to ask a running app to be another. `basePath` in the
 * tenant config says where it is SERVED, not which config it loaded — demo and
 * lite both use "lite" — so the URL alone cannot be trusted to identify a tenant.
 */
const deploymentSchema = z
  .object({
    baseUrl: z.string(),
    /**
     * A page to open right after login, and something that must be on it.
     *
     * What this proves: the session is real, the deployment is up, and the
     * module being captured exists in this build. What it does NOT prove is
     * WHICH TENANT the build is. That would need a tenant-specific artifact in
     * the DOM — the configured logo would be ideal, but `logoImages` is used
     * only on two report pages and does not render there. Adding one is a
     * product change, and the product repository is read-only.
     */
    verify: z.object({ route: z.string(), selector: selector("verify.selector") }).strict(),
  })
  .strict();

/**
 * A product that cannot be reached by pointing a browser at a URL.
 *
 * Beacon360 is the case, and it is not a preference. Its window is a Tauri
 * webview; a browser opened on the same dev server lands on `/setup` and cannot
 * leave, because `workstationConfigExists()` returns false outside Tauri and the
 * gate wrapping every route redirects there. The station config lives in the OS
 * keyring through Rust, so no browser can ever satisfy it.
 *
 * So the run ATTACHES to the window a person already signed in to. Two
 * consequences worth stating, because both are load-bearing:
 *
 *  - **No credentials, anywhere.** There is no auth block, no env var, no
 *    second-factor handling. A person signs in; the run joins. That also
 *    removes the race against a time-based code expiring mid-handshake.
 *  - **No navigation.** `page.goto` on this webview would take the app away
 *    from the signed-in dashboard, and there is no route to come back to. Every
 *    shot is reached by clicking.
 */
const attachSchema = z
  .object({
    browserURL: z.string(),
    /**
     * The rail's views, in the order the product declares them.
     *
     * Declared once here so a recipe can say `view: dashboard` and carry no
     * position. The order is a fact about the product — for Beacon360 it is
     * `navItems`, `components/layout/icon-sidebar.tsx:51-83`, with the entry
     * marked `isCall: true` rendered outside this group — and a rail button
     * offers no id, no aria-label and no text to select on. Its tooltip does
     * carry the label, but it stays mounted across reads and returned the
     * previous button's label every other time, which is worse than a position
     * because it looks authoritative.
     */
    views: z.array(z.string().min(1)).min(1),
    /** Proof the attached window is signed in and showing the product. */
    verify: z.object({ selector: selector("verify.selector") }).strict(),
  })
  .strict();

export const recipeDocSchema = z
  .object({
    version: z.literal(1),
    // Alternatives, never a mixture: a document declaring both would leave the
    // run deciding how to reach the product, and a run that decides is a run
    // whose output nobody can predict.
    target: z.union([
      z
        .object({ deployments: z.record(z.string(), deploymentSchema), auth: authSchema })
        .strict(),
      z.object({ attach: attachSchema }).strict(),
    ]),
    recipes: z.array(recipeSchema),
  })
  .strict();

/** Whether this document attaches to a running window rather than signing in. */
export function isAttachTarget(
  target: RecipeDoc["target"],
): target is { attach: z.infer<typeof attachSchema> } {
  return "attach" in target;
}

export type Deployment = z.infer<typeof deploymentSchema>;

export type AuthConfig = z.infer<typeof authSchema>;
export type AttachConfig = z.infer<typeof attachSchema>;

export type CaptureRecipe = z.infer<typeof recipeSchema>;
export type RecipeDoc = z.infer<typeof recipeDocSchema>;

/** Parse and validate a recipe document, failing loudly and specifically. */
export function parseRecipes(raw: unknown): RecipeDoc {
  const doc = recipeDocSchema.parse(raw);
  const seen = new Set<string>();
  for (const r of doc.recipes) {
    if (seen.has(r.slot)) {
      throw new Error(
        `two recipes claim the slot "${r.slot}". One slot is delivered as one ` +
          `file, so the second capture would overwrite the first and nothing ` +
          `would report it.`,
      );
    }
    seen.add(r.slot);
  }

  // A `view` the target never declared is a click nobody can make. Caught here
  // rather than at capture time, because by then the run is attached to a live
  // signed-in window and every minute of it is somebody waiting.
  if (isAttachTarget(doc.target)) {
    const known = new Set(doc.target.attach.views);
    for (const r of doc.recipes) {
      if (r.view !== undefined && !known.has(r.view)) {
        throw new Error(
          `recipe for "${r.slot}" names the view "${r.view}", which the target does ` +
            `not declare. Declared: ${[...known].join(", ")}. A view is added to ` +
            `\`target.attach.views\` in the order the product's own rail lists it.`,
        );
      }
    }
  } else {
    for (const r of doc.recipes) {
      if (r.view !== undefined) {
        throw new Error(
          `recipe for "${r.slot}" navigates by \`view\`, but this document reaches ` +
            `the product by URL. Either give it a \`route\`, or switch the target ` +
            `to \`attach\`.`,
        );
      }
    }
  }
  return doc;
}

/**
 * The deployment to shoot for the tenant being captured.
 *
 * Named per tenant rather than left as one `baseUrl`, so `capture --tenant north`
 * cannot quietly photograph whatever deployment happens to be configured. The
 * error lists what IS configured, because the fix is always to add one line.
 */
export function deploymentFor(doc: RecipeDoc, tenant: string): Deployment {
  if (isAttachTarget(doc.target)) {
    throw new Error(
      `this recipe document attaches to a running window, so there is no ` +
        `deployment to resolve for "${tenant}". An attached run photographs ` +
        `whatever window a person signed in to, and which deployment that is ` +
        `cannot be read from the app — see \`attachSchema\`.`,
    );
  }
  const found = doc.target.deployments[tenant];
  if (!found) {
    const known = Object.keys(doc.target.deployments);
    throw new Error(
      `no deployment configured for tenant "${tenant}". Configured: ` +
        `${known.length > 0 ? known.join(", ") : "(none)"}. Add its baseUrl and a ` +
        `\`verify\` selector to capture-recipes.yaml — the tenant is compiled into ` +
        `the bundle, so each one is a separate URL.`,
    );
  }
  return found;
}

/**
 * Read a KEY=VALUE credentials file.
 *
 * Node does not load `.env` on its own, and asking someone to export two
 * variables before every run is a step they will forget once and then debug for
 * an hour. Deliberately small: no interpolation, no multi-line values, no
 * `export` prefix — a credentials file is two lines and every extra feature is
 * another way for a password to arrive subtly altered.
 *
 * Malformed lines are skipped rather than thrown on: a half-typed file should
 * still let the run reach the error that names the missing variable.
 */
export function parseEnvFile(text: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (line === "" || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq <= 0) continue;
    const key = line.slice(0, eq).trim();
    // Split on the FIRST `=` only, and never treat `#` as a comment here: both
    // are ordinary password characters.
    const value = line.slice(eq + 1);
    const quoted = /^(["'])([\s\S]*)\1$/.exec(value.trim());
    out[key] = quoted ? (quoted[2] as string) : value.trim();
  }
  return out;
}

export interface PlannedCapture extends CaptureRecipe {
  /** Where the shot must land for the manual to pick it up. */
  readonly deliverTo: string;
}

export interface CapturePlan {
  readonly ready: readonly PlannedCapture[];
  /** Pending slots no recipe covers yet — the remaining authoring work. */
  readonly uncovered: readonly string[];
}

/**
 * Match recipes against what the manual is actually still asking for.
 *
 * Enforces the manifest's own rule — extraction cannot create demand. A recipe
 * for a slot that is not pending would write an orphan file, which the
 * `undeclared` check then reports as a stray delivery.
 */
export function planCaptures(
  recipes: readonly CaptureRecipe[],
  pending: ReadonlySet<string>,
): CapturePlan {
  const ready: PlannedCapture[] = [];
  for (const r of recipes) {
    if (!pending.has(r.slot)) {
      throw new Error(
        `recipe for "${r.slot}", but that slot is not pending. Either it is ` +
          `already delivered — in which case delete the file to re-shoot it — ` +
          `or the manual never declared it and this capture would be an orphan.`,
      );
    }
    ready.push({ ...r, deliverTo: `${COMMON_SET}/${r.slot}.png` });
  }
  const covered = new Set(ready.map((r) => r.slot));
  return { ready, uncovered: [...pending].filter((s) => !covered.has(s)).sort() };
}
