/**
 * Which extractor may read a source product, decided by the `framework` its
 * registry entry declares.
 *
 * The field has been in `sources/registry.yaml` since the second source and was
 * read by nobody: every extraction ran the one parser there was. That silence
 * was the risk, not the missing readers. A product declaring another framework
 * that happened to hold files matching this parser's shape was read by a parser
 * written for somebody else's product, and nothing downstream — the map, the
 * build, the delivered manual — carried a sign that it had been read wrong. A
 * wrong fact about which deployment sees what is the one defect a reader of the
 * manual cannot detect.
 *
 * Refusing is therefore the correct outcome, and it is not a dead end.
 * Extraction is an ACCELERATOR, not the pipeline: it turns a product's own code
 * into cited facts so content can be written against them faster. Content can
 * always be written against facts cited by hand from the same source, on
 * whichever axis actually varies — three of the four manuals this engine has
 * shipped were authored with no module map at all, one of them delivered.
 *
 * Adding a reader is additive and documented in `packages/extract/AGENTS.md`:
 * a new finder returning the same types, registered here. Nothing downstream of
 * `module-map.json` learns what a product is.
 */

/** Frameworks a reader exists for. Adding a finder means adding it here. */
export const EXTRACTORS = ["react-vite-ts"] as const;

/** A framework this package can read. */
export type Framework = (typeof EXTRACTORS)[number];

/**
 * Whether a reader exists for this framework.
 *
 * Takes `unknown` because a registry is hand-written YAML: an absent field, a
 * number or a typo all arrive here, and all mean the same thing — no reader.
 */
export function isSupportedFramework(value: unknown): value is Framework {
  return typeof value === "string" && (EXTRACTORS as readonly string[]).includes(value);
}

/**
 * Why this source cannot be extracted, or `null` when it can.
 *
 * A missing field is refused rather than defaulted. Defaulting would reinstate
 * exactly the behaviour this function exists to end: the one parser running on
 * whatever it was pointed at.
 */
export function extractorProblem(sourceId: string, framework: unknown): string | null {
  if (isSupportedFramework(framework)) return null;

  const declared = typeof framework === "string" ? `"${framework}"` : "no framework";
  return (
    `the registry entry for "${sourceId}" declares ${declared}, and this pipeline ` +
    `has a reader only for: ${EXTRACTORS.join(", ")}. Nothing was written — no ` +
    `parser ran, and no module map was touched.\n` +
    `\n` +
    `This is not a dead end. Extraction is OPTIONAL: it turns a product's code ` +
    `into cited facts so content can be authored against them faster, and a ` +
    `manual is built from content, never from the map. Author the sections ` +
    `citing the source by file and line, on whichever axis actually varies, and ` +
    `\`build\` works exactly the same.\n` +
    `\n` +
    `To read this product automatically instead, a finder for its shape is a new ` +
    `function returning the same types, registered in \`EXTRACTORS\`. See ` +
    `\`packages/extract/AGENTS.md\`.`
  );
}
