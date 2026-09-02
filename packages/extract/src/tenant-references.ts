/**
 * Where the product decides, in code, that one deployment differs from another.
 *
 * This is the part of extraction that matters and the part that usually fails.
 * Route-level gating is the visible tip; the real divergence is comparisons
 * against the active deployment scattered through components — a map layer, a
 * filter option, a report column. An extraction that reports only route gating
 * claims every deployment sees everything, which is the failure this whole
 * system exists to prevent.
 *
 * What this returns is deliberately a FACT, not a conclusion: "line 76 mentions
 * NORTH and DEMO, positively". It does not say who sees the element. Evaluating the
 * surrounding boolean logic — nested ternaries, props that may not be passed,
 * conditions on unrelated variables — is exactly where a confident wrong answer
 * would come from, and a wrong tenant tag is the one defect a reader cannot
 * detect. Whoever writes the content reads the reference and decides.
 */

export type Polarity = "positive" | "negative" | "mixed";

/**
 * One line of product code that decides along the manual's axis.
 *
 * The fields were always axis-neutral — a file, a line, the codes named on it,
 * and what the line does with them. Only the NAME said tenant, and the map that
 * carries these now records which axis it describes, so the name has to stop
 * claiming an answer.
 *
 * This is the shared fact type. The FINDER is per product: `findTenantReferences`
 * below knows `atlas`'s shape, and a second product's finder is a new
 * function returning this same type rather than a widening of that one.
 */
export interface AxisReference {
  readonly file: string;
  readonly line: number;
  /** Declared axis value codes named on this line, in the order they appear. */
  readonly codes: readonly string[];
  readonly polarity: Polarity;
  /** `route-gate` is a routing prop; `inline` is a comparison inside a component. */
  readonly kind: "route-gate" | "inline";
  /** The line itself, trimmed — enough to judge without opening the file. */
  readonly text: string;
  /** `low` whenever the line's meaning is not plain on its face. */
  readonly confidence: "high" | "low";
}

/** A line that is only a comment gates nothing. */
const COMMENT = /^\s*(\/\/|\/\*|\*)/;

/** Route-level gating, e.g. `allowedProjects={["DEMO", "NORTH"]}`. */
const ROUTE_GATE = /allowedProjects\s*=/;

/**
 * Scan one source file for references to a declared deployment.
 *
 * `codes` comes from the tenant registry, so a comparison against a string that
 * is not a declared deployment is ignored rather than inventing one. That guard
 * is what keeps a stray `config.name === "SOMEWHERE"` out of the map.
 */
export function findTenantReferences(
  file: string,
  source: string,
  codes: readonly string[],
): readonly AxisReference[] {
  const known = new Set(codes);
  const out: AxisReference[] = [];

  source.split(/\r?\n/).forEach((raw, i) => {
    if (COMMENT.test(raw)) return;

    // Every quoted string on the line that names a declared deployment, in order
    // and without repeats.
    const named: string[] = [];
    for (const m of raw.matchAll(/["']([A-Za-z_]+)["']/g)) {
      const code = m[1];
      if (code !== undefined && known.has(code) && !named.includes(code)) named.push(code);
    }
    if (named.length === 0) return;

    // A quoted deployment code alone is not a decision. It counts only where the
    // line actually compares or tests against it — otherwise a logo path or a
    // display label would be reported as gating.
    // The lookbehind is load-bearing: `!==` contains `==`, so a plain
    // alternation reported every negation as carrying both polarities and
    // downgraded it to `mixed`. Two or three `=` NOT preceded by `!`.
    const positive = /(?<!!)={2,3}|\.includes\s*\(/.test(raw);
    const negative = /!==?/.test(raw);
    if (!positive && !negative && !ROUTE_GATE.test(raw)) return;

    const polarity: Polarity =
      positive && negative ? "mixed" : negative ? "negative" : "positive";

    out.push({
      file,
      line: i + 1,
      codes: named,
      polarity,
      kind: ROUTE_GATE.test(raw) ? "route-gate" : "inline",
      text: raw.trim(),
      confidence: polarity === "mixed" ? "low" : "high",
    });
  });

  return out;
}
