/**
 * Hold the manual's declared axis values against the product's own configs.
 *
 * The manual's `axes.<axis>.values` is supposed to mirror the product's config
 * directory. Nothing enforced that until now, and the two drift in both
 * directions for different reasons:
 *
 * - The product gains a config the manual has never heard of. Harmless-looking,
 *   and it is not: an undeclared value still lands in every capability row this
 *   extraction produces, so `canSeeBoT` reads as enabled for a development
 *   config as if it were a client.
 * - The manual declares a value with no config behind it. Worse, and quieter:
 *   every build for it succeeds, every PDF is produced, and the conditioning has
 *   nothing real to condition against.
 *
 * Reported, never fixed automatically. Which of the two is wrong is a judgement
 * about the product, not about this file.
 *
 * `axis` is a parameter rather than the literal `tenant` because the message's
 * whole job is to send the reader to the key they have to fix. A manual
 * conditioned on permissions was being told to look at `axes.tenant.values`,
 * which is not a key in its file.
 */
export function reconcileAxisValues(
  axis: string,
  fromProduct: readonly string[],
  fromManual: readonly string[],
): readonly string[] {
  const product = new Set(fromProduct);
  const manual = new Set(fromManual);
  const out: string[] = [];

  for (const id of [...product].sort()) {
    if (!manual.has(id)) {
      out.push(
        `"${id}" has a config in the product but is not declared in the manual's ` +
          `\`axes.${axis}.values\` — it will appear in every capability row of this ` +
          `map. Declare it, or know why it is excluded.`,
      );
    }
  }
  for (const id of [...manual].sort()) {
    if (!product.has(id)) {
      out.push(
        `"${id}" is declared in the manual but has no config in the product. ` +
          `Builds for it will succeed with nothing real behind the conditioning.`,
      );
    }
  }

  return out;
}
