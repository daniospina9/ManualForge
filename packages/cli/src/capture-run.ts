import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import puppeteer, { type ElementHandle, type Page } from "puppeteer-core";
import { findChrome } from "./chrome.ts";
import { isAttachTarget } from "./capture.ts";
import type {
  AttachConfig,
  AuthConfig,
  Deployment,
  PlannedCapture,
  RecipeDoc,
} from "./capture.ts";

/** What happened to one planned capture. */
export interface CaptureResult {
  readonly slot: string;
  readonly ok: boolean;
  /** Why it failed, in the terms the operator can act on. */
  readonly reason?: string;
  readonly bytes?: number;
}

const DEFAULT_VIEWPORT = { width: 1600, height: 900 };
/** Long enough for a slow query, short enough that a dead selector is not a hang. */
const WAIT_MS = 20000;

/**
 * How little text means the application is not there at all.
 *
 * Measured, not chosen: a blanked Beacon360 tree reports 0, and the emptiest
 * healthy view measured — Beacon of Things showing only its landing panel —
 * reports 641. The gap is wide enough that any number in it would do, so this
 * sits near the bottom of it: a threshold that has to be exact is a threshold
 * that will drift.
 */
const BLANK_TEXT_MAX = 40;

/**
 * Is this a blanked application rather than a sparse screen?
 *
 * Separate and pure so the boundary can be tested without a browser, which
 * nothing else in this module can be.
 */
export function looksBlank(textLength: number): boolean {
  return textLength <= BLANK_TEXT_MAX;
}

/**
 * Read the credentials the recipe NAMES, and fail with the variable name.
 *
 * The recipe carries variable names rather than values so it can be committed.
 * The error therefore has to say which variable to set, or the whole indirection
 * just moves the confusion somewhere else.
 */
function credentials(auth: AuthConfig): { user: string; password: string } {
  const user = process.env[auth.userEnv];
  const password = process.env[auth.passwordEnv];
  const missing = [
    user ? null : auth.userEnv,
    password ? null : auth.passwordEnv,
  ].filter((v): v is string => v !== null);
  if (missing.length > 0) {
    throw new Error(
      `capture needs the product login: ${missing.join(" and ")} ${missing.length > 1 ? "are" : "is"} empty.\n` +
        `  Fill them in .env.capture at the repository root (copy .env.capture.example\n` +
        `  if it is not there yet). That file is gitignored; the recipe file is not,\n` +
        `  which is why the login is never written into it.`,
    );
  }
  return { user: user as string, password: password as string };
}

/**
 * Take every planned shot, however the run got to the product.
 *
 * `navigate` is the seam between the two modes, and it owns the viewport too: a
 * URL-driven run may resize the window it launched, while an ATTACHED run must
 * not — resizing somebody's signed-in application to suit a screenshot changes
 * the layout the reader is being shown, and the operator did not ask for it.
 *
 * Everything after navigation is identical and deliberately shared. The retry on
 * a detached node, and the order of the two gates, were both learned from wrong
 * images that the run reported as successes.
 */
async function shootAll(
  page: Page,
  plan: readonly PlannedCapture[],
  figuresDir: string,
  onProgress: (line: string) => void,
  navigate: (shot: PlannedCapture) => Promise<void>,
): Promise<CaptureResult[]> {
  const results: CaptureResult[] = [];
    for (const shot of plan) {
      try {
        await navigate(shot);
        // Reach panes that have no route of their own — see `steps` in capture.ts.
        // Each click is retried once: expanding a sidebar parent re-renders the
        // menu, so the node found a moment ago is detached by the time the click
        // lands. Retrying re-queries against the menu that now exists.
        for (const step of shot.steps ?? []) {
          for (let attempt = 0; ; attempt++) {
            try {
              if ("drag" in step) {
                // Real pointer events, not element.dispatchEvent: HTML5 and
                // pointer-based drag libraries both ignore synthetic events that
                // carry no coordinates, and would silently do nothing.
                const src = await page.waitForSelector(step.drag.from, { timeout: WAIT_MS });
                const dst = await page.waitForSelector(step.drag.to, { timeout: WAIT_MS });
                const a = await src!.boundingBox();
                const b = await dst!.boundingBox();
                if (!a || !b) throw new Error("drag endpoint has no box — it is not visible");
                await page.mouse.move(a.x + a.width / 2, a.y + a.height / 2);
                await page.mouse.down();
                // Move in steps: a single jump can land before the drag source
                // has registered the press, and nothing picks up.
                await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2, { steps: 20 });
                await page.mouse.up();
                break;
              }
              if ("hover" in step) {
                // The cursor STAYS where this leaves it. Nothing after a step
                // moves the mouse — the gates and the clip only query — so the
                // revealed control is still revealed when the shot is taken.
                //
                // Which also means a `hover` has to come after any `drag` in the
                // same sequence: a drag drives the same mouse and would carry
                // the cursor off whatever this uncovered.
                await page.waitForSelector(step.hover, { timeout: WAIT_MS });
                await page.hover(step.hover);
                break;
              }
              await page.waitForSelector(step.click, { timeout: WAIT_MS });
              await page.click(step.click);
              break;
            } catch (error) {
              const detached = /detached|not clickable|No node found/i.test(String(error));
              if (!detached || attempt >= 1) throw error;
              await new Promise((r) => setTimeout(r, 1200));
            }
          }
          // Let the pane it opened settle before the next click or the gates.
          await new Promise((r) => setTimeout(r, 1500));
        }
        // WHICH screen, then WHETHER it has data. In that order: the previous
        // section's table is still on the page while a parent menu merely
        // expands, and it would satisfy dataReady before we ever arrived.
        await page.waitForSelector(shot.screenIs, { timeout: WAIT_MS });
        await page.waitForSelector(shot.dataReady, { timeout: WAIT_MS });

        if (shot.settleMs) await new Promise((r) => setTimeout(r, shot.settleMs));

        let target: ElementHandle | Page = page;
        if (shot.clip) {
          const found = await page.$(shot.clip);
          if (!found) throw new Error(`clip selector "${shot.clip}" matched nothing`);
          target = found;
          if (shot.clipUp) {
            // `closest` rather than a hand-rolled walk: it is the DOM's own
            // answer, and it stops at the first match the way a reader would.
            const up = await found.evaluateHandle(
              // eslint-disable-next-line @typescript-eslint/no-explicit-any -- no DOM lib in this tsconfig
              (el: any, sel: string) => el.closest(sel),
              shot.clipUp,
            );
            const climbed = up.asElement();
            if (!climbed) {
              throw new Error(
                `clipUp "${shot.clipUp}" has no such ancestor above "${shot.clip}"`,
              );
            }
            target = climbed as ElementHandle;
          }
        }
        const buffer = (await target.screenshot({ type: "png" })) as Buffer;

        const out = join(figuresDir, shot.deliverTo);
        mkdirSync(dirname(out), { recursive: true });
        writeFileSync(out, buffer);
        results.push({ slot: shot.slot, ok: true, bytes: buffer.length });
        onProgress(`  ok      ${shot.slot} -> ${shot.deliverTo} (${buffer.length} bytes)`);
      } catch (error) {
        const reason = error instanceof Error ? error.message : String(error);
        results.push({ slot: shot.slot, ok: false, reason });
        onProgress(`  FAILED  ${shot.slot}: ${reason.split("\n")[0]}`);
      }
    }
  return results;
}

/**
 * Log in once and shoot every planned slot.
 *
 * One browser and one session for the whole run: logging in per capture would
 * multiply the slowest step by the number of figures, and every extra login is
 * another chance to be rate-limited half way through a batch.
 *
 * A failure is recorded per slot and the run continues. A recipe whose selector
 * has rotted should cost that one figure, not the other eighteen.
 */
export async function runCaptures(
  doc: RecipeDoc,
  deployment: Deployment,
  tenant: string,
  plan: readonly PlannedCapture[],
  figuresDir: string,
  onProgress: (line: string) => void,
): Promise<readonly CaptureResult[]> {
  if (isAttachTarget(doc.target)) {
    throw new Error(
      `this recipe document attaches to a running window; use ` +
        `\`runAttachedCaptures\`. Launching a browser for it would land on the ` +
        `product's setup gate and photograph that instead.`,
    );
  }
  const auth = doc.target.auth;
  const { user, password } = credentials(auth);
  const browser = await puppeteer.launch({
    executablePath: findChrome(),
    headless: true,
    args: ["--disable-gpu", "--no-sandbox"],
  });
  const results: CaptureResult[] = [];
  try {
    const page = await browser.newPage();
    await page.setViewport(DEFAULT_VIEWPORT);

    const { baseUrl } = deployment;
    await page.goto(`${baseUrl}${auth.route}`, { waitUntil: "networkidle0", timeout: WAIT_MS });
    await page.type(auth.userSelector, user);
    await page.type(auth.passwordSelector, password);
    await page.click(auth.submitSelector);
    // Proof the session exists. Without it a wrong password silently leaves us
    // on the login page and every capture below shoots that same form.
    await page.waitForSelector(auth.doneWhen, { timeout: WAIT_MS });
    onProgress("  signed in");

    // Once for the whole run, before any shot: if the deployment is wrong or the
    // module is missing, every capture below is wrong and none should be taken.
    try {
      await page.goto(`${baseUrl}${deployment.verify.route}`, {
        waitUntil: "networkidle0",
        timeout: WAIT_MS,
      });
      await page.waitForSelector(deployment.verify.selector, { timeout: WAIT_MS });
    } catch {
      throw new Error(
        `${baseUrl}${deployment.verify.route} never showed ` +
          `\`${deployment.verify.selector}\`, so the module this run captures is ` +
          `not in this build. Nothing was captured.`,
      );
    }
    onProgress(`  reachable, and the module is present`);

    // URL mode: each shot is a page load, and resizing the browser this run
    // launched costs nobody anything.
    const navigate = async (shot: PlannedCapture): Promise<void> => {
      await page.setViewport(shot.viewport ?? DEFAULT_VIEWPORT);
      await page.goto(`${baseUrl}${shot.route}`, {
        waitUntil: "networkidle0",
        timeout: WAIT_MS,
      });
    };

    results.push(...(await shootAll(page, plan, figuresDir, onProgress, navigate)));
  } finally {
    await browser.close();
  }
  return results;
}


/**
 * Capture from a window a person already signed in to.
 *
 * CONNECT, never launch, and DISCONNECT, never close. The session, the
 * workstation config and the second factor all live in that window: a launched
 * browser lands on `/setup` and cannot leave, and closing the one that works
 * would take the operator's session with it.
 *
 * Navigation is a click on the rail, never a URL. This product declares five
 * routes and one of them is the whole application, so `page.goto` would take it
 * away from the signed-in dashboard with nothing to come back to.
 */
export async function runAttachedCaptures(
  attach: AttachConfig,
  plan: readonly PlannedCapture[],
  figuresDir: string,
  onProgress: (line: string) => void,
): Promise<readonly CaptureResult[]> {
  const browser = await puppeteer.connect({
    browserURL: attach.browserURL,
    // Never resize: the window belongs to whoever signed in, and its size is the
    // layout the reader is going to be shown.
    defaultViewport: null,
  });
  try {
    const pages = await browser.pages();
    const page = pages[0];
    if (!page) {
      throw new Error(
        `nothing is open at ${attach.browserURL}. Start the product with remote ` +
          `debugging enabled and sign in before running this.`,
      );
    }

    // Proof the window is the product AND signed in, once, before any shot. The
    // alternative is a run that photographs a login screen 40 times and reports
    // 40 successes.
    try {
      await page.waitForSelector(attach.verify.selector, { timeout: WAIT_MS });
    } catch {
      throw new Error(
        `the attached window never showed \`${attach.verify.selector}\`. Either it ` +
          `is not signed in, or it is not on the product. Nothing was captured.`,
      );
    }
    onProgress("  attached, signed in");

    /** Rail buttons, top to bottom, re-queried because switching view re-renders. */
    const railButtons = async () => {
      const found: { handle: ElementHandle; y: number }[] = [];
      for (const b of await page.$$('button[data-slot="tooltip-trigger"]')) {
        const box = await b.boundingBox();
        // The view rail is the top group of the leftmost column. The panel bar
        // lower down uses the same markup, which is why the y bound matters.
        if (box && box.x < 24 && box.y < 400) found.push({ handle: b, y: box.y });
      }
      return found.sort((p, q) => p.y - q.y);
    };

    /**
     * How much text is on the page. Zero on a blanked tree.
     *
     * `globalThis` is cast rather than typed from `lib.dom`, the same way
     * `raster.ts:93` does it: this package compiles against ES2023 with no DOM
     * on purpose, because it is a Node CLI and the browser is a subprocess.
     */
    const textLength = () =>
      page.evaluate(() => {
        const g = globalThis as unknown as {
          document: { body: { innerText: string } };
        };
        return g.document.body.innerText.trim().length;
      });

    const enterView = async (index: number): Promise<void> => {
      const rail = await railButtons();
      // Order matters: a blanked tree has NO rail, and reporting that as "the
      // product's rail changed" would send the next reader to re-read `navItems`
      // over a defect that has nothing to do with them.
      if (rail.length === 0 && looksBlank(await textLength())) return;
      if (rail.length !== attach.views.length) {
        throw new Error(
          `the rail shows ${rail.length} views and the recipe declares ` +
            `${attach.views.length}. The product's rail changed, so a position in ` +
            `that list no longer means what it meant — re-read \`navItems\` before ` +
            `capturing anything else.`,
        );
      }
      await rail[index]!.handle.click();
      // The view swap re-renders the whole grid; the gates below still have to
      // pass, so this is only enough to stop clicking into a dying tree.
      await new Promise((r) => setTimeout(r, 1500));
    };

    const navigate = async (shot: PlannedCapture): Promise<void> => {
      const index = attach.views.indexOf(shot.view as string);
      await enterView(index);
      if (!looksBlank(await textLength())) return;

      // Beacon360 blanks the WHOLE application when Beacon of Things is entered
      // a second time in one app load — reload, enter, leave, re-enter, and the
      // tree comes back with no rail, no panel and no text. Confirmed by
      // experiment and recorded as a product defect in that manual's ESTADO.md.
      // It is not something a selector can wait out, and it is not this run's
      // fault: a plan with two recipes on that view hits it on the second.
      //
      // Reloading the same route re-mounts with the session intact — the tokens
      // live in localStorage and the workstation config in the OS keyring — so
      // the blank IS recoverable, and the entry after a reload is a first entry
      // again. Recovering beats failing a plan that is otherwise correct.
      onProgress(`  the app blanked entering ${shot.view} — reloading, then retrying once`);
      await page.reload({ waitUntil: "domcontentloaded" });
      await page.waitForSelector(attach.verify.selector, { timeout: WAIT_MS });
      await enterView(index);
      if (looksBlank(await textLength())) {
        throw new Error(
          `${shot.view} blanked the application, and it blanked again after a ` +
            `reload. That is past the known re-entry defect, so something else is ` +
            `wrong — nothing further was captured.`,
        );
      }
    };

    return await shootAll(page, plan, figuresDir, onProgress, navigate);
  } finally {
    await browser.disconnect();
  }
}
