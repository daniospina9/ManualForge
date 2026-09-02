/**
 * What a build on disk is called, and what its name means.
 *
 * TWO KINDS OF NAME, and keeping them apart is the whole reason this file
 * exists. A version says what a client received: it is a fact about somebody
 * else's document, fixed forever the moment it is handed over. A WORKING NUMBER
 * says which iteration of our own work a file is, and it moves every build.
 *
 * They used to be one thing. Every build was named after the highest change-log
 * row, so the day after a delivery every build carried a name that already
 * belonged to the client's copy — and `-NO-ENTREGADO` was invented to mark the
 * ones that were lying. That marker is gone, along with the collision it
 * covered: a working build now cannot be named after a version at all.
 *
 * Lives in its own module because `main.ts` imports the wizard, so anything the
 * two share has to sit below both or the import graph closes into a cycle.
 */

/** Matches the working number in a filename, whatever else the name carries. */
const WORK_NUMBER = /-trabajo-(\d+)/;

/** The working number a filename carries, or null when it carries none. */
export function workNumberIn(name: string): number | null {
  const found = WORK_NUMBER.exec(name);
  return found?.[1] === undefined ? null : Number(found[1]);
}

/** `8` -> `trabajo-08`. Padded so a folder listing sorts the way it reads. */
export function workStamp(workNumber: number): string {
  return `trabajo-${String(workNumber).padStart(2, "0")}`;
}

/**
 * The next working number for a manual's `output/`.
 *
 * Read off the FILENAMES rather than a ledger. `output/` is gitignored and
 * disposable, so the trail is local by construction; a ledger describing files
 * that only exist on one machine would be state with no reader. A fresh clone
 * starts at 1, which is correct — it has no working builds to be the ninth of.
 *
 * Allocated ONCE PER BUILD RUN, per manual, and every target that run renders
 * carries it. Two files with the same number are therefore always the same
 * content, which is the whole property worth having. The visible cost is gaps:
 * `build --tenant north` moves the manual's counter, so `south`'s newest file can
 * sit at 08 while `north` is at 09. That gap is true — run 09 did not include
 * `south`.
 */
export function nextWorkNumber(names: readonly string[]): number {
  let highest = 0;
  for (const name of names) {
    const number = workNumberIn(name);
    if (number !== null) highest = Math.max(highest, number);
  }
  return highest + 1;
}

/**
 * The highest working number among files naming one axis value.
 *
 * Matched on the axis value bounded by separators, never by bare inclusion:
 * `north` appears inside `manual-operador-north-…` and would also appear inside a
 * hypothetical `…-mvd-…`, and a picker that showed one target's builds under
 * another target's name would be worse than showing nothing.
 */
export function newestWorkNumberFor(
  names: readonly string[],
  axisValue: string,
): number | null {
  let highest: number | null = null;
  for (const name of names) {
    if (!name.includes(`-${axisValue}-`)) continue;
    const number = workNumberIn(name);
    if (number !== null && (highest === null || number > highest)) highest = number;
  }
  return highest;
}
