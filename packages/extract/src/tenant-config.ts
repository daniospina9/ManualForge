/**
 * The tenant registry, read from the product's own config files.
 *
 * These files are authoritative: the deployments are exactly these, no more. The
 * manual's `axes.tenant.values` mirrors them and must never disagree.
 *
 * They carry more than identity. Each one declares a set of boolean capability
 * flags — `canSeeBoT`, `canViewFilterZone`, `canSeeForcesInField` — which state
 * per deployment what the product turns on. That is a far better answer to "who
 * sees this" than hunting comparisons through components, because the product
 * itself wrote it down.
 */

/** A boolean setting, with the line that declares it. */
export interface FlagFact {
  readonly value: boolean;
  readonly line: number;
}

export interface TenantConfig {
  /** Axis id, from the filename: `north.config.ts` -> `north`. */
  readonly id: string;
  /** The product's own code for it, from `name`. Not derivable from the id. */
  readonly code: string;
  /** `<file>:<line>` of the `name` declaration. */
  readonly source: string;
  readonly flags: Readonly<Record<string, FlagFact>>;
}

const NAME = /^\s*name:\s*["']([^"']+)["']/;
/** A boolean setting. Anything else — a URL, a title, a number — is not a capability. */
const BOOLEAN_FLAG = /^\s*(\w+):\s*(true|false)\s*,?\s*$/;

/**
 * Parse one `<id>.config.ts`.
 *
 * Deliberately line-based rather than a TypeScript parse. These files are flat
 * object literals of primitives, the shape is stable, and the line number is the
 * product of the exercise — a real parser would hand back an AST from which the
 * line has to be recovered anyway. If they ever stop being flat, this must be
 * replaced rather than patched: a regex that half-understands nesting would
 * report flags from a nested object as though they were top-level capabilities.
 */
export function parseTenantConfig(fileName: string, source: string): TenantConfig {
  const lines = source.split(/\r?\n/);
  const flags: Record<string, FlagFact> = {};
  let code: string | undefined;
  let codeLine = 0;

  lines.forEach((line, i) => {
    const name = NAME.exec(line);
    if (name?.[1] !== undefined && code === undefined) {
      code = name[1];
      codeLine = i + 1;
      return;
    }
    const flag = BOOLEAN_FLAG.exec(line);
    if (flag?.[1] !== undefined) {
      flags[flag[1]] = { value: flag[2] === "true", line: i + 1 };
    }
  });

  if (code === undefined) {
    throw new Error(
      `${fileName} declares no \`name\`, so the deployment's own code is unknown. ` +
        `The code cannot be guessed from the filename — the manual prints it and ` +
        `content is conditioned on it.`,
    );
  }

  const id = fileName.replace(/\.config\.ts$/, "");
  return { id, code, source: `${fileName}:${codeLine}`, flags };
}

/**
 * One capability across every axis value.
 *
 * Keyed by axis value id, not by "tenant": this row is part of the module map,
 * and the map now records which axis it describes. A product whose values are
 * permission profiles gets the same row shape, and calling the column `tenants`
 * there would put a deployment word on a permission fact.
 */
export interface CapabilityRow {
  readonly flag: string;
  /** Only the axis values that DECLARE it. */
  readonly values: Readonly<Record<string, FlagFact>>;
  /** Axis value ids whose config never mentions it. Absent when none. */
  readonly absentFrom?: readonly string[];
  /** Axis value ids where it is `true` — what content is tagged against. */
  readonly enabledFor: readonly string[];
}

/**
 * Pivot the configs into one row per capability.
 *
 * `absentFrom` is the point of this function. The configs do not share a shape —
 * one declares 92 settings and another 47 — so a flag missing from one is
 * routine, and it is **not** `false`. Folding absent into false would have the
 * map assert that a deployment lacks a feature when the truth is that nobody
 * said. Content tagged from that assertion would be wrong in the one direction
 * nobody checks: silently omitting something the operator does have.
 */
export function capabilityMatrix(configs: readonly TenantConfig[]): readonly CapabilityRow[] {
  const flags = [...new Set(configs.flatMap((c) => Object.keys(c.flags)))].sort();

  return flags.map((flag) => {
    const values: Record<string, FlagFact> = {};
    const absentFrom: string[] = [];
    const enabledFor: string[] = [];

    for (const config of configs) {
      const fact = config.flags[flag];
      if (fact === undefined) {
        absentFrom.push(config.id);
        continue;
      }
      values[config.id] = fact;
      if (fact.value) enabledFor.push(config.id);
    }

    return {
      flag,
      values,
      ...(absentFrom.length > 0 ? { absentFrom } : {}),
      enabledFor,
    };
  });
}
