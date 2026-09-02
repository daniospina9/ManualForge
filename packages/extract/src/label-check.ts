/**
 * Hold a quoted UI label against the line the manual says it came from.
 *
 * A product with no i18n catalogue leaves the manual quoting literals, and a
 * quotation does not follow the thing it quoted. This is the check that notices
 * — the same one the authoring notes prescribe by hand ("print the cited line
 * back"), which caught four wrong citations on a single section.
 *
 * Deliberately a SUBSTRING test and nothing more. The label sits inside a JSX
 * prop, an object property or a call argument, and which of those it is has no
 * bearing on whether the screen still says it. Parsing the syntax would buy
 * nothing and would fail on the first shape the parser had not met — the same
 * reason `tenant-config.ts` is line-based rather than a TypeScript parse.
 *
 * What it does NOT decide: whether the string it found is the label the manual
 * means. A short word appearing anywhere in the file passes. That is why the
 * citation names a LINE — the line is the author's claim, and the check either
 * confirms it or says where the text actually is.
 */
export type LabelVerdict =
  /** The cited line still contains the label. */
  | { readonly state: "ok" }
  /**
   * The label is in the file, but not on the cited line. Usually the product was
   * edited above it; the citation is stale rather than wrong. The lines are
   * named so the fix is one edit and not a search.
   */
  | { readonly state: "moved"; readonly foundAt: readonly number[] }
  /**
   * The label is nowhere in the file. This is the failure the check exists for:
   * the manual is quoting a control the product no longer has, and every other
   * stage of the pipeline succeeds.
   */
  | { readonly state: "gone" }
  /** The cited file is not there. Reported, never inferred around. */
  | { readonly state: "no-file" };

/**
 * @param source the cited file's text, or `undefined` if it does not exist
 * @param text the label as content holds it
 * @param line the 1-based line the citation claims
 */
export function checkLabel(
  source: string | undefined,
  text: string,
  line: number,
): LabelVerdict {
  if (source === undefined) return { state: "no-file" };

  const lines = source.split(/\r?\n/);
  const cited = lines[line - 1];
  if (cited !== undefined && cited.includes(text)) return { state: "ok" };

  const foundAt: number[] = [];
  lines.forEach((l, i) => {
    if (l.includes(text)) foundAt.push(i + 1);
  });

  return foundAt.length > 0 ? { state: "moved", foundAt } : { state: "gone" };
}
