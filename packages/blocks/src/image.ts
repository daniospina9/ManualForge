import { z } from "zod";

/**
 * How content refers to an image.
 *
 * Content declares WHICH image a place needs. It never says where the file
 * lives, because a path cannot answer the two questions this pipeline is built
 * around:
 *
 *  - The same screen does not look identical in every deployment, so one path
 *    cannot serve six tenants.
 *  - The images are produced by a different area of the company and arrive
 *    later, so there has to be a stable key to deliver and re-synchronise
 *    against. A path buried in a content file is not that key.
 *
 * So content names a **slot**, and the build resolves it per target:
 *
 *   1. `<tenant>/<slot>`  — an image made for this deployment
 *   2. `_common/<slot>`   — one image valid for every deployment
 *   3. the pending placeholder — always the same image, so an undelivered slot
 *      still occupies its place instead of leaving a gap the reader reads as
 *      finished content
 *
 * A slot's dots become folders (`barra.filtro.fig` -> `barra/filtro/fig`), so
 * the delivered tree mirrors the manual and the delivering area can see at a
 * glance where an image belongs.
 */

/** An image that exists: this node's own id, or a named slot. */
export type ImageRef = true | string;

/**
 * What an author may write in an image prop.
 *
 * `false` is the opt-out. It is needed because under the `always` policy
 * omitting the prop still declares a slot — that default is what lets a module
 * be written before a single capture exists, but it leaves an author no way to
 * say "not here". Some places genuinely need no image: a step that is one
 * button press is explained by its own sentence, and a slot standing open for
 * it means a placeholder in the manual and a line in the manifest asking a
 * capture team for a screenshot nobody will ever take.
 */
export type ImageDeclaration = ImageRef | false;

/** Recognised image extensions — the tell that someone wrote a filename. */
const EXTENSION = /\.(?:png|jpe?g|svg|gif|webp|bmp|tiff?|pdf)$/i;

/** A path separator, in either flavour. */
const SEPARATOR = /[/\\]/;

/**
 * Dot-separated segments, each lowercase alphanumeric with internal hyphens.
 * Deliberately strict: a slot becomes a filename on disk, and a name that
 * differs only by case or by a stray separator becomes two files that nobody
 * notices are the same slot.
 */
const SLOT = /^[a-z0-9]+(?:-[a-z0-9]+)*(?:\.[a-z0-9]+(?:-[a-z0-9]+)*)*$/;

const WRITE_INSTEAD =
  "Write `image: true` to use this node's own id as the slot, or an explicit " +
  "slot name (dot-separated, e.g. `barra.busqueda`) to share one delivered " +
  "image across several places.";

const RESOLUTION_ORDER =
  "The build resolves a slot per target — `<tenant>/<slot>`, then " +
  "`_common/<slot>`, then the pending placeholder — and lists it in the image " +
  "manifest.";

/**
 * Why `value` is not a usable slot name, or `undefined` if it is one.
 *
 * Shared by the schema and by slot derivation so a node id and an authored
 * name are held to exactly the same standard.
 */
export function slotNameProblem(value: string): string | undefined {
  if (SEPARATOR.test(value)) {
    return (
      `"${value}" is a file path, not a slot name. Content declares which ` +
      `image a place needs, never where the file lives. ${RESOLUTION_ORDER} ` +
      `${WRITE_INSTEAD}`
    );
  }
  if (EXTENSION.test(value)) {
    return (
      `"${value}" carries a file extension, so it names a file rather than a ` +
      `slot. Drop the extension: the build owns the file layout. ` +
      `${WRITE_INSTEAD}`
    );
  }
  if (value !== value.toLowerCase()) {
    return (
      `"${value}" is not lowercase. A slot becomes a filename, and two names ` +
      `differing only by case are one file on Windows and two on Linux. Use ` +
      `lowercase throughout.`
    );
  }
  if (!SLOT.test(value)) {
    return (
      `"${value}" is not a valid slot name. A slot is one or more ` +
      `dot-separated segments of lowercase letters, digits and internal ` +
      `hyphens — e.g. \`barra.busqueda\`, \`interfaz-general.fig-home\`. ` +
      `${WRITE_INSTEAD}`
    );
  }
  return undefined;
}

/**
 * An image declaration: `true`, a slot name, or `false` for none.
 *
 * Built on `unknown` rather than `z.union` on purpose. A union reports a
 * failure as `invalid_union` with the branch messages nested out of reach, and
 * these messages are the only place an author is told why a path is refused —
 * losing them would leave "Invalid input" against a line that looks perfectly
 * reasonable.
 */
export const imageRefSchema: z.ZodType<ImageDeclaration, z.ZodTypeDef, unknown> = z
  .unknown()
  .superRefine((value, ctx) => {
    if (value === true || value === false) return;
    if (typeof value !== "string") {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          `an image is declared by \`true\` or by a slot name and declined by ` +
          `\`false\`, but this is ${typeof value}. ${WRITE_INSTEAD}`,
      });
      return;
    }
    const problem = slotNameProblem(value);
    if (problem) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: problem });
    }
  })
  .transform((value) => value as ImageDeclaration);

/**
 * The slot a reference points at, given the node that carries it.
 *
 * `true` means "this node's id", which is why ids are the naming convention:
 * they already exist, are already unique, are already validated, and are never
 * positional — so a slot name never has to be invented, and never shifts when
 * a section moves.
 */
export function slotFor(ref: ImageRef, nodeId: string): string {
  if (ref !== true) return ref;
  const problem = slotNameProblem(nodeId);
  if (problem) {
    throw new Error(
      `cannot derive an image slot from node id "${nodeId}": ${problem} ` +
        `Either rename the node or give it an explicit slot name.`,
    );
  }
  return nodeId;
}

/** A slot's path under an image root: dots become folders. */
export function slotToPath(slot: string): string {
  return slot.split(".").join("/");
}

/**
 * The image reference a node or item declares, applying its block type's policy.
 *
 * `always` means the slot exists whether or not anyone wrote it down — that is
 * what makes a module writable before a single capture is delivered. `false`
 * overrides that: it is the only way out of `always`, and it reads the same
 * under either policy.
 *
 * Lives here, beside the policy it applies, because BOTH numbering and slot
 * collection have to agree on which nodes carry an image. Two walks answering
 * that question separately would eventually disagree, and the symptom would be a
 * figure number assigned to a node the renderer draws no figure for.
 */
export function declaredRef(
  source: Readonly<Record<string, unknown>>,
  policy: { readonly prop: string; readonly policy: "always" | "optional" },
): ImageRef | undefined {
  const written = source[policy.prop];
  if (written === false) return undefined;
  if (written !== undefined) return written as ImageRef;
  return policy.policy === "always" ? true : undefined;
}

/** Which of the three resolution steps answered for a slot. */
export type SlotState =
  /** An image made for this deployment. */
  | "tenant"
  /** One image valid for every deployment. */
  | "common"
  /** Not delivered yet: the placeholder stands in its place. */
  | "pending";

export interface ResolvedImage {
  /** Where the renderer loads it from. */
  readonly url: string;
  readonly state: SlotState;
  /**
   * Where the file has to be delivered. Present only while pending.
   *
   * Carried on the resolution rather than derived by the renderer because the
   * layout of the figures folder is the CLI's business — see
   * `packages/cli/AGENTS.md`. The draft build prints it; the client build never
   * does.
   */
  readonly deliverTo?: string;
}

/**
 * Turns a slot into something renderable.
 *
 * The renderer never touches the filesystem or builds a path: it asks. That is
 * what lets the same content render six deployments from six different sets of
 * images without a single conditional in the markup.
 */
export type ImageResolver = (slot: string) => ResolvedImage;
