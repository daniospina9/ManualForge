import { execFileSync } from "node:child_process";

/**
 * The little git this pipeline needs, and nothing more.
 *
 * EVERY FUNCTION HERE RETURNS `null` RATHER THAN THROWING when git cannot be
 * consulted — not installed, not a repository, a corrupt index. That is the
 * whole point of the module. The build's job is to produce a manual; a guard
 * that turns "git is missing" into "you cannot build" would be a worse defect
 * than the one it guards against, and it would fire on exactly the machines
 * least able to diagnose it.
 *
 * `execFileSync`, never `execSync`: no shell, so a repository path containing a
 * space or a quote is an argument rather than something the shell reinterprets.
 * This repository's own path has three spaces in it.
 */

function git(repoRoot: string, args: readonly string[]): string | null {
  try {
    return execFileSync("git", ["-C", repoRoot, ...args], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    return null;
  }
}

/** The commit `HEAD` points at, or `null` if git cannot say. */
export function headCommit(repoRoot: string): string | null {
  const out = git(repoRoot, ["rev-parse", "HEAD"]);
  return out === null || out === "" ? null : out;
}

/**
 * Whether the working tree has changes git is tracking or would track.
 *
 * `null` means "cannot tell", which callers must not read as "clean": an
 * unanswerable question and a negative answer are different, and collapsing
 * them is how a guard silently stops guarding.
 */
export function isDirty(repoRoot: string): boolean | null {
  const out = git(repoRoot, ["status", "--porcelain"]);
  return out === null ? null : out !== "";
}

/**
 * Commit ONE file, with a message, and nothing else.
 *
 * NAMES THE PATH IN BOTH HALVES — staged explicitly and passed to `commit`, so
 * a file that arrived in the tree between the stage and the commit cannot ride
 * along. `commit -a` or a bare `commit` after `add` would both sweep it up.
 *
 * Only safe because of where it is called from: a delivery refuses to start on
 * a dirty tree, so the file it stamps is the only change in existence by the
 * time this runs. Do not reach for it from anywhere that cannot make the same
 * promise.
 *
 * Returns false when git could not do it. The caller has already archived by
 * then and cannot roll that back, so a false here is something to REPORT
 * loudly, never to swallow.
 */
export function commitFile(repoRoot: string, path: string, message: string): boolean {
  if (git(repoRoot, ["add", "--", path]) === null) return false;
  return git(repoRoot, ["commit", "-m", message, "--", path]) !== null;
}

/**
 * Whether `commit` is what the tree currently holds, unmodified.
 *
 * Both halves are required. A build sitting on the delivered commit but with
 * edits in the tree produces a different document from the delivered one, and
 * the commit alone would call it identical.
 */
export function isExactly(repoRoot: string, commit: string): boolean | null {
  const head = headCommit(repoRoot);
  if (head === null) return null;
  const dirty = isDirty(repoRoot);
  if (dirty === null) return null;
  // The recorded commit may be abbreviated; compare on the shorter of the two.
  const n = Math.min(commit.length, head.length);
  return head.slice(0, n) === commit.slice(0, n) && !dirty;
}
