import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";

const require = createRequire(import.meta.url);

/** Global the bootstrap sets once pagination has actually finished. */
export const PAGED_DONE_FLAG = "__atlasPagedTotal";
/** Global the bootstrap sets if pagination threw. */
export const PAGED_ERROR_FLAG = "__atlasPagedError";

/**
 * The paginator, plus a bootstrap that makes its completion observable.
 *
 * Deliberately NOT the `paged.polyfill` build. That one starts itself on load
 * and offers nothing to wait for, so a printer has no way to know whether
 * pagination finished — it prints whatever exists at that instant and silently
 * truncates long documents, non-deterministically.
 *
 * `paged.js` exposes `Paged.Previewer`, whose `preview()` resolves with the
 * finished flow. The bootstrap records the page count on completion, which is
 * the signal the PDF printer waits for.
 */
export function pagedRuntime(): string {
  const root = dirname(dirname(require.resolve("pagedjs")));
  const lib = readFileSync(join(root, "dist", "paged.min.js"), "utf8");
  // The UMD build registers itself as `PagedModule`, not `Paged` — the latter
  // is what the auto-running polyfill build exposes.
  const bootstrap = `
(function () {
  window.${PAGED_DONE_FLAG} = null;
  window.${PAGED_ERROR_FLAG} = null;
  try {
    new window.PagedModule.Previewer()
      .preview()
      .then(function (flow) { window.${PAGED_DONE_FLAG} = flow.total; })
      .catch(function (e) { window.${PAGED_ERROR_FLAG} = String(e && e.stack || e); });
  } catch (e) {
    window.${PAGED_ERROR_FLAG} = String(e && e.stack || e);
  }
})();`;
  return `${lib}\n${bootstrap}`;
}
