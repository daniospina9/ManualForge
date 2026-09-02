import { existsSync, readdirSync } from "node:fs";
import { join, posix, relative, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import type { ResolvedImage, SlotState } from "@manualforge/blocks";

/**
 * Resolving image slots against what has actually been delivered.
 *
 * Content declares slots (see `packages/blocks/src/image.ts`); this is the only
 * place that knows where files live. Three steps, in order:
 *
 *   1. `<tenant>/<slot>.<ext>` — an image made for this deployment
 *   2. `_common/<slot>.<ext>`  — one image valid for every deployment
 *   3. `_pending.svg`          — the placeholder, identical everywhere; the
 *                               manual's own copy, else the one shipped here
 *
 * The third step is not a fallback of last resort, it is the normal state of a
 * module that has just been written: the slot is declared, the manifest asks
 * for it, and the page shows a placeholder in its place until it arrives.
 */

/** The single placeholder, at the root of the figures folder. */
export const PENDING_PLACEHOLDER = "_pending.svg";

/**
 * The placeholder the pipeline ships, for a manual that has none of its own.
 *
 * Nothing in the pipeline used to create one: the copies that exist arrived by
 * hand, with the commit that invented image slots. So a manual folder created
 * from scratch died here on its first build — the one build where EVERY slot is
 * pending. The file has to exist on disk rather than be generated, because both
 * renderers are handed a path and read the bytes themselves.
 *
 * It is brand-neutral, since the pipeline cannot know which brand is being
 * built. A manual that wants its own palette keeps its own copy, which wins.
 */
const SHIPPED_PLACEHOLDER = fileURLToPath(new URL("../assets/_pending.svg", import.meta.url));

/** The shared set: one image good for every deployment. */
export const COMMON_SET = "_common";

/** What the delivering area might send. The slot never names one of these. */
const IMAGE_EXTENSIONS = new Set([".png", ".jpg", ".jpeg", ".svg", ".webp", ".gif"]);

/** A resolved image, plus where it came from for the manifest. */
export interface ManifestImage extends ResolvedImage {
  /** Path relative to the figures folder. Absent when pending. */
  readonly file?: string;
}

export interface ImageIndex {
  /** Resolve a slot, recording that it was asked for. */
  resolve(slot: string): ManifestImage;
  /**
   * Every slot this deployment can see on disk — its own set plus the shared
   * one — whether or not anything asked for it.
   *
   * Deciding what is undeclared needs ALL deployments: an image used only by one
   * of them is legitimately unused by the others, so a per-deployment answer
   * would report every tenant-specific image as an orphan. See `imageRequests`,
   * which subtracts what any deployment asked for from what all of them saw.
   */
  indexed(): readonly string[];
}

const extensionOf = (name: string): string => {
  const dot = name.lastIndexOf(".");
  return dot <= 0 ? "" : name.slice(dot).toLowerCase();
};

/**
 * Map every image under `root` to the slot it claims: folders become dots and
 * the extension is dropped, the exact inverse of `slotToPath`.
 */
function indexSet(root: string, label: string): Map<string, string> {
  const found = new Map<string, string>();
  if (!existsSync(root)) return found;

  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(path);
        continue;
      }
      if (!IMAGE_EXTENSIONS.has(extensionOf(entry.name))) continue;

      const rel = relative(root, path).split(sep).join(posix.sep);
      const slot = rel.slice(0, rel.length - extensionOf(rel).length).split(posix.sep).join(".");
      const already = found.get(slot);
      if (already) {
        throw new Error(
          `two files claim the image slot "${slot}" in ${label}: ` +
            `"${relative(root, already).split(sep).join(posix.sep)}" and "${rel}". ` +
            `One slot is one image — the build cannot know which delivery is ` +
            `current. Delete the one that is stale.`,
        );
      }
      found.set(slot, path);
    }
  };

  walk(root);
  return found;
}

/**
 * Index what has been delivered for one deployment.
 *
 * Built once per target rather than probing the disk per slot: the same index
 * answers every lookup and catches two files claiming one slot.
 */
export function buildImageIndex(figuresDir: string, tenant: string): ImageIndex {
  const own = join(figuresDir, PENDING_PLACEHOLDER);
  const placeholder = existsSync(own) ? own : SHIPPED_PLACEHOLDER;
  if (!existsSync(placeholder)) {
    throw new Error(
      `the pending placeholder is missing: this manual keeps no ` +
        `"${PENDING_PLACEHOLDER}" in "${figuresDir}", and the one the pipeline ` +
        `ships is gone too ("${SHIPPED_PLACEHOLDER}") — the checkout is ` +
        `incomplete. Every undelivered slot renders it, so without it a pending ` +
        `image becomes a blank gap, which reads as finished content.`,
    );
  }

  const perTenant = indexSet(join(figuresDir, tenant), `the "${tenant}" set`);
  const common = indexSet(join(figuresDir, COMMON_SET), `the "${COMMON_SET}" set`);

  const hit = (path: string, state: SlotState): ManifestImage => ({
    url: pathToFileURL(path).href,
    state,
    file: relative(figuresDir, path).split(sep).join(posix.sep),
  });

  return {
    resolve(slot) {
      const own = perTenant.get(slot);
      if (own) return hit(own, "tenant");
      const shared = common.get(slot);
      if (shared) return hit(shared, "common");
      // The delivery name travels WITH the resolution so the draft build can
      // print exactly what the capture team has to save.
      //
      // FLAT, with the slot's own dots, not the folder tree. Both resolve to the
      // same slot — the index turns folders into dots and a dotted filename
      // already is dots — but only one of them can be handed to somebody outside
      // this repository. A nested path asks them to rebuild a directory tree by
      // hand for 200 files and get every level right; a flat name asks them to
      // save files in one folder. The tree still works for anyone who has the
      // repo and prefers to browse it.
      return {
        url: pathToFileURL(placeholder).href,
        state: "pending",
        deliverTo: `${COMMON_SET}/${slot}.png`,
      };
    },

    indexed() {
      return [...new Set([...perTenant.keys(), ...common.keys()])].sort();
    },
  };
}
