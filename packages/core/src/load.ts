import { parse as parseYaml } from "yaml";
import { selectorSchema } from "@manualforge/blocks";
import type {
  BlockCatalog,
  Inline,
  ManualNode,
  Selector,
} from "@manualforge/blocks";
import type { PendingDeclaration } from "./pending.ts";
import { labelSites, type LabelCitation, type LabelSite } from "./labels.ts";

/**
 * Authoring format for the pipeline spike: YAML mirroring the AST.
 *
 * A node with a `type` is a block; anything else is a section. That shorthand
 * is the only sugar — everything else is the AST verbatim.
 *
 * The friendlier surface (Markdown with container directives) parses into the
 * same AST and is deliberately out of scope here: the spike validates the
 * pipeline, not the authoring ergonomics.
 */

export class ContentError extends Error {
  readonly file: string;
  readonly nodeId: string;

  constructor(file: string, nodeId: string, message: string) {
    super(`${file} [${nodeId}]: ${message}`);
    this.name = "ContentError";
    this.file = file;
    this.nodeId = nodeId;
  }
}

const text = (value: string): Inline[] => [{ kind: "text", value }];

/**
 * An outline-numbering prefix or a whole-string outline number, e.g. the
 * start of "7.2 Barra Superior" or the entirety of "5.2".
 *
 * Three shapes are targeted, deliberately narrower than "a number followed
 * by a space", because authored prose legitimately opens with a quantity —
 * "24 Horas de Soporte", "2 Factores de Autenticación" — and those must not
 * be flagged, while a version string ("1.4.7") or an IP address
 * ("192.168.1.1") must not be flagged either:
 *
 *  - A MULTI-SEGMENT number (at least one dot, e.g. "7.2", "7.1.3") at the
 *    very start of the string, followed by a heading-style separator
 *    (`)`, `:`) or by whitespace then more text — e.g. "5.2 Barra Superior",
 *    "5.2 sistema de alertas". Whatever follows the number, a heading field
 *    starting with a dotted number is outline numbering; there is no
 *    legitimate counter-example (see `tenant-conditioning` Rule 2).
 *  - A dotted number that IS the whole string, restricted to exactly one dot
 *    (two segments) — e.g. the entirety of "5.2". Three or more segments
 *    ("1.4.7", "1.0.0") or four ("192.168.1.1") are left alone: those are
 *    the shape of a version string or an IP address, not a lone section
 *    number, and requiring the keyword-based `OUTLINE_REFERENCE` below is
 *    how a longer dotted reference (e.g. "Figura 7.1.3") still gets caught.
 *  - A SINGLE-SEGMENT number at the very start followed immediately by an
 *    explicit separator (`)`, `:` or `.`) and then more text — e.g. "5) Barra
 *    Superior", "7. Interfaz General", "1. Ingrese sus credenciales". A
 *    single-segment number followed by plain whitespace is NOT enough on
 *    its own: that shape is indistinguishable from a quantity opening a
 *    sentence, so it is intentionally left alone.
 */
const OUTLINE_NUMBER =
  /^\s*\d+(\.\d+)+(?:[):]|\s+\S)|^\s*\d+\.\d+\s*$|^\s*\d+[).:]\s+\S/;

/**
 * An explicit reference to a section, figure, chapter or page number,
 * anywhere in the text — e.g. "consulte la Figura 7.1.3", "ver sección 4".
 * Requiring the keyword keeps this from tripping over quantities such as
 * "Se muestran 3 columnas".
 */
const OUTLINE_REFERENCE = /\b(secci[oó]n|figura|cap[ií]tulo|p[aá]gina|apartado)\s+\d+(\.\d+)*\b/i;

/**
 * A hand-written Markdown-style anchor/slug reference, e.g.
 * `#52-semaforos-y-ars`. A bare `#<digits>` such as `#12` is excluded — that
 * is an ordinary number-sign ("Camara #12"), not a slug. A slug either
 * carries a letter in its first segment, or — when that first segment is
 * purely numeric — is followed by a hyphenated segment of its own.
 */
const ANCHOR_REFERENCE = /#(?:[a-z0-9]*[a-z][a-z0-9]*(?:-[a-z0-9]+)*|\d+-[a-z0-9]+(?:-[a-z0-9]+)*)/i;

/**
 * The message for a literal number, section/figure reference or
 * hand-written anchor found in authored content — or `undefined` if `value`
 * contains none. All three are assigned per build target — see the
 * `tenant-conditioning` skill and this package's `AGENTS.md`.
 */
function literalReferenceMessage(value: string): string | undefined {
  if (OUTLINE_NUMBER.test(value) || OUTLINE_REFERENCE.test(value)) {
    return (
      `"${value}" contains a literal number or a reference to one (a section, ` +
      `figure, chapter or page number). Numbering is assigned per build ` +
      `target — reference the target by its stable id instead and remove ` +
      `the number.`
    );
  }
  if (ANCHOR_REFERENCE.test(value)) {
    return (
      `"${value}" contains a hand-written anchor or slug. Anchors are ` +
      `assigned per build target — reference the target by its stable id ` +
      `instead.`
    );
  }
  return undefined;
}

/**
 * Hard error for a `title`/`subtitle` field. A number at the very start of a
 * heading is always outline numbering — unlike a string inside block props,
 * there is no legitimate counter-example, so this stays a blocking error.
 */
function checkLiteralReference(value: string, file: string, id: string): void {
  const message = literalReferenceMessage(value);
  if (message) throw new ContentError(file, id, message);
}

/**
 * A non-blocking warning describing a literal number, reference or anchor
 * found somewhere else in authored content (block props). A number in prose
 * cannot reliably be told apart from an outline reference by pattern alone
 * — "Se muestran 3 columnas" and "ver sección 3" are the same shape with
 * different meaning — so this is collected for the author to review instead
 * of blocking the build.
 */
export interface ContentWarning {
  readonly file: string;
  readonly nodeId: string;
  readonly text: string;
  readonly message: string;
}

function collectLiteralReferenceWarning(
  value: string,
  file: string,
  id: string,
  warnings: ContentWarning[],
): void {
  const message = literalReferenceMessage(value);
  if (message) warnings.push({ file, nodeId: id, text: value, message });
}

/** Recursively check every string value reachable inside a node's props. */
function checkPropsForLiteralReferences(
  value: unknown,
  file: string,
  id: string,
  warnings: ContentWarning[],
): void {
  if (typeof value === "string") {
    collectLiteralReferenceWarning(value, file, id, warnings);
    return;
  }
  if (Array.isArray(value)) {
    for (const item of value) checkPropsForLiteralReferences(item, file, id, warnings);
    return;
  }
  if (typeof value === "object" && value !== null) {
    for (const v of Object.values(value)) checkPropsForLiteralReferences(v, file, id, warnings);
  }
}

/** Validate a node's `when` selector, if present. */
function parseWhen(
  node: Record<string, unknown>,
  file: string,
  id: string,
): Selector | undefined {
  if (node["when"] === undefined) return undefined;
  const parsed = selectorSchema.safeParse(node["when"]);
  if (!parsed.success) {
    const detail = parsed.error.issues
      .map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`)
      .join("; ");
    throw new ContentError(
      file,
      id,
      `invalid \`when\` selector — ${detail}. A selector is a record of axis ` +
        `id to a non-empty array of non-empty values, e.g. ` +
        `\`{ tenant: [north] }\` — never a bare scalar like \`{ tenant: north }\`.`,
    );
  }
  return parsed.data;
}

function loadNode(
  raw: unknown,
  file: string,
  catalog: BlockCatalog,
  warnings: ContentWarning[],
): ManualNode {
  if (typeof raw !== "object" || raw === null) {
    throw new ContentError(file, "?", "node must be a mapping");
  }
  const node = raw as Record<string, unknown>;
  const id = typeof node["id"] === "string" ? node["id"] : "";
  if (!id) throw new ContentError(file, "?", "every node needs a stable `id`");

  const when = parseWhen(node, file, id);

  if (typeof node["type"] === "string") {
    const type = node["type"];
    const def = catalog.get(type);
    if (!def) {
      throw new ContentError(
        file,
        id,
        `unknown block type "${type}". Use a type from the catalogue, or ` +
          `request a new one — do not improvise a layout.`,
      );
    }
    const parsed = def.schema.safeParse(node["props"] ?? {});
    if (!parsed.success) {
      const detail = parsed.error.issues
        .map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`)
        .join("; ");
      throw new ContentError(file, id, `invalid props for "${type}" — ${detail}`);
    }
    checkPropsForLiteralReferences(parsed.data, file, id, warnings);
    return {
      kind: "block",
      id,
      type,
      props: parsed.data as Record<string, unknown>,
      ...(when ? { when } : {}),
    };
  }

  const title = node["title"];
  if (typeof title !== "string" || !title.trim()) {
    throw new ContentError(file, id, "a section needs a `title`");
  }
  checkLiteralReference(title, file, id);

  const children = Array.isArray(node["children"]) ? node["children"] : [];
  const subtitle = node["subtitle"];
  if (typeof subtitle === "string") checkLiteralReference(subtitle, file, id);

  return {
    kind: "section",
    id,
    title: text(title),
    ...(typeof subtitle === "string" ? { subtitle: text(subtitle) } : {}),
    children: children.map((c) => loadNode(c, file, catalog, warnings)),
    ...(when ? { when } : {}),
  };
}

/** The result of parsing one YAML content file. */
export interface LoadedSection {
  readonly node: ManualNode;
  /**
   * Non-blocking literal-number/reference/anchor findings from inside block
   * props. See `ContentWarning` — the build succeeds regardless; the CLI is
   * responsible for surfacing these to the author.
   */
  readonly warnings: readonly ContentWarning[];
  /**
   * Parts of the product this section deliberately does not describe.
   *
   * Beside the tree rather than in it — see `PendingDeclaration` for why that is
   * the load-bearing part and not a filing preference.
   */
  readonly pending: readonly PendingDeclaration[];
  /**
   * Where each UI label this section quotes was copied from.
   *
   * Beside the tree for the same reason as `pending`: it is what the file says
   * about itself. Unlike `pending` it is not withheld from the reader — the
   * label IS in the manual — but the citation is pipeline bookkeeping and has no
   * business reaching a renderer.
   */
  readonly labels: readonly LabelCitation[];
}

/** Fields every entry must carry. A half-filled one is the prose it replaces. */
const PENDING_FIELDS = {
  missing: "what is on screen and this section does not describe",
  because: "the evidence, by file and line in the source product",
  settles: "what would close this",
} as const;

/**
 * Parse a section's `pending` list.
 *
 * `covers` is resolved against the ids of the section being parsed, which is
 * what keeps this checkable at all: a gap is declared in the file whose content
 * it is missing from, so nothing has to be looked up across files and an id that
 * stops existing is a content error rather than a queue entry pointing at
 * nothing.
 */
function parsePending(
  node: Record<string, unknown>,
  file: string,
  sectionId: string,
  ownIds: ReadonlySet<string>,
): PendingDeclaration[] {
  const raw = node["pending"];
  if (raw === undefined) return [];
  if (!Array.isArray(raw)) {
    throw new ContentError(
      file,
      sectionId,
      "`pending` must be a list of entries, one per part of the product this " +
        "section leaves undescribed.",
    );
  }

  const out: PendingDeclaration[] = [];
  const seen = new Set<string>();

  for (const item of raw) {
    if (typeof item !== "object" || item === null) {
      throw new ContentError(file, sectionId, "every `pending` entry must be a mapping");
    }
    const entry = item as Record<string, unknown>;

    const id = entry["id"];
    if (typeof id !== "string" || !id.trim()) {
      throw new ContentError(
        file,
        sectionId,
        "a `pending` entry needs a stable `id` — the queue is keyed on it, so an " +
          "entry without one cannot be tracked from one export to the next.",
      );
    }
    if (seen.has(id)) {
      throw new ContentError(file, id, "duplicate `pending` id in this section");
    }
    seen.add(id);

    const covers = entry["covers"];
    if (!Array.isArray(covers) || covers.some((c) => typeof c !== "string" || !c.trim())) {
      throw new ContentError(
        file,
        id,
        "a `pending` entry needs `covers`: a list of node ids in this section " +
          "whose content the gap sits inside. It is what joins the queue to the " +
          "manual — without it nobody reading the queue can find the place.",
      );
    }
    if (covers.length === 0) {
      throw new ContentError(
        file,
        id,
        "`covers` needs at least one node id, or the entry points the queue at nothing",
      );
    }
    for (const covered of covers as string[]) {
      if (!ownIds.has(covered)) {
        throw new ContentError(
          file,
          id,
          `\`covers\` names "${covered}", which is not an id in this section. A gap ` +
            `is declared in the file whose content it is missing from — declare it ` +
            `there, rather than pointing across files at content this file cannot ` +
            `check.`,
        );
      }
    }

    const fields: Record<string, string> = {};
    for (const [field, meaning] of Object.entries(PENDING_FIELDS)) {
      const value = entry[field];
      if (typeof value !== "string" || !value.trim()) {
        throw new ContentError(
          file,
          id,
          `a \`pending\` entry needs \`${field}\` — ${meaning}. Every field is ` +
            `required: an entry missing one is the prose note this replaces, and ` +
            `prose is what stopped these being chased.`,
        );
      }
      fields[field] = value.trim();
    }

    out.push({
      id,
      section: sectionId,
      file,
      covers: covers as string[],
      missing: fields["missing"] ?? "",
      because: fields["because"] ?? "",
      settles: fields["settles"] ?? "",
    });
  }

  return out;
}

/** Every id in a parsed subtree, so `covers` can be resolved within its section. */
function idsWithin(node: ManualNode, out: Set<string>): void {
  out.add(node.id);
  for (const child of node.children ?? []) idsWithin(child, out);
}

/** `<file>:<line>`, with the section's `sourceBase` applied. */
function parseFrom(
  raw: unknown,
  base: string,
  file: string,
  id: string,
): { file: string; line: number } {
  if (typeof raw !== "string" || !raw.trim()) {
    throw new ContentError(
      file,
      id,
      "a label citation needs `from`, in the form `<file>:<line>` — the place in " +
        "the source product this label was copied from.",
    );
  }
  const at = raw.lastIndexOf(":");
  const line = at === -1 ? Number.NaN : Number(raw.slice(at + 1));
  if (at <= 0 || !Number.isInteger(line) || line < 1) {
    throw new ContentError(
      file,
      id,
      `\`from\` must be \`<file>:<line>\`, not "${raw}". The line is what makes ` +
        `the citation checkable; a bare filename can only be searched, and a ` +
        `search finds the label wherever it moved to and reports nothing.`,
    );
  }
  return { file: `${base}${raw.slice(0, at)}`, line };
}

/**
 * Parse a section's `labels` list.
 *
 * Each entry points at an id and says where that id's label was copied from.
 * The text itself is read from the content, never re-typed here: a second copy
 * of the label is a second thing to keep in step, and it is the copy meant to
 * detect drift.
 */
function parseLabels(
  node: Record<string, unknown>,
  file: string,
  sectionId: string,
  sites: readonly LabelSite[],
): LabelCitation[] {
  const raw = node["labels"];
  if (raw === undefined) return [];
  if (!Array.isArray(raw)) {
    throw new ContentError(file, sectionId, "`labels` must be a list of citations");
  }

  const base = node["sourceBase"];
  if (base !== undefined && typeof base !== "string") {
    throw new ContentError(file, sectionId, "`sourceBase` must be a string path prefix");
  }

  const out: LabelCitation[] = [];
  const seen = new Set<string>();

  for (const item of raw) {
    if (typeof item !== "object" || item === null) {
      throw new ContentError(file, sectionId, "every `labels` entry must be a mapping");
    }
    const entry = item as Record<string, unknown>;

    const at = entry["at"];
    if (typeof at !== "string" || !at.trim()) {
      throw new ContentError(
        file,
        sectionId,
        "a label citation needs `at`: the id of the node or item carrying the label.",
      );
    }

    const carried = sites.filter((s) => s.at === at);
    if (carried.length === 0) {
      throw new ContentError(
        file,
        at,
        `\`at\` names "${at}", which carries no UI label in this section. Either the ` +
          `id is not here, or it is not a label-bearing prop — a step's title and a ` +
          `paragraph are the MANUAL's words, not the product's, so there is nothing ` +
          `to check them against. See \`LabelPolicy\` for which props count.`,
      );
    }

    const wanted = entry["prop"];
    let site: LabelSite | undefined;
    if (wanted === undefined) {
      if (carried.length > 1) {
        throw new ContentError(
          file,
          at,
          `"${at}" carries ${carried.length} labels (${carried
            .map((s) => s.prop)
            .join(", ")}), so \`prop\` must say which one this citation is for.`,
        );
      }
      site = carried[0];
    } else {
      if (typeof wanted !== "string") {
        throw new ContentError(file, at, "`prop` must be the name of a label prop");
      }
      site = carried.find((s) => s.prop === wanted);
      if (!site) {
        throw new ContentError(
          file,
          at,
          `"${at}" has no label prop called "${wanted}". It carries: ` +
            `${carried.map((s) => s.prop).join(", ")}.`,
        );
      }
    }
    if (!site) continue;

    const key = `${at}|${site.prop}`;
    if (seen.has(key)) {
      throw new ContentError(
        file,
        at,
        `"${at}" (${site.prop}) is cited twice. One label came from one place; two ` +
          `citations mean one of them is wrong and nothing can tell which.`,
      );
    }
    seen.add(key);

    const { file: sourceFile, line } = parseFrom(entry["from"], base ?? "", file, at);
    out.push({ at, prop: site.prop, text: site.text, file: sourceFile, line, declaredIn: file });
  }

  return out;
}

/** Parse one YAML content file into AST nodes. */
export function loadSection(
  source: string,
  file: string,
  catalog: BlockCatalog,
): LoadedSection {
  const warnings: ContentWarning[] = [];
  const raw = parseYaml(source);
  const node = loadNode(raw, file, catalog, warnings);

  // Read from the RAW mapping, not the node: `pending` is deliberately absent
  // from the AST, so `loadNode` never saw it.
  const top = (typeof raw === "object" && raw !== null ? raw : {}) as Record<string, unknown>;
  if (node.kind !== "section") {
    for (const key of ["pending", "labels", "sourceBase"]) {
      if (top[key] !== undefined) {
        throw new ContentError(
          file,
          node.id,
          `\`${key}\` belongs on a section, not on a block. Both are things a ` +
            `content FILE says about itself, and a file is a section.`,
        );
      }
    }
    return { node, warnings, pending: [], labels: [] };
  }

  const ownIds = new Set<string>();
  idsWithin(node, ownIds);
  return {
    node,
    warnings,
    pending: parsePending(top, file, node.id, ownIds),
    labels: parseLabels(top, file, node.id, labelSites(node, catalog)),
  };
}
