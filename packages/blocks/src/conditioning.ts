/**
 * Conditioning axes.
 *
 * A manual is assembled for a specific combination of axis values — today only
 * `tenant`, but the model is deliberately generic so a second axis (role,
 * language, deployment stage) can be added without reworking the pipeline.
 *
 * Nothing in this file names a specific tenant. Concrete axis values are
 * declared per manual in `manual.config.yaml` and derived from the source
 * repository, never hardcoded here.
 */

import { z } from "zod";

/** Identifier of a conditioning axis, e.g. `"tenant"`. */
export type AxisId = string;

/** A value within an axis, e.g. `"north"` within the `tenant` axis. */
export type AxisValue = string;

/** Matches every value of an axis. The default when a selector is omitted. */
export const ALL = "all" as const;

/**
 * Which axis values a piece of content applies to.
 *
 * `["all"]` — applies to every value of that axis.
 * `["north", "metro"]` — applies only to those values.
 *
 * An axis absent from a selector is unconstrained: content tagged only with a
 * `tenant` selector applies to every role.
 */
export type Selector = Readonly<Record<AxisId, readonly AxisValue[]>>;

/**
 * Runtime validation for `Selector`, shared by every place a `when` is
 * parsed — section/block conditioning (`core/load.ts`) and row-level
 * conditioning inside a block's own props (e.g. `icon-table`'s rows).
 *
 * A selector is a record of axis id -> a non-empty array of non-empty axis
 * values. The scalar shorthand some authors reach for by mistake — e.g.
 * `when: { tenant: north }` instead of `when: { tenant: [north] }` — must be
 * rejected here: left unvalidated, it silently turns `Array#includes` into
 * `String#includes`, which does substring matching instead of exact
 * matching and leaks content across tenants.
 */
export const selectorSchema = z.record(
  z.string().min(1),
  z.array(z.string().min(1)).min(1),
);

/** The axis values a single build targets, e.g. `{ tenant: "north" }`. */
export type BuildTarget = Readonly<Record<AxisId, AxisValue>>;

/** An AST node that can be included or excluded by conditioning. */
export interface Conditioned {
  /** Omitted or empty means "applies to everything". */
  readonly when?: Selector;
}
