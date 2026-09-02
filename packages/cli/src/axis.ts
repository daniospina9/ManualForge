/**
 * Which axis a manual is conditioned on.
 *
 * The rule lives here, alone, because two callers need it and they cannot import
 * each other: `main.ts` reads it off a parsed `ManualConfig`, and `extract.ts` —
 * which `main.ts` imports — reads it off the same YAML parsed for its own
 * purposes. Stating the rule in both places is how the two would come to
 * disagree about what a manual's axis is, and the map disagreeing with the build
 * is the failure nobody would see until a client got the wrong document.
 */

/**
 * The single axis a manual varies on, from the axis names it declares.
 *
 * DERIVED, not declared. One axis cannot be ambiguous, and every manual here has
 * exactly one, so nothing needs a new config key. Two or more is a shape this
 * pipeline has never had: it asks instead of guessing, because taking the first
 * key would make the answer depend on the order the YAML was written in.
 */
export function soleAxis(names: readonly string[]): string {
  const only = names[0];
  if (names.length === 1 && only !== undefined) return only;

  if (names.length === 0) {
    throw new Error(
      `manual.config.yaml declares no axes. One document is produced per target ` +
        `and a target is an assignment of every axis, so there is nothing to ` +
        `build — declare the axis this manual's content actually varies on.`,
    );
  }
  throw new Error(
    `manual.config.yaml declares ${names.length} axes (${names.join(", ")}) and ` +
      `nothing says which one names the output. Conditioning handles any number ` +
      `of axes, but one filename and one figure set need a single value. More ` +
      `than one axis has never been needed here — raise it rather than working ` +
      `around it.`,
  );
}
