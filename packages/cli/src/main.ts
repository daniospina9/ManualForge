#!/usr/bin/env node
import { existsSync, readFileSync, readdirSync, mkdirSync, unlinkSync, writeFileSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { parse as parseYaml } from "yaml";
import { z } from "zod";
import { catalog } from "@manualforge/blocks";
import type {
  BlockNode,
  BuildTarget,
  ManualDocument,
  ManualNode,
  ResolvedManual,
} from "@manualforge/blocks";
import {
  assemble,
  collectPending,
  collectSlots,
  loadSection,
  ContentError,
  type ContentWarning,
  type ImageSlotUse,
  type LabelCitation,
  type PendingDeclaration,
} from "@manualforge/core";
import { renderHtml, pagedRuntime } from "@manualforge/render-web";
import {
  renderDocx,
  type CoverData,
  type DocxAssetResolver,
} from "@manualforge/render-docx";
import { themes, isThemeName, type Tokens } from "@manualforge/tokens";
import { printToPdf } from "./chrome.ts";
import { rasterise, shootFirstPage } from "./raster.ts";
import { extract, sourceRootFor } from "./extract.ts";
import { soleAxis } from "./axis.ts";
import { commitFile, headCommit, isDirty } from "./git.ts";
import { archive, planDelivery, stampFile, unstampFile } from "./deliver.ts";
import { changeLogSectionFile, proofFor, type ChangeLogRowLike } from "./delivery-state.ts";
import { nextWorkNumber, workStamp } from "./naming.ts";
import { awaitingProduct, type TargetPending } from "./awaiting.ts";
import { checkLabels, labelLines, labelReport } from "./labels.ts";
import { DEFAULT_PENDING_INSTRUCTION, pendingTable } from "./pending-table.ts";
import {
  deploymentFor,
  isAttachTarget,
  parseEnvFile,
  parseRecipes,
  planCaptures,
} from "./capture.ts";

/** Where the product login lives. Gitignored; see .env.capture.example. */
const CREDENTIALS_FILE = ".env.capture";
import { runAttachedCaptures, runCaptures } from "./capture-run.ts";
import { runWizard } from "./wizard.ts";
import {
  COMMON_SET,
  buildImageIndex,
  type ImageIndex,
  type ManifestImage,
} from "./images.ts";

const axisValueSchema = z
  .object({
    id: z.string().min(1),
    name: z.string().min(1),
  })
  .passthrough();

const axisSchema = z
  .object({
    /**
     * How to name this axis to a human. Both manuals already carry one; it is
     * typed because the image manifest borrows it to describe the convention to
     * a team that has never read this repository, and "deployment" is only the
     * right word for one of the axes a manual can be conditioned on.
     */
    label: z.string().min(1).optional(),
    values: z.array(axisValueSchema).min(1),
  })
  .passthrough();

/**
 * Validated shape of `manual.config.yaml`.
 *
 * Every target must declare a value for every axis the manual declares —
 * enforced below with `superRefine`, because a target silently missing an
 * axis leaves that axis unconstrained during conditioning (`matches()`
 * treats an axis absent from the target as unconstrained), which merges
 * every value of that axis into one manual instead of raising an error.
 */
export const manualConfigSchema = z
  .object({
    manual: z
      .object({
        id: z.string().min(1),
        title: z.string().min(1),
        product: z.string().min(1),
        contentVersion: z.string().min(1),
        /**
         * What the cover and the running header say. Defaults to the product
         * name upper-cased, which is what every manual wanted before a second
         * brand existed — the string used to be hardcoded as "VENDOR".
         */
        brand: z.string().min(1).optional(),
        /** The cover's standfirst. Defaults to the Atlas sentence. */
        lede: z.string().min(1).optional(),
        /**
         * Which brand palette and type to render in. Omitted keeps the default,
         * so every existing manual is unaffected.
         */
        theme: z.string().min(1).optional(),
      })
      .passthrough(),
    axes: z.record(z.string().min(1), axisSchema),
    targets: z.array(z.record(z.string().min(1), z.string().min(1))).min(1),
    output: z
      .object({
        dir: z.string().min(1),
        filename: z.string().min(1),
      })
      .passthrough(),
    /** Per-manual wording for the image-review table. See `pending-table.ts`. */
    images: z
      .object({
        pendingInstruction: z.string().min(1).optional(),
      })
      .passthrough()
      .optional(),
  })
  .passthrough()
  .superRefine((config, ctx) => {
    const axisNames = Object.keys(config.axes);
    config.targets.forEach((target, i) => {
      for (const axis of axisNames) {
        if (!(axis in target)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["targets", i, axis],
            message:
              `target ${i} is missing a value for axis "${axis}", declared in ` +
              `\`axes\`. Every target must declare a value for every axis — ` +
              `never a permissive default.`,
          });
        }
      }
    });
  });

export type ManualConfig = z.infer<typeof manualConfigSchema>;

function loadDocument(
  manualDir: string,
  config: ManualConfig,
): {
  doc: ManualDocument;
  warnings: ContentWarning[];
  pending: PendingDeclaration[];
  labels: LabelCitation[];
} {
  const dir = join(manualDir, "sections");
  const files = readdirSync(dir)
    .filter((f) => f.endsWith(".yaml"))
    .sort();
  const warnings: ContentWarning[] = [];
  const pending: PendingDeclaration[] = [];
  const labels: LabelCitation[] = [];
  const children: ManualNode[] = files.map((f) => {
    const loaded = loadSection(readFileSync(join(dir, f), "utf8"), `sections/${f}`, catalog);
    warnings.push(...loaded.warnings);
    // Beside the tree, never in it. See `PendingDeclaration`.
    pending.push(...loaded.pending);
    labels.push(...loaded.labels);
    return loaded.node;
  });
  const ids = new Set<string>();
  for (const entry of pending) {
    if (ids.has(entry.id)) {
      throw new ContentError(
        entry.file,
        entry.id,
        `duplicate \`pending\` id across sections. The queue is keyed on it, so ` +
          `two entries sharing one id collapse into a single line and one of the ` +
          `two gaps stops being tracked.`,
      );
    }
    ids.add(entry.id);
  }
  assertChangeLog(children, files);
  return {
    doc: {
      manualId: config.manual.id,
      version: config.manual.contentVersion,
      children,
    },
    warnings,
    pending,
    labels,
  };
}

/** Every `change-log` block in a tree, with the top-level section holding it. */
function changeLogsIn(children: readonly ManualNode[]): Map<number, BlockNode[]> {
  const found = new Map<number, BlockNode[]>();
  const walk = (node: ManualNode, into: BlockNode[]): void => {
    if (node.kind === "block") {
      if (node.type === "change-log") into.push(node);
      return;
    }
    for (const child of node.children ?? []) walk(child, into);
  };
  children.forEach((node, i) => {
    const blocks: BlockNode[] = [];
    walk(node, blocks);
    if (blocks.length > 0) found.set(i, blocks);
  });
  return found;
}

/** `1.10.0` sorts above `1.9.0`, which a string comparison gets backwards. */
function compareVersions(a: string, b: string): number {
  const pa = a.split(".").map(Number);
  const pb = b.split(".").map(Number);
  for (let i = 0; i < 3; i++) {
    const diff = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

/**
 * The change log ends the manual, there is exactly one of it, and its rows
 * climb.
 *
 * Enforced rather than written down, because every one of these fails SILENTLY
 * and would ship:
 *
 *  - A second change log renders two delivery histories that disagree, and the
 *    reader has no way to tell which is current.
 *  - A change log that is not last drifts mid-document once someone adds a
 *    section sorting after it. Sections load in FILENAME order, so the position
 *    is decided while naming a file, not while thinking about the change log.
 *  - Rows out of order print a history that reads backwards. Worse since the
 *    delivered version is now DERIVED from this table: ascending order is what
 *    makes "the newest version" and "the last row the reader sees" the same
 *    fact, so the number on the cover matches the bottom of the table.
 */
export function assertChangeLog(
  children: readonly ManualNode[],
  files: readonly string[],
): void {
  const carriers = changeLogsIn(children);
  if (carriers.size === 0) return;

  const named = (i: number): string => files[i] ?? `section ${i + 1}`;
  const indices = [...carriers.keys()];
  const blocks = [...carriers.values()].flat();

  if (blocks.length > 1) {
    throw new ContentError(
      named(indices[0] as number),
      "change-log",
      `${blocks.length} \`change-log\` blocks across ${indices.length} section(s) ` +
        `(${indices.map(named).join(", ")}). A manual has ONE delivery history. ` +
        `Two of them render as two answers to "which version is this", and the ` +
        `reader cannot tell which one to believe.`,
    );
  }

  const at = indices[0] as number;
  if (at !== children.length - 1) {
    throw new ContentError(
      named(at),
      "change-log",
      `the \`change-log\` block is in section ${at + 1} of ${children.length}, ` +
        `but it must be the manual's FINAL module — it is currently followed by ` +
        `${files.slice(at + 1).join(", ")}. Sections load in filename order, so ` +
        `rename this one to sort last rather than moving the block.`,
    );
  }

  // `?? []` on purpose. The schema guarantees `rows` for content that loaded,
  // but a guard that throws TypeError instead of ContentError on a malformed
  // tree reports a bug in itself rather than the defect it was asked to catch.
  const rows = ((blocks[0] as BlockNode).props["rows"] ?? []) as ReadonlyArray<
    Record<string, unknown>
  >;
  for (let i = 1; i < rows.length; i++) {
    const previous = String(rows[i - 1]?.["version"]);
    const current = String(rows[i]?.["version"]);
    if (compareVersions(current, previous) <= 0) {
      throw new ContentError(
        named(at),
        String(rows[i]?.["id"] ?? "change-log"),
        `version ${current} follows ${previous}, but the rows must ASCEND. The ` +
          `delivered version is read from the highest row, and the reader reads ` +
          `the last one — those are only the same fact while the table climbs.`,
      );
    }
  }
}

/**
 * The proof recorded for one target at one version, if that version was
 * delivered to it.
 *
 * Per TARGET, not per version: a row can have been handed to `north` and not to
 * `south`, so a version being delivered somewhere says nothing about here.
 */
export function deliveryProofFor(
  children: readonly ManualNode[],
  version: string,
  axisValue: string,
): { commit: string; files: Readonly<Record<string, string>> } | undefined {
  for (const block of [...changeLogsIn(children).values()].flat()) {
    const rows = (block.props["rows"] ?? []) as ReadonlyArray<Record<string, unknown>>;
    for (const row of rows) {
      if (String(row["version"]) !== version) continue;
      // The WALK is this function's job; the judgement is `proofFor`'s. The
      // wizard asks the same question of rows read straight off a section file,
      // and two implementations of "does this count as a delivery" is how one
      // of them comes to say yes where the other says no.
      const found = proofFor(
        { version, delivered: row["delivered"] as ChangeLogRowLike["delivered"] },
        axisValue,
      );
      if (found !== undefined) return found;
    }
  }
  return undefined;
}

/**
 * The version this target was DELIVERED at: the highest row of its change log.
 *
 * Read from the ASSEMBLED manual, after conditioning, which is the whole point.
 * `contentVersion` is one scalar per manual and cannot say that `north` received
 * 1.1.0 while `south` stopped at 1.0.0 — but the rows carry their own selectors,
 * so once a target is assembled its table already holds only what that target
 * received. The bottom of that table is what its cover should print.
 *
 * STILL THE HIGHEST ROW, delivered or not, now that working builds are named by
 * their working number instead of by this. The alternative — the highest
 * DELIVERED row — was considered and rejected: the reader's eye lands on the
 * last line of the table, and a cover printing a different number than the
 * bottom of that table is the incoherence this function exists to prevent.
 * While no new row is written, the highest one IS the previous delivery.
 *
 * Falls back to the config field for a manual with no change log at all, so
 * `_catalog` and `beacon-primera-entrega` keep building unchanged.
 */
export function deliveredVersion(children: readonly ManualNode[], fallback: string): string {
  const blocks = [...changeLogsIn(children).values()].flat();
  const rows = blocks.flatMap(
    (b) => b.props["rows"] as ReadonlyArray<Record<string, unknown>>,
  );
  const versions = rows.map((r) => String(r["version"]));
  if (versions.length === 0) return fallback;
  return versions.reduce((best, v) => (compareVersions(v, best) > 0 ? v : best));
}

/** One deployment's resolved slots, as the export consumes them. */
export interface TargetImages {
  readonly tenant: string;
  readonly entries: readonly ManifestSlot[];
  /** Every slot this deployment saw on disk, asked for or not. */
  readonly indexed: readonly string[];
}

/** One image in the export, with every deployment that needs it. */
interface RequestedImage {
  readonly slot: string;
  /** Deployment ids that need this image. */
  readonly neededBy: string[];
  /** What it shows and which block uses it, deduplicated across deployments. */
  readonly uses: SlotUsePlace[];
  /**
   * Deployments still rendering the placeholder. Absent once every deployment
   * that needs the image has one — that absence is what "delivered" means here.
   */
  readonly pendingFor?: string[];
  /** Files it currently resolves from, across deployments. */
  readonly files?: string[];
  /**
   * Present while pending: where the file has to be dropped.
   *
   * `override` is a template, not a list of six paths. Spelling out every
   * deployment's path for an image that is the same everywhere reads as an
   * instruction to deliver six copies, which is exactly what `shared` exists to
   * avoid. `neededBy` already says who needs it.
   */
  readonly deliverTo?: { readonly shared: string; readonly override: string };
}

/**
 * Build the image request document — the contract with the area that produces
 * the screenshots.
 *
 * Grouped by SLOT rather than by deployment on purpose. A control that looks
 * identical everywhere is one photograph, and a per-deployment dump would list
 * it six times and invite six copies of the same file. `neededBy` says who
 * needs it; `deliverTo.shared` says where one copy serves all of them.
 *
 * Deliberately without a timestamp: it is regenerated on demand and a clock
 * would make it churn in git on an export that changed nothing.
 */
export function imageRequests(
  config: ManualConfig,
  perTarget: readonly TargetImages[],
): Record<string, unknown> {
  const bySlot = new Map<
    string,
    {
      neededBy: string[];
      pendingFor: string[];
      files: Set<string>;
      uses: SlotUsePlace[];
      deliverTo?: string;
    }
  >();
  const orphans = new Set<string>();

  // What every deployment SAW, minus what any deployment ASKED FOR. Computed
  // across all of them because an image used by one deployment is legitimately
  // unused by the others: judging it per deployment reported every
  // tenant-specific image as an orphan, which is noise that trains people to
  // ignore the one report that matters.
  const seen = new Set<string>();
  const asked = new Set<string>();

  for (const { tenant, entries, indexed } of perTarget) {
    for (const slot of indexed) seen.add(slot);
    for (const entry of entries) {
      asked.add(entry.slot);
      let acc = bySlot.get(entry.slot);
      if (!acc) {
        acc = { neededBy: [], pendingFor: [], files: new Set(), uses: [] };
        bySlot.set(entry.slot, acc);
      }
      acc.neededBy.push(tenant);
      // Resolution is PER DEPLOYMENT, so one slot can be delivered for one and
      // missing for another the moment anybody adds a tenant-specific image.
      // Collapsing that to a single state would report the slot as done while a
      // deployment still renders the placeholder.
      if (entry.state === "pending") {
        acc.pendingFor.push(tenant);
        if (acc.deliverTo === undefined && entry.deliverTo !== undefined) {
          acc.deliverTo = entry.deliverTo;
        }
      }
      else if (entry.file) acc.files.add(entry.file);
      for (const use of entry.uses) {
        if (!acc.uses.some((u) => u.nodeId === use.nodeId)) acc.uses.push(use);
      }
    }
  }

  for (const slot of seen) if (!asked.has(slot)) orphans.add(slot);

  const all: RequestedImage[] = [...bySlot.entries()].map(([slot, acc]) => ({
    slot,
    neededBy: acc.neededBy,
    uses: acc.uses,
    ...(acc.pendingFor.length > 0
      ? {
          pendingFor: acc.pendingFor,
          deliverTo: {
            // From the resolver, never rebuilt here — see ManifestSlot.deliverTo.
            shared: acc.deliverTo ?? `${COMMON_SET}/${slot}.png`,
            // The axis's own name, because this template names a FOLDER and the
            // folder is the axis value. Hardcoding `tenant` pointed the
            // delivering team at a directory that will never exist for a manual
            // conditioned on anything else.
            override: `<${primaryAxis(config)}>/${slot}.png`,
          },
        }
      : {}),
    ...(acc.files.size > 0 ? { files: [...acc.files].sort() } : {}),
  }));

  const pending = all.filter((i) => i.pendingFor !== undefined);
  // What one target IS, in the words the manual's own config uses for it. The
  // label falls back to the axis name, so a config that omits it still reads.
  const axis = primaryAxis(config);
  const perTargetNoun = (config.axes[axis]?.label ?? axis).toLowerCase();

  return {
    manual: config.manual.id,
    contentVersion: config.manual.contentVersion,
    // Spelled out in the file itself: whoever opens it may never have read the
    // repository's documentation.
    convention: {
      resolution: [
        `<${axis}>/<slot path>.<ext> — an image made for that one ${perTargetNoun}`,
        `${COMMON_SET}/<slot path>.<ext> — one image valid for every ${perTargetNoun} (preferred)`,
        "otherwise the pending placeholder renders in its place",
      ],
      slotPath: "a slot's dots are folders: `barra.filtro.fig` -> `barra/filtro/fig`",
      extensions: "png, jpg, jpeg, svg, webp or gif — the slot never names one",
      root: "manuals/<manual>/assets/figures/",
      preferShared:
        `deliver to ${COMMON_SET}/ unless the screen genuinely differs by ` +
        `deployment — six copies of one icon are six things to update`,
    },
    deploymentsCovered: perTarget.map((t) => t.tenant),
    deploymentsConfigured: config.targets.length,
    counts: { total: all.length, delivered: all.length - pending.length, pending: pending.length },
    pending,
    delivered: all.filter((i) => i.pendingFor === undefined),
    ...(orphans.size > 0 ? { undeclared: [...orphans].sort() } : {}),
  };
}

/**
 * Report images sitting on disk that no slot asked for.
 *
 * This is the one failure this whole scheme exists to catch: a delivery named
 * `barra/buscar.png` when the slot is `barra.busqueda` leaves the page showing
 * a placeholder while the build reports success. Silence there would mean
 * finding out from the client.
 */
function printUndeclaredImages(undeclared: ReadonlySet<string>): void {
  if (undeclared.size === 0) return;
  const noun = undeclared.size === 1 ? "image" : "images";
  console.log(
    `\n${undeclared.size} delivered ${noun} that no content asked for — a slot ` +
      `renamed, or a delivery misnamed:`,
  );
  for (const slot of [...undeclared].sort()) console.log(`    ${slot}`);
}

/**
 * Print collected literal-number/reference/anchor warnings, grouped by file
 * and counted. Non-blocking — see `ContentWarning` — the build has already
 * succeeded by the time this runs; the author decides what to do with them.
 */
function printWarnings(warnings: readonly ContentWarning[]): void {
  if (warnings.length === 0) return;
  const byFile = new Map<string, ContentWarning[]>();
  for (const warning of warnings) {
    const forFile = byFile.get(warning.file) ?? [];
    forFile.push(warning);
    byFile.set(warning.file, forFile);
  }
  const noun = warnings.length === 1 ? "reference" : "references";
  console.log(`\n${warnings.length} possible numeric ${noun} (build not blocked):`);
  for (const [file, forFile] of byFile) {
    console.log(`  ${file} (${forFile.length}):`);
    for (const warning of forFile) {
      console.log(`    [${warning.nodeId}] ${warning.message}`);
    }
  }
}

/** Where one slot is used: enough for the producer to know what to capture. */
interface SlotUsePlace {
  readonly nodeId: string;
  readonly blockType: string;
  readonly shows: string;
}

/** One slot in the image manifest, with every place that uses it. */
interface ManifestSlot {
  readonly slot: string;
  readonly state: ManifestImage["state"];
  readonly file?: string;
  /**
   * Where a pending image must be delivered, exactly as the resolver produced it.
   *
   * Carried through rather than recomputed here. It was recomputed once, and the
   * two copies immediately disagreed: the draft printed a flat name while this
   * document still asked for a folder tree, so the same image had two answers
   * depending on which artefact somebody happened to be holding.
   */
  readonly deliverTo?: string;
  readonly uses: SlotUsePlace[];
}

/**
 * Group a target's slot uses into manifest entries, in first-appearance order.
 *
 * Two places may share one slot on purpose — an icon used in a table and again
 * in a procedure step — so the manifest lists the image once and every place it
 * appears, rather than asking for it twice.
 */
function manifestSlots(
  uses: readonly ImageSlotUse[],
  resolve: (slot: string) => ManifestImage,
): ManifestSlot[] {
  const bySlot = new Map<string, ManifestSlot>();
  for (const use of uses) {
    const place: SlotUsePlace = {
      nodeId: use.nodeId,
      blockType: use.blockType,
      shows: use.shows,
    };
    const entry = bySlot.get(use.slot);
    if (entry) {
      entry.uses.push(place);
      continue;
    }
    const resolved = resolve(use.slot);
    bySlot.set(use.slot, {
      slot: use.slot,
      state: resolved.state,
      ...(resolved.file ? { file: resolved.file } : {}),
      ...(resolved.deliverTo ? { deliverTo: resolved.deliverTo } : {}),
      uses: [place],
    });
  }
  return [...bySlot.values()];
}

/**
 * Resolve an axis value's display name for client-facing text (e.g. the
 * cover page).
 *
 * An axis value that is not declared in `manual.config.yaml` is a build
 * error, never a stringified fallback — printing a literal id (or worse,
 * `"undefined"`) on a client-facing cover page is exactly the kind of trace
 * of the pipeline's internals invariant 4 forbids.
 */
export function axisValueName(config: ManualConfig, axis: string, valueId: string): string {
  const found = config.axes[axis]?.values.find((v) => v.id === valueId);
  if (!found) {
    throw new Error(
      `axis "${axis}" has no declared value "${valueId}" in manual.config.yaml — ` +
        `add it to \`axes.${axis}.values\` before building.`,
    );
  }
  return found.name;
}

/** Read a required axis value off a target, after config validation has guaranteed it is present. */
function requireAxisValue(target: BuildTarget, axis: string): string {
  const value = target[axis];
  if (value === undefined) {
    throw new Error(
      `no value for axis "${axis}" on this target — \`axes\` and \`targets\` ` +
        `disagree in manual.config.yaml.`,
    );
  }
  return value;
}

/**
 * The axis the outputs are named and organised by.
 *
 * Read from the config rather than assumed, because the engine conditions on
 * whatever axis a target names and tenant is one named axis among possible
 * others. Asking for a `tenant` key here made that untrue in practice: a manual
 * conditioned on permissions could not be built at all, and the only way to make
 * it build was to call a permission profile a deployment — on the cover, in the
 * filename and in the figure folders, in a document that goes to a client.
 *
 * The rule itself lives in `soleAxis` (`axis.ts`), which `extract` also uses:
 * the map and the documents cannot be allowed to disagree about what a manual
 * varies on.
 */
export function primaryAxis(config: ManualConfig): string {
  return soleAxis(Object.keys(config.axes));
}

/**
 * One target's output filename, with the axis token expanded by the axis's own
 * name.
 *
 * `{contentVersion}` expands to the version DELIVERED to this target, which is
 * the highest row of its change log — not `manual.contentVersion`, which is one
 * scalar per manual and cannot differ between `north` and `south`. The token keeps
 * its name because four config files spell it; what it resolves to changed.
 */
export function outputFilename(
  config: ManualConfig,
  target: BuildTarget,
  version: string,
): string {
  const axis = primaryAxis(config);
  return config.output.filename
    .replace(`{${axis}}`, requireAxisValue(target, axis))
    .replace("{contentVersion}", version);
}

/**
 * The name a WORKING build carries: `…-trabajo-08.pdf`, never a version.
 *
 * Substitutes the template's whole `v{contentVersion}` segment rather than the
 * token alone, because the `v` belongs to the version and a file called
 * `…-vtrabajo-08.pdf` would read as a version with a typo in it. Every config
 * spells the segment that way; a template that writes the token bare still
 * works, it just keeps whatever prefix it chose.
 */
export function workFilename(
  config: ManualConfig,
  target: BuildTarget,
  workNumber: number,
): string {
  const axis = primaryAxis(config);
  const stamp = workStamp(workNumber);
  const named = config.output.filename.replace(`{${axis}}`, requireAxisValue(target, axis));
  return named.includes("v{contentVersion}")
    ? named.replace("v{contentVersion}", stamp)
    : named.replace("{contentVersion}", stamp);
}

/**
 * Parse `--tenant <id>` and the general `--axis <name>=<value>` form into a
 * map of axis id -> value to filter build targets by.
 *
 * `--tenant` is shorthand for `--axis tenant=<id>` — kept so a second axis
 * never needs a new CLI surface (see `packages/cli/AGENTS.md`).
 */
export function parseAxisFilters(args: readonly string[]): Map<string, string> {
  const filters = new Map<string, string>();
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--tenant") {
      const value = args[i + 1];
      if (!value) throw new Error("--tenant requires a value");
      filters.set("tenant", value);
      i += 1;
    } else if (arg === "--axis") {
      const pair = args[i + 1];
      if (!pair) throw new Error("--axis requires a value in the form <name>=<value>");
      const eq = pair.indexOf("=");
      if (eq <= 0) {
        throw new Error(`--axis value "${pair}" must be in the form <name>=<value>`);
      }
      filters.set(pair.slice(0, eq), pair.slice(eq + 1));
      i += 1;
    }
  }
  return filters;
}

/** Everything both commands need before they diverge. */
interface LoadedManual {
  readonly config: ManualConfig;
  readonly doc: ManualDocument;
  readonly warnings: readonly ContentWarning[];
  /** Gaps the sections declare, before conditioning narrows them per target. */
  readonly pending: readonly PendingDeclaration[];
  /** Where each quoted UI label was copied from. Not conditioned: a label the
   * product renamed is wrong in every document that shows it. */
  readonly labels: readonly LabelCitation[];
  readonly targets: readonly BuildTarget[];
  readonly figuresDir: string;
  /**
   * The manual's own brand mark as a data URI, or undefined if it ships none.
   *
   * Read here rather than in the renderer, and inlined rather than linked,
   * because the cover cannot fall back to a placeholder the way a figure can.
   */
  readonly coverMark: string | undefined;
}

/**
 * Read the config, parse the content and select the targets to work on.
 *
 * Shared so `build` and `images` can never disagree about which deployments
 * exist or which content they are looking at — an export that described a
 * different set of slots than the PDFs is worse than no export.
 */
function loadManual(manualDir: string, filters: ReadonlyMap<string, string>): LoadedManual {
  const configFile = join(manualDir, "manual.config.yaml");
  const parsed = manualConfigSchema.safeParse(parseYaml(readFileSync(configFile, "utf8")));
  if (!parsed.success) {
    const detail = parsed.error.issues
      .map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`)
      .join("; ");
    throw new ContentError(configFile, "manual.config", `invalid manual configuration — ${detail}`);
  }
  const config = parsed.data;
  const { doc, warnings, pending, labels } = loadDocument(manualDir, config);

  const targets = config.targets.filter((t) =>
    [...filters.entries()].every(([axis, value]) => t[axis] === value),
  );
  if (targets.length === 0) {
    const desc = [...filters.entries()].map(([axis, value]) => `${axis}=${value}`).join(", ");
    throw new Error(`No target matches ${desc || "(no filter)"}`);
  }

  return {
    config,
    doc,
    warnings,
    pending,
    labels,
    targets,
    figuresDir: join(manualDir, "assets", "figures"),
    coverMark: readCoverMark(manualDir),
  };
}

/**
 * The brand mark a manual ships, base64'd for inlining, or undefined.
 *
 * By convention, not configuration: `assets/brand/mark.png` under the manual.
 * A manual that has none keeps the drawn fallback in the renderer, which is why
 * this is allowed to be absent instead of being an error — Atlas's document
 * is already delivered and ships no such file.
 *
 * PNG only, deliberately. The one mark this exists for has no vector source
 * anywhere in the product, and accepting several formats would invite guessing
 * at which one a cover should prefer.
 */
function readCoverMark(manualDir: string): string | undefined {
  const file = join(manualDir, "assets", "brand", "mark.png");
  if (!existsSync(file)) return undefined;
  return `data:image/png;base64,${readFileSync(file).toString("base64")}`;
}

/**
 * Resolve one target's image slots.
 *
 * Slots are collected from the CONDITIONED manual, so a deployment is never
 * asked for an image of a control it does not have. `undeclared` can only be
 * read after every slot has been resolved, which is why the index is returned
 * alongside rather than queried here.
 */
function resolveTargetImages(
  manual: ReturnType<typeof assemble>,
  figuresDir: string,
  tenant: string,
): {
  entries: ManifestSlot[];
  slots: Map<string, string>;
  images: ImageIndex;
  uses: readonly ImageSlotUse[];
} {
  const uses = collectSlots(manual, catalog);
  const images = buildImageIndex(figuresDir, tenant);
  const entries = manifestSlots(uses, (slot) => images.resolve(slot));
  return { entries, slots: new Map(uses.map((u) => [u.nodeId, u.slot])), images, uses };
}

/**
 * Shoot the pending figures off the running product.
 *
 * Deliberately its own command rather than a flag on `build`: it needs the
 * product up, a login, and a network, none of which a build may ever depend on.
 */
async function capture(
  manualDir: string,
  filters: ReadonlyMap<string, string>,
  only: readonly string[],
): Promise<void> {
  const { config, doc, targets, figuresDir } = loadManual(manualDir, filters);
  const target = targets[0];
  if (!target) throw new Error("no deployment selected — pass --tenant");
  const tenant = requireAxisValue(target, primaryAxis(config));
  const manual = assemble(doc, target, catalog);
  const { entries } = resolveTargetImages(manual, figuresDir, tenant);
  const pending = new Set(entries.filter((e) => e.state === "pending").map((e) => e.slot));

  // The login lives in a gitignored file at the repository root, next to the
  // committed template. A value already in the environment WINS: a one-off run
  // against another deployment should not need the file edited and put back.
  const envPath = resolve(process.cwd(), CREDENTIALS_FILE);
  if (existsSync(envPath)) {
    for (const [k, v] of Object.entries(parseEnvFile(readFileSync(envPath, "utf8")))) {
      if (process.env[k] === undefined) process.env[k] = v;
    }
    console.log(`  login read from ${CREDENTIALS_FILE}`);
  }

  const recipePath = join(manualDir, "capture-recipes.yaml");
  if (!existsSync(recipePath)) {
    throw new Error(`no capture recipes at ${recipePath}. Nothing to shoot.`);
  }
  const recipes = parseRecipes(parseYaml(readFileSync(recipePath, "utf8")));
  const chosen =
    only.length === 0 ? recipes.recipes : recipes.recipes.filter((r) => only.includes(r.slot));
  if (only.length > 0 && chosen.length !== only.length) {
    const missing = only.filter((s) => !chosen.some((r) => r.slot === s));
    throw new Error(`--only names slots with no recipe: ${missing.join(", ")}`);
  }

  const plan = planCaptures(chosen, pending);
  // Bound to a const so the narrowing survives into the call below; through a
  // boolean it does not, and the two modes take different arguments.
  const recipeTarget = recipes.target;
  if (isAttachTarget(recipeTarget)) {
    console.log(
      `  attaching to ${recipeTarget.attach.browserURL} — a person signs in, this joins`,
    );
  } else {
    // Resolved BEFORE the browser opens: a tenant with no deployment is a typo
    // in a flag, and it should cost nothing to find out.
    console.log(`  ${tenant} -> ${deploymentFor(recipes, tenant).baseUrl}`);
  }
  console.log(`  ${plan.ready.length} recipe(s) to shoot, ${plan.uncovered.length} pending slot(s) with no recipe yet`);
  if (plan.ready.length === 0) return;

  const results = isAttachTarget(recipeTarget)
    ? await runAttachedCaptures(recipeTarget.attach, plan.ready, figuresDir, (line) =>
        console.log(line),
      )
    : await runCaptures(
        recipes,
        deploymentFor(recipes, tenant),
        tenant,
        plan.ready,
        figuresDir,
        (line) => console.log(line),
      );
  const ok = results.filter((r) => r.ok).length;
  console.log(`\n  ${ok} of ${results.length} captured`);
  // Same discipline the manifest check enforces: a capture is only real once the
  // slot it was aimed at stops being pending. Re-export and look.
  if (ok > 0) console.log(`  now re-run \`images ${basename(manualDir)}\` — pending must drop by exactly ${ok}`);
}

/** Export the image request document. Needs no renderer, so no browser. */
function exportImages(
  manualDir: string,
  filters: ReadonlyMap<string, string>,
  outPath: string,
): void {
  const { config, doc, targets, figuresDir } = loadManual(manualDir, filters);

  const perTarget = targets.map((target) => {
    const tenant = requireAxisValue(target, primaryAxis(config));
    const manual = assemble(doc, target, catalog);
    const { entries, images } = resolveTargetImages(manual, figuresDir, tenant);
    return { tenant, entries, indexed: images.indexed() };
  });

  const report = imageRequests(config, perTarget);
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");

  const counts = report["counts"] as { total: number; delivered: number; pending: number };
  console.log(
    `  ${counts.total} image slot(s): ${counts.delivered} delivered, ${counts.pending} pending`,
  );
  console.log(`  -> ${outPath}`);
  printUndeclaredImages(new Set((report["undeclared"] as string[] | undefined) ?? []));
}

/**
 * Where the image request document is written: `--out <path>`, or next to the
 * manual by default.
 *
 * The default deliberately sits OUTSIDE `output/`, which `.gitignore` excludes.
 * This file is a request handed to another team, not a build artefact — if it
 * only existed for whoever last ran a build, the team producing the images
 * could not read it at all.
 */
export function parseOutPath(
  args: readonly string[],
  manualId: string,
  defaultName = "image-requests.json",
): string {
  const flag = args.indexOf("--out");
  if (flag === -1) return `manuals/${manualId}/${defaultName}`;
  const value = args[flag + 1];
  if (!value || value.startsWith("--")) {
    throw new Error("--out requires a path, e.g. `--out requests/atlas.json`");
  }
  return value;
}

/** The queue's default filename, beside the manual and outside `output/`. */
export const AWAITING_FILE = "awaiting-product.json";

/**
 * Export the queue of parts the manual is waiting on the product for.
 *
 * Its own command rather than build output, for the reason the image manifest is
 * one: a queue only whoever last ran a build can see is not a queue, and this
 * file is committed so the debt is visible in review rather than in somebody's
 * terminal.
 */
function exportAwaiting(
  manualDir: string,
  filters: ReadonlyMap<string, string>,
  outPath: string,
): void {
  const { config, doc, pending, targets } = loadManual(manualDir, filters);

  const perTarget: TargetPending[] = targets.map((target) => {
    const value = requireAxisValue(target, primaryAxis(config));
    // Conditioned first, exactly as image slots are: a gap inside content this
    // target never ships is not this target's debt.
    const manual = assemble(doc, target, catalog);
    return { value, entries: collectPending(manual, pending) };
  });

  const report = awaitingProduct(config, perTarget);
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, `${JSON.stringify(report, null, 2)}
`, "utf8");

  const counts = report["counts"] as { gaps: number; sections: number };
  console.log(
    counts.gaps === 0
      ? `  nothing queued — no section declares a part of the product it leaves undescribed`
      : `  ${counts.gaps} gap(s) awaiting the product, across ${counts.sections} section(s)`,
  );
  console.log(`  -> ${outPath}`);
}

/**
 * Mark a draft's filename so it can never be mistaken for the deliverable.
 *
 * `manual-operador-north-v0.1.0.pdf` -> `manual-operador-north-v0.1.0-BORRADOR.pdf`.
 * A draft carries slot names — pipeline internals invariant 4 keeps out of
 * client-facing output — so the two files must not be distinguishable only by
 * their contents.
 */
export function draftFilename(name: string): string {
  const dot = name.lastIndexOf(".");
  return dot <= 0 ? `${name}-BORRADOR` : `${name.slice(0, dot)}-BORRADOR${name.slice(dot)}`;
}

/**
 * The Word deliverable, beside the PDF that was just printed.
 *
 * Deliberately built FROM the paginated HTML rather than instead of it: the
 * cover is shot off the sheet the printer laid out, so the two documents open on
 * the same page rather than on two attempts at composing it.
 *
 * Word cannot reference a file the way `<img src>` can, so every picture is read
 * and — for the two formats OOXML does not embed — redrawn before it is handed
 * over. That work lives here because resolving and reading assets is the CLI's
 * job; the renderer is given bytes and stays free of the filesystem.
 */
async function buildDocx(
  manual: ResolvedManual,
  htmlPath: string,
  docxPath: string,
  slots: ReadonlyMap<string, string>,
  images: { readonly resolve: (slot: string) => { readonly url: string; readonly state: string } },
  theme: Tokens,
  cover: CoverData,
  header: string,
  footerNote: string,
  vendor: string,
): Promise<void> {
  const used = [...new Set(slots.values())];
  const pathFor = new Map(used.map((slot) => [slot, fileURLToPath(images.resolve(slot).url)]));
  const rasters = await rasterise([...pathFor.values()], dirname(docxPath));
  const coverShot = await shootFirstPage(htmlPath);

  const assets: DocxAssetResolver = (slot) => {
    const path = pathFor.get(slot);
    if (path === undefined) return undefined;
    const raster = rasters.get(path);
    if (raster === undefined) return undefined;
    return {
      data: raster.data,
      type: raster.type,
      widthPx: raster.widthPx,
      heightPx: raster.heightPx,
      pending: images.resolve(slot).state === "pending",
    };
  };

  const docx = await renderDocx(manual, {
    header,
    cover,
    coverImage: {
      data: coverShot.data,
      type: coverShot.type,
      widthPx: coverShot.widthPx,
      heightPx: coverShot.heightPx,
      pending: false,
    },
    slots,
    assets,
    figures: manual.figures,
    theme,
    footerNote,
    vendor,
  });
  writeFileSync(docxPath, docx);
}

/**
 * Promote a manual to an official delivery: render it, archive it, stamp it.
 *
 * RENDERS THE OFFICIAL DOCUMENT ITSELF rather than looking for one. Ordinary
 * builds are named by their working number, so no `…-v1.0.1.pdf` exists until
 * this runs — which removes the whole class of mistake where the file in
 * `output/` was named after a version but built from different content.
 *
 * REFUSES ON A DIRTY TREE, first and before anything else. The proof records
 * the commit the files were built from; with uncommitted changes that commit
 * does not describe the bytes being archived, and the record would be wrong
 * from the moment it was written. A wrong proof is worse than none, because it
 * looks like authority. It is also what forces the change-log row to be
 * committed BEFORE the delivery runs: the row is part of the document.
 *
 * Only ever STAMPS a row that already declares the version. When none does, it
 * archives, says so, and stops — writing that row means summarising what
 * changed for the reader, which is judgement, and this command has none.
 */
async function deliverManual(
  manualDir: string,
  filters: ReadonlyMap<string, string>,
  args: readonly string[],
): Promise<number> {
  const { config, doc, targets } = loadManual(manualDir, filters);
  const axis = primaryAxis(config);
  const outDir = join(manualDir, config.output.dir);
  const repoRoot = resolve(process.cwd());

  const dirty = isDirty(repoRoot);
  if (dirty !== false) {
    const why = dirty === null ? " (o git no responde)" : "";
    console.error(
      [
        ``,
        `el árbol tiene cambios sin commitear${why}.`,
        `  La prueba de entrega guarda el commit del que salieron los archivos. Con`,
        `  cambios sin commitear ese commit no describe lo que se archivaría, y una`,
        `  prueba equivocada es peor que ninguna: parece autoridad.`,
      ].join("\n"),
    );
    return 1;
  }
  const commit = headCommit(repoRoot);
  if (commit === null) {
    console.error("\nno se puede leer el commit de HEAD, y sin él la entrega no queda anclada.");
    return 1;
  }

  const at = args.indexOf("--version");
  const asked = at === -1 ? undefined : args[at + 1];

  // One expected name per target, built from the same template the build used —
  // so a draft or a superseded build is never even a candidate.
  const expected = new Map<string, readonly string[]>();
  let version: string | undefined = asked;
  for (const target of targets) {
    const value = requireAxisValue(target, axis);
    const assembled = assemble(doc, target, catalog);
    const targetVersion =
      asked ?? deliveredVersion(assembled.children, config.manual.contentVersion);
    version ??= targetVersion;

    if (deliveryProofFor(assembled.children, targetVersion, value) !== undefined) {
      console.error(
        [
          ``,
          `${value} ya tiene la versión ${targetVersion} entregada. Una entrega es un hecho:`,
          `  para publicar cambios hace falta una versión nueva, no reescribir ésta.`,
        ].join("\n"),
      );
      return 1;
    }

    const pdf = outputFilename(config, target, targetVersion);
    expected.set(value, [pdf, pdf.replace(/\.pdf$/, ".docx")]);
  }
  if (version === undefined) {
    console.error("\nno hay targets que entregar con los filtros dados.");
    return 1;
  }

  // THE OFFICIAL DOCUMENT IS RENDERED HERE, and this is the only place that
  // renders one. Ordinary builds are named by their working number, so a
  // `…-v1.0.1.pdf` cannot exist until a delivery decides it should — which
  // means the file being archived was built from the commit the proof names,
  // in this run, rather than found in a directory and assumed to match.
  console.log(`  construyendo el documento oficial v${version}`);
  await build(manualDir, filters, false, false, true, version);

  const { plan, missing } = planDelivery(outDir, version, expected);
  if (missing.length > 0) {
    console.error(
      [
        ``,
        `el documento oficial de ${missing.join(", ")} no quedó en output/ después de`,
        `  construirlo. Eso es un fallo del build, no algo que corregir a mano: revise`,
        `  lo que imprimió arriba antes de volver a intentar.`,
      ].join("\n"),
    );
    return 1;
  }

  const { copied, refused } = archive(join(repoRoot, "deliveries"), config.manual.id, plan);
  for (const name of copied) {
    console.log(`  archivado -> deliveries/${config.manual.id}/${name}`);
  }
  if (refused.length > 0) {
    console.error(
      [
        ``,
        `${refused.length} archivo(s) ya estaban archivados y NO se pisaron: ${refused.join(", ")}.`,
        `  Un archivo ahí es uno que un cliente recibió, y la prueba del repositorio`,
        `  habla de esos bytes exactos.`,
      ].join("\n"),
    );
    return 1;
  }

  const sectionFile = changeLogSectionFile(manualDir);
  const stamped =
    sectionFile !== null && stampFile(sectionFile, version, { commit, files: plan });
  if (!stamped) {
    console.log(
      [
        ``,
        `  archivado, pero NINGUNA fila declara la versión ${version}.`,
        `  Falta escribirla, y eso es resumir qué cambió para el lector: criterio,`,
        `  no cálculo. Corra el asistente para que un agente la redacte.`,
      ].join("\n"),
    );
    return 0;
  }

  console.log(
    `  sellada la fila ${version} en ${basename(sectionFile as string)} (commit ${commit.slice(0, 7)})`,
  );

  // --- the stamp is committed here, and that is not a convenience -----------
  //
  // The stamp is the ONLY thing that makes the archived file verifiable.
  // Leaving it uncommitted opens a window where the delivery is permanent —
  // `archive` refuses to overwrite — while the proof of it can still vanish
  // under a `git checkout`. That window is precisely what the proof exists to
  // close, so leaving it open was the defect.
  //
  // Safe HERE and not in general, for one reason: this command refuses to start
  // on a dirty tree, so its own stamp is the only change in existence by now.
  // Nothing unrelated can be swept in.
  //
  // Nothing in the message is a judgement — manual, target, version, all
  // derived. And of every step in a delivery this is the LEAST irreversible: a
  // commit can be amended or reset, an archived file cannot be un-archived.
  const targetLabel = [...expected.keys()].join(", ");
  const committed = commitFile(
    repoRoot,
    sectionFile as string,
    `chore(deliver): ${config.manual.id} ${targetLabel} v${version} — sello de entrega`,
  );
  if (!committed) {
    console.error(
      [
        ``,
        `ARCHIVADO Y SELLADO, pero el commit del sello FALLÓ.`,
        `  Los archivos ya están en deliveries/ y no se pisan, así que esto no se`,
        `  deshace: lo que falta es dejar la prueba en la historia. Commitee a mano`,
        `  ${basename(sectionFile as string)} antes de seguir, o el PDF archivado queda`,
        `  sin nada que lo verifique.`,
      ].join("\n"),
    );
    return 1;
  }
  console.log(`  commiteado el sello`);
  return 0;
}

/**
 * Undo a delivery that never left the building.
 *
 * THIS EXISTS FOR A MISTAKE OF OURS, never for a document somebody received.
 * Everything else in this pipeline is built to make a delivery unerasable —
 * `archive` refuses to overwrite, the proof is committed, a delivered version
 * cannot be delivered again — and all of that is correct. What those guards
 * protect is a FACT ABOUT THE WORLD: a client has a PDF. When nobody received
 * anything, the only fact is about our own machinery, and a wrong record of our
 * machinery is worth removing rather than preserving.
 *
 * The repository cannot tell the two apart, so it does not try to guess:
 * `--not-handed-over` is the caller ASSERTING it. The flag is the assertion, it
 * is required, and it is what a reader of a shell history sees.
 *
 * NEVER REWRITES HISTORY. The stamp's commit stays and a commit undoing it is
 * added, so anyone reading the table in six months can tell "never delivered"
 * from "delivered and undone". A clean history bought by erasing a commit would
 * be a history that answers that question wrong.
 */
async function undeliverManual(
  manualDir: string,
  filters: ReadonlyMap<string, string>,
  args: readonly string[],
): Promise<number> {
  const { config, doc, targets } = loadManual(manualDir, filters);
  const axis = primaryAxis(config);
  const repoRoot = resolve(process.cwd());

  if (!args.includes("--not-handed-over")) {
    console.error(
      [
        ``,
        `falta --not-handed-over, y no es burocracia.`,
        `  Este comando borra archivos de deliveries/ y saca la prueba de la fila.`,
        `  Sobre un documento que un cliente YA TIENE, eso deja al repositorio`,
        `  afirmando que no existe algo que existe — y para publicar un cambio hace`,
        `  falta una versión nueva, no borrar la anterior.`,
        `  El repositorio no puede saber si salió. Usted sí, y el flag es decirlo.`,
      ].join("\n"),
    );
    return 1;
  }

  const at = args.indexOf("--version");
  const version = at === -1 ? undefined : args[at + 1];
  if (version === undefined) {
    console.error("\nfalta --version <N.N.N>: qué entrega se deshace.");
    return 1;
  }

  // Same reason `deliver` refuses: the commit at the end is only safe while
  // this command's own change is the only one in the tree.
  const dirty = isDirty(repoRoot);
  if (dirty !== false) {
    const why = dirty === null ? " (o git no responde)" : "";
    console.error(
      [
        ``,
        `el árbol tiene cambios sin commitear${why}.`,
        `  Deshacer termina en un commit, y con otros cambios sueltos ese commit se`,
        `  llevaría trabajo que nadie pidió deshacer.`,
      ].join("\n"),
    );
    return 1;
  }

  const sectionFile = changeLogSectionFile(manualDir);
  if (sectionFile === null) {
    console.error("\neste manual no tiene Historial de cambios, así que no tiene nada entregado.");
    return 1;
  }

  const undone: { value: string; files: readonly string[] }[] = [];
  for (const target of targets) {
    const value = requireAxisValue(target, axis);
    const assembled = assemble(doc, target, catalog);
    if (deliveryProofFor(assembled.children, version, value) === undefined) {
      console.error(
        [
          ``,
          `${value} no tiene la versión ${version} entregada, así que no hay nada que`,
          `  deshacer. Nada se tocó.`,
        ].join("\n"),
      );
      return 1;
    }
  }

  // Split from the check above ON PURPOSE: nothing is deleted until every
  // target asked for has been confirmed as deliverable-back. A run that undid
  // `north` and then refused on `south` would leave half a delivery, and half a
  // delivery is the state this whole flow exists to prevent.
  for (const target of targets) {
    const value = requireAxisValue(target, axis);
    const named = unstampFile(sectionFile, version, value);
    if (named === null) {
      console.error(`\nla prueba de ${value} desapareció entre la lectura y el borrado.`);
      return 1;
    }
    for (const file of named) {
      const path = join(repoRoot, "deliveries", config.manual.id, file);
      if (existsSync(path)) {
        unlinkSync(path);
        console.log(`  borrado -> deliveries/${config.manual.id}/${file}`);
      } else {
        console.log(`  ya no estaba -> deliveries/${config.manual.id}/${file}`);
      }
    }
    undone.push({ value, files: named });
  }

  const label = undone.map((u) => u.value).join(", ");
  console.log(`  quitada la prueba de ${label} en la fila ${version}`);

  const committed = commitFile(
    repoRoot,
    sectionFile,
    `revert(deliver): ${config.manual.id} ${label} v${version} — entrega deshecha, no salió`,
  );
  if (!committed) {
    console.error(
      [
        ``,
        `BORRADO Y QUITADA LA PRUEBA, pero el commit FALLÓ.`,
        `  Commitee a mano ${basename(sectionFile)}, o la fila queda diciendo una cosa`,
        `  en el árbol y otra en la historia.`,
      ].join("\n"),
    );
    return 1;
  }
  console.log(`  commiteado`);
  console.log(``);
  console.log(`  ${version} vuelve a estar disponible para entregar.`);
  return 0;
}

/**
 * Render a manual's targets into `output/`.
 *
 * TWO KINDS OF BUILD, and the difference is what the files are called. A
 * working build is named by the next working number and is what every ordinary
 * run produces; an OFFICIAL build is named by a version and is produced only
 * from inside a delivery, which is the one moment a version is authorised.
 * Both go through this same function on purpose — a delivery rendered by a
 * second code path would be the one document nobody had tested.
 */
async function build(
  manualDir: string,
  filters: ReadonlyMap<string, string>,
  draft: boolean,
  wantPendingTable: boolean,
  wantDocx: boolean,
  /** Set only by a delivery: the version being promoted. */
  official: string | null = null,
): Promise<void> {
  const { config, doc, warnings, pending, targets, figuresDir, coverMark } = loadManual(
    manualDir,
    filters,
  );
  const outDir = join(manualDir, config.output.dir);
  mkdirSync(outDir, { recursive: true });

  // ONE NUMBER PER RUN, read before anything is written so every target this
  // run renders shares it. See `nextWorkNumber`.
  const workNumber =
    official === null ? nextWorkNumber(readdirSync(outDir)) : null;

  const polyfill = pagedRuntime();
  // Undeclared images can only be judged once EVERY target has been resolved —
  // an image one deployment uses is legitimately unused by another.
  const seenOnDisk = new Set<string>();
  const askedFor = new Set<string>();

  for (const target of targets) {
    const manual = assemble(doc, target, catalog);
    const axis = primaryAxis(config);
    const tenant = requireAxisValue(target, axis);
    // Derived from the ASSEMBLED manual, so each target reports the version it
    // actually received. See `deliveredVersion`.
    const version = deliveredVersion(manual.children, config.manual.contentVersion);

    // AN OFFICIAL BUILD MUST BE THE VERSION IT CLAIMS. The version on the page
    // comes from the highest row of this target's change log, so asking for a
    // version no row declares would print one number and file it under
    // another. The row is written before the delivery renders, always — which
    // is why this can be an assertion rather than a fallback.
    if (official !== null && official !== version) {
      throw new Error(
        `official build asked for ${official}, but the highest change-log row for ` +
          `${tenant} is ${version}. The row has to be written and committed before ` +
          `the delivery renders, or the document would print a version it is not.`,
      );
    }

    const base =
      official === null
        ? workFilename(config, target, workNumber as number)
        : outputFilename(config, target, official);
    const name = draft ? draftFilename(base) : base;

    const { entries, slots, images, uses } = resolveTargetImages(manual, figuresDir, tenant);

    const brand = config.manual.brand ?? config.manual.product.toUpperCase();
    const declared = config.manual.theme;
    if (declared !== undefined && !isThemeName(declared)) {
      throw new Error(
        `manual.theme is "${declared}", which is not a theme. Known: ` +
          `${Object.keys(themes).join(", ")}.`,
      );
    }
    // Composed once and handed to every renderer, so the Word deliverable and
    // the PDF cannot disagree about what the document is called.
    //
    // A WORKING BUILD SAYS SO ON EVERY PAGE. `v1.0.0` on its own would be true
    // of the version this content iterates on and false about the document in
    // the reader's hands, and the header is the one line that repeats often
    // enough to be seen. The filename carries the same number; two signals for
    // the same fact is what makes a working build impossible to mistake for a
    // delivered one.
    const stamped =
      workNumber === null
        ? `v${version}`
        : `v${version} · ${workStamp(workNumber).replace("-", " ")}`;
    const headerLine = draft
      ? `BORRADOR INTERNO  |  ${config.manual.title}  |  ${stamped}  |  NO DISTRIBUIR`
      : `${brand}  |  ${config.manual.title}  |  ${stamped}`;
    const cover = {
      // The mark rides on the DRAFT cover too. A draft is for the person taking
      // captures, and a cover that looks like the real one is how they can tell
      // the build is the right build.
      ...(coverMark !== undefined ? { mark: coverMark } : {}),
      brand: draft ? "BORRADOR INTERNO" : brand,
      title: config.manual.title,
      version,
      lede: draft
        ? "Borrador para la toma de capturas. Cada imagen pendiente lleva debajo la ruta y el nombre exactos con los que debe entregarse el archivo. Guárdela tal cual, sin cambiar mayúsculas ni extensión. No distribuir."
        : (config.manual.lede ??
           `Plataforma de Gestión de Incidentes y Seguridad para Operaciones Críticas — ${axisValueName(config, axis, tenant)}.`),
      meta: draft
        ? "© 2026 Vendor  |  Documento de trabajo interno  |  No es la versión para el cliente"
        : "© 2026 Vendor  |  Todos los Derechos Reservados  |  Documento Confidencial",
    };

    const html = renderHtml(manual, {
      ...(declared === undefined ? {} : { theme: themes[declared] }),
      header: headerLine,
      slots,
      images: (slot) => images.resolve(slot),
      figures: manual.figures,
      draft,
      polyfill,
      cover,
    });

    const htmlPath = join(outDir, name.replace(/\.pdf$/, ".html"));
    const pdfPath = join(outDir, name);
    writeFileSync(htmlPath, html, "utf8");
    const { pages, placements } = await printToPdf(htmlPath, pdfPath);

    if (wantDocx) {
      const docxPath = join(outDir, name.replace(/\.pdf$/, ".docx"));
      await buildDocx(
        manual,
        htmlPath,
        docxPath,
        slots,
        images,
        declared === undefined ? themes.atlas : themes[declared],
        cover,
        headerLine,
        "© 2026 Vendor — Confidencial — Uso Interno",
        "VENDOR",
      );
      console.log(`  ${" ".repeat(16)} Word deliverable -> ${basename(docxPath)}`);
    }

    for (const slot of images.indexed()) seenOnDisk.add(slot);
    for (const entry of entries) askedFor.add(entry.slot);
    const delivered = entries.filter((e) => e.state !== "pending").length;

    // Written only when asked for — the same rule the image manifest follows.
    // It does NOT go in `output/`: that directory is generated and ignored, and
    // this is a document someone spends hours writing into. It sits with the
    // manual's own sources so the answers are tracked, diffable, and safe from
    // the next build.
    if (wantPendingTable) {
      const tablePath = join(manualDir, `imagenes-pendientes-${tenant}.md`);
      const table = pendingTable(
        uses,
        new Set(entries.filter((e) => e.state === "pending").map((e) => e.slot)),
        placements,
        existsSync(tablePath) ? readFileSync(tablePath, "utf8") : "",
        // Declared per manual: extraction and capture are different questions,
        // and the wrong one sends the reviewer to a document about another
        // product. See `DEFAULT_PENDING_INSTRUCTION`.
        config.images?.pendingInstruction ?? DEFAULT_PENDING_INSTRUCTION,
      );
      writeFileSync(tablePath, table.markdown, "utf8");
      const kept = table.carriedOver > 0 ? `, ${table.carriedOver} instruction(s) kept` : "";
      console.log(
        `  ${" ".repeat(16)} ${table.rows.length} pending image(s)${kept} -> ${basename(tablePath)}`,
      );
    }

    const sections = manual.children.length;
    const label = Object.entries(target)
      .map(([axis, value]) => `${axis}=${value}`)
      .join(" ");
    console.log(
      `  ${label.padEnd(16)} ${sections} section(s), ${manual.numbers.size} numbered node(s), ` +
        `${pages} page(s), ${delivered}/${entries.length} image(s) -> ${name}`,
    );
  }

  // The build reports the image state but does not write the request document:
  // that is an explicit export (`images`), because it leaves the repository for
  // another team and should not be a side effect nobody asked for.
  // Only every deployment together can answer this. An image one deployment uses
  // is legitimately unused by the others, so a filtered build sees a tenant-specific
  // file as an orphan — `build --tenant south` reported NORTH's map-layer icons as
  // deliveries nobody asked for. Judge it only when the whole set was built.
  if (targets.length === config.targets.length) {
    printUndeclaredImages(new Set([...seenOnDisk].filter((s) => !askedFor.has(s))));
  } else {
    console.log(
      `
  (undeclared-image check skipped: it needs every deployment, and this ` +
        `build covered ${targets.length} of ${config.targets.length})`,
    );
  }
  // Reported, never written. The queue is a committed contract produced by
  // `awaiting`; surfacing the count here is what stops a declared gap being
  // invisible until somebody remembers to run that command.
  if (pending.length > 0) {
    const sections = new Set(pending.map((p) => p.section)).size;
    console.log(
      `\n${pending.length} part(s) of the product awaited, across ${sections} section(s) — ` +
        `those sections are NOT complete. Run \`awaiting ${config.manual.id}\` for the queue.`,
    );
  }
  printWarnings(warnings);
}

/**
 * Format any thrown value into an actionable, single-line message.
 *
 * `ContentError` already carries file/node-id/what-to-do detail, so it is
 * printed as-is. Anything else (a plain `Error` from, e.g., an undeclared
 * axis value or a malformed CLI flag) still gets a message instead of a raw
 * stack trace — see `packages/cli/AGENTS.md`: "Errors are actionable: file,
 * node id, what to do. A stack trace is not an error message."
 */
export function formatCliError(error: unknown): string {
  if (error instanceof ContentError) return `content error: ${error.message}`;
  const message = error instanceof Error ? error.message : String(error);
  return `error: ${message}`;
}

/**
 * Run the CLI for a given argv (excluding `node`/script) and return an exit
 * code, without ever letting an uncaught error escape as a raw stack trace.
 * Kept separate from `main()` so it is testable without exiting the process.
 */
export async function run(argv: readonly string[]): Promise<number> {
  const [command, manualId, ...rest] = argv;
  const axisFlags = "[--tenant <id>] [--axis <name>=<value> ...]";

  // `new` takes no manual id — it is the command that decides what the id will
  // be. Bare invocation opens the same wizard, but only for a human: with no TTY
  // the usage text is still what a script or a pipe gets.
  if (command === "new" || (command === undefined && process.stdin.isTTY)) {
    return runWizard(process.cwd());
  }

  if (
    (command !== "build" &&
      command !== "images" &&
      command !== "awaiting" &&
      command !== "labels" &&
      command !== "extract" &&
      command !== "deliver" &&
      command !== "undeliver" &&
      command !== "capture") ||
    !manualId
  ) {
    console.error(
      `usage: manualforge build <manual> ${axisFlags} [--draft] [--pending-table] [--docx]\n` +
        `       manualforge deliver <manual> ${axisFlags} [--version <x.y.z>]\n` +
        `       manualforge undeliver <manual> ${axisFlags} --version <x.y.z> --not-handed-over\n` +
        `       manualforge images <manual> ${axisFlags} [--out <path>]\n` +
        `       manualforge awaiting <manual> ${axisFlags} [--out <path>]\n` +
        `       manualforge labels <manual>\n` +
        `       manualforge capture <manual> --tenant <id> [--only <slot,...>]\n` +
        `       manualforge extract <manual>\n\n` +
        `  capture  shoot pending figures off the running product, per\n` +
        `           manuals/<manual>/capture-recipes.yaml. Needs the login in the\n` +
        `           environment variables that file NAMES — never in the file.\n` +
        `  deliver  promote what is in output/ to an official delivery: copy the PDF\n` +
        `           and Word file into deliveries/<manual>/, and stamp the change\n` +
        `           log row with the commit and the SHA-256 of each file handed\n` +
        `           over. Refuses on a dirty tree — the recorded commit would not\n` +
        `           describe the archived bytes — and never overwrites a file\n` +
        `           already archived. Drafts are excluded by construction.\n` +
        `  --draft  internal build: prints the filename every pending image must\n` +
        `           be delivered under. Never distribute a draft to a client.\n` +
        `  --pending-table\n` +
        `           also write imagenes-pendientes-<tenant>.md: every pending image\n` +
        `           in reading order with the page it landed on, and a blank column\n` +
        `           to fill in. Page numbers are only true of that render.\n` +
        `  --docx   also write the manual as a Word document, beside the PDF. It\n` +
        `           matches the PDF's type, palette, tables and figures but NOT its\n` +
        `           page breaks: Word reflows, so the page count can differ.\n` +
        `  extract  read the source product and write knowledge/module-map.json,\n` +
        `           reporting what changed since the last map.\n` +
        `  labels   hold every UI label the manual QUOTES against the line it was\n` +
        `           copied from. This product has no i18n catalogue, so a label is a\n` +
        `           copy, and a copy does not follow what it copied. Needs the source\n` +
        `           checked out; reports, never blocks.\n` +
        `  awaiting write awaiting-product.json: the parts of the product that are\n` +
        `           on screen but unfinished, which the manual documents around\n` +
        `           without naming. Declared by a section's \`pending\` list — the\n` +
        `           manual itself never mentions any of it.\n\n` +
        `       manualforge new\n` +
        `  new      interactive: collect which product, what to call its manual and\n` +
        `           how much to attempt, then print the prompt that starts the work.\n` +
        `           Creates nothing — the survey and every file are the agent's job.\n` +
        `           Running with no arguments in a terminal opens the same wizard.`,
    );
    return 2;
  }

  try {
    // Parsing the flags is part of the guarded region: a plain CLI typo like
    // `--tenant` with no following value must be reported the same way as
    // any other build failure, not escape uncaught.
    const filters = parseAxisFilters(rest);
    const manualDir = resolve(process.cwd(), "manuals", manualId);

    const label = [...filters.entries()].map(([axis, value]) => `${axis}=${value}`).join(" ");

    if (command === "extract") {
      const { map, drift, outPath } = extract(process.cwd(), manualId);
      const lowConfidence = map.references.filter((r) => r.confidence === "low").length;
      console.log(
        `  ${map.values.length} ${map.axis} value(s), ${map.capabilities.length} capability ` +
          `flag(s), ${map.references.length} ${map.axis} reference(s) in code` +
          (lowConfidence > 0 ? `, ${lowConfidence} needing review` : ""),
      );
      const contested = map.capabilities.filter((c) => c.absentFrom !== undefined).length;
      if (contested > 0) {
        console.log(
          `  ${contested} flag(s) are declared by some ${map.axis} values and not others — ` +
            `absent is NOT false, see \`absentFrom\``,
        );
      }
      for (const line of map.registryMismatch ?? []) console.log(`  ! ${line}`);
      console.log(`  -> ${outPath}`);
      if (drift.length > 0) {
        console.log(`
${drift.length} change(s) since the previous map:`);
        for (const line of drift) console.log(`    ${line}`);
      }
      return 0;
    }

    if (command === "capture") {
      const at = rest.indexOf("--only");
      const only = at === -1 ? [] : (rest[at + 1] ?? "").split(",").filter(Boolean);
      console.log(`capturing ${manualId}${label ? ` (${label})` : ""}`);
      await capture(manualDir, filters, only);
      return 0;
    }

    if (command === "images") {
      console.log(`exporting image requests for ${manualId}${label ? ` (${label})` : ""}`);
      exportImages(manualDir, filters, resolve(process.cwd(), parseOutPath(rest, manualId)));
      return 0;
    }

    if (command === "labels") {
      console.log(`checking quoted labels for ${manualId} against the product`);
      const { labels } = loadManual(manualDir, filters);
      if (labels.length === 0) {
        console.log(
          `  no label citations — this manual's sections declare none, so nothing ` +
            `here follows the product when it renames a control`,
        );
        return 0;
      }
      const { sourceRoot } = sourceRootFor(process.cwd(), manualId);
      const report = labelReport(checkLabels(sourceRoot, labels));
      const bad = report.total - report.ok;
      console.log(`  ${report.total} cited, ${report.ok} still exact, ${bad} to look at`);
      for (const line of labelLines(report)) console.log(line);
      // Reports, never blocks: what a renamed label should now say is a
      // judgement about the product, not something this command decides.
      return 0;
    }

    if (command === "deliver") {
      console.log(`entregando ${manualId}${label ? ` (${label})` : ""}`);
      return deliverManual(manualDir, filters, rest);
    }

    if (command === "undeliver") {
      console.log(`deshaciendo la entrega de ${manualId}${label ? ` (${label})` : ""}`);
      return undeliverManual(manualDir, filters, rest);
    }

    if (command === "awaiting") {
      console.log(`exporting the product queue for ${manualId}${label ? ` (${label})` : ""}`);
      exportAwaiting(
        manualDir,
        filters,
        resolve(process.cwd(), parseOutPath(rest, manualId, AWAITING_FILE)),
      );
      return 0;
    }

    const draft = rest.includes("--draft");
    console.log(
      `building ${draft ? "DRAFT " : ""}${manualId}${label ? ` (${label})` : ""}` +
        `${draft ? " — internal, shows pending image names" : ""}`,
    );
    await build(
      manualDir,
      filters,
      draft,
      rest.includes("--pending-table"),
      rest.includes("--docx"),
    );
    return 0;
  } catch (error) {
    console.error(`\n${formatCliError(error)}`);
    if (process.env["DEBUG"] && error instanceof Error && error.stack) {
      console.error(error.stack);
    }
    return 1;
  }
}

async function main(): Promise<void> {
  process.exit(await run(process.argv.slice(2)));
}

// Run only when this module is the process entry point — importing it (e.g.
// from tests) must not trigger a CLI invocation.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
