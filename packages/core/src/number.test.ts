import { describe, expect, it } from "vitest";
import { z } from "zod";
import { catalog } from "@manualforge/blocks";
import type { BlockCatalog, BlockDefinition, BlockNode, ManualNode, SectionNode } from "@manualforge/blocks";
import { assignNumbers } from "./number.ts";

const fig = (id: string): BlockNode => ({
  kind: "block",
  id,
  type: "figure",
  props: { caption: "c", widthPercent: 100 },
});

const table = (id: string, rowIds: readonly string[]): BlockNode => ({
  kind: "block",
  id,
  type: "icon-table",
  props: {
    labelHeader: "Elemento",
    descriptionHeader: "Descripción",
    rows: rowIds.map((r) => ({ id: r, label: r, description: r })),
  },
});

const section = (id: string, children: readonly ManualNode[]): SectionNode => ({
  kind: "section",
  id,
  title: [{ kind: "text", value: id }],
  children,
});

/**
 * Test-only block types, one per `NumberingScope`, so numbering behaviour
 * for each scope can be exercised in isolation from the shipped catalogue.
 * Never add fixtures like these to `packages/blocks/src/catalog/`.
 */
const testCounterProps = z.object({});

const docCounterBlock: BlockDefinition<z.infer<typeof testCounterProps>> = {
  type: "test-doc-counter",
  version: "0.1.0",
  description: "Test-only block numbered with `document` scope.",
  schema: testCounterProps,
  children: { kind: "none" },
  numbering: { scope: "document", labelKey: "item" },
};

const sectionCounterBlock: BlockDefinition<z.infer<typeof testCounterProps>> = {
  type: "test-section-counter",
  version: "0.1.0",
  description: "Test-only block numbered with `section` scope.",
  schema: testCounterProps,
  children: { kind: "none" },
  numbering: { scope: "section", labelKey: "plate" },
};

const subCounterBlock: BlockDefinition<z.infer<typeof testCounterProps>> = {
  type: "test-sub-counter",
  version: "0.1.0",
  description: "Test-only block numbered with `subsection` scope.",
  schema: testCounterProps,
  children: { kind: "none" },
  numbering: { scope: "subsection", labelKey: "note" },
};

/** Numbers its own items, held in a prop that is NOT called `rows`. */
const stepsProps = z.object({
  steps: z.array(z.object({ id: z.string() })),
  continues: z.string().optional(),
});

const stepsBlock: BlockDefinition<z.infer<typeof stepsProps>> = {
  type: "test-steps",
  version: "0.1.0",
  description: "Test-only container numbered with `block` scope.",
  schema: stepsProps,
  children: { kind: "none" },
  numbering: {
    scope: "block",
    labelKey: "step",
    itemsProp: "steps",
    continuesProp: "continues",
  },
};

/** Numbered block that merely happens to own an unrelated `rows` prop. */
const rowsNamedBlock: BlockDefinition<{ rows: string[] }> = {
  type: "test-rows-named",
  version: "0.1.0",
  description: "Test-only block whose `rows` prop is not a set of numbered items.",
  schema: z.object({ rows: z.array(z.string()) }),
  children: { kind: "none" },
  numbering: { scope: "subsection", labelKey: "widget" },
};

const catalogWithTestBlocks: BlockCatalog = new Map([
  ...catalog,
  [docCounterBlock.type, docCounterBlock],
  [sectionCounterBlock.type, sectionCounterBlock],
  [subCounterBlock.type, subCounterBlock],
  [stepsBlock.type, stepsBlock as never],
  [rowsNamedBlock.type, rowsNamedBlock as never],
]);

const docItem = (id: string): BlockNode => ({ kind: "block", id, type: docCounterBlock.type, props: {} });
const subItem = (id: string): BlockNode => ({ kind: "block", id, type: subCounterBlock.type, props: {} });
const secItem = (id: string): BlockNode => ({ kind: "block", id, type: sectionCounterBlock.type, props: {} });

const steps = (id: string, stepIds: readonly string[], continues?: string): BlockNode => ({
  kind: "block",
  id,
  type: stepsBlock.type,
  props: {
    steps: stepIds.map((s) => ({ id: s })),
    ...(continues === undefined ? {} : { continues }),
  },
});

describe("assignNumbers", () => {
  it("numbers top-level sections from one", () => {
    const { numbers: n, figures } = assignNumbers([section("a", []), section("b", [])], catalog);
    expect(n.get("a")).toBe("1");
    expect(n.get("b")).toBe("2");
  });

  it("numbers nested sections by their position in the tree", () => {
    const { numbers: n, figures } = assignNumbers(
      [section("a", [section("a.x", []), section("a.y", [section("a.y.1", [])])])],
      catalog,
    );
    expect(n.get("a.x")).toBe("1.1");
    expect(n.get("a.y")).toBe("1.2");
    expect(n.get("a.y.1")).toBe("1.2.1");
  });

  it("renumbers after an earlier section is absent", () => {
    // Conditioning removed what would have been section 1.
    const { numbers: n, figures } = assignNumbers([section("b", []), section("c", [])], catalog);
    expect(n.get("b")).toBe("1");
    expect(n.get("c")).toBe("2");
  });

  it("numbers figures within their section and resets per section", () => {
    const { numbers: n, figures } = assignNumbers(
      [
        section("a", [fig("a.f1"), fig("a.f2")]),
        section("b", [fig("b.f1")]),
      ],
      catalog,
    );
    expect(figures.get("a.f1")).toBe("1.1");
    expect(figures.get("a.f2")).toBe("1.2");
    expect(figures.get("b.f1")).toBe("2.1");
  });

  it("figure is `section`-scoped: nested subsections keep counting against their top-level section, not their own subsection", () => {
    const { numbers: n, figures } = assignNumbers(
      [section("a", [fig("a.f1"), section("a.x", [fig("a.x.f1")])])],
      catalog,
    );
    expect(figures.get("a.f1")).toBe("1.1");
    // Nested one level deeper, but still counted against top-level section "a".
    expect(figures.get("a.x.f1")).toBe("1.2");
  });

  it("`document` scope keeps one counter for the whole manual, never reset", () => {
    const { numbers: n, figures } = assignNumbers(
      [
        section("a", [docItem("a.d1"), docItem("a.d2")]),
        section("b", [section("b.x", [docItem("b.x.d1")])]),
      ],
      catalogWithTestBlocks,
    );
    expect(n.get("a.d1")).toBe("1");
    expect(n.get("a.d2")).toBe("2");
    expect(n.get("b.x.d1")).toBe("3");
  });

  it("`section` scope resets at each top-level section and ignores nesting depth", () => {
    const { numbers: n } = assignNumbers(
      [
        section("a", [secItem("a.p1"), section("a.x", [secItem("a.x.p1"), secItem("a.x.p2")])]),
        section("b", [secItem("b.p1")]),
      ],
      catalogWithTestBlocks,
    );
    expect(n.get("a.p1")).toBe("1.1");
    expect(n.get("a.x.p1")).toBe("1.2");
    expect(n.get("a.x.p2")).toBe("1.3");
    // A new top-level section resets the counter.
    expect(n.get("b.p1")).toBe("2.1");
  });

  it("`subsection` scope resets at every section, at any depth", () => {
    const { numbers: n, figures } = assignNumbers(
      [section("a", [subItem("a.s1"), section("a.x", [subItem("a.x.s1")])])],
      catalogWithTestBlocks,
    );
    expect(n.get("a.s1")).toBe("1.1");
    expect(n.get("a.x.s1")).toBe("1.1.1");
  });

  it("numbers table rows against the owning subsection", () => {
    const { numbers: n, figures } = assignNumbers(
      [section("a", [section("a.x", [table("a.x.t", ["r1", "r2", "r3"])])])],
      catalog,
    );
    expect(n.get("r1")).toBe("1.1.1");
    expect(n.get("r2")).toBe("1.1.2");
    expect(n.get("r3")).toBe("1.1.3");
  });

  it("renumbers rows after conditioning removed one", () => {
    const { numbers: n, figures } = assignNumbers(
      [section("a", [section("a.x", [table("a.x.t", ["r1", "r3"])])])],
      catalog,
    );
    expect(n.get("r1")).toBe("1.1.1");
    expect(n.get("r3")).toBe("1.1.2");
  });

  it("`block` scope numbers items with a bare ordinal, restarting per instance", () => {
    const { numbers: n, figures } = assignNumbers(
      [section("a", [steps("a.p1", ["s1", "s2"]), steps("a.p2", ["s3"])])],
      catalogWithTestBlocks,
    );
    expect(n.get("s1")).toBe("1");
    expect(n.get("s2")).toBe("2");
    // A second procedure in the same section restarts — steps are local to
    // their procedure, unlike table rows which continue across sibling tables.
    expect(n.get("s3")).toBe("1");
  });

  // A block-scoped counter is deliberately throwaway, so the only way to put a
  // table between step 9 and step 10 without the steps restarting at 1 is to say
  // so explicitly. The reference is to a node id rather than a starting number,
  // so inserting a step in the first half cannot leave the second half stale.
  it("`continues` carries a block-scoped count into a later block of the same type", () => {
    const { numbers: n } = assignNumbers(
      [
        section("a", [
          steps("a.p1", ["s1", "s2"]),
          table("a.t", ["r1"]),
          steps("a.p2", ["s3", "s4"], "a.p1"),
        ]),
      ],
      catalogWithTestBlocks,
    );
    expect(n.get("s2")).toBe("2");
    expect(n.get("s3")).toBe("3");
    expect(n.get("s4")).toBe("4");
  });

  it("`continues` chains, so a count can survive more than one interruption", () => {
    const { numbers: n } = assignNumbers(
      [
        section("a", [
          steps("a.p1", ["s1"]),
          steps("a.p2", ["s2"], "a.p1"),
          steps("a.p3", ["s3"], "a.p2"),
        ]),
      ],
      catalogWithTestBlocks,
    );
    expect(n.get("s3")).toBe("3");
  });

  it("`continues` reaches across a section boundary when asked to", () => {
    const { numbers: n } = assignNumbers(
      [section("a", [steps("a.p", ["s1", "s2"])]), section("b", [steps("b.p", ["s3"], "a.p")])],
      catalogWithTestBlocks,
    );
    expect(n.get("s3")).toBe("3");
  });

  // Silently starting from zero would produce a manual numbered 1..5 where it
  // should read 10..14, with nothing failing and no warning anywhere.
  it("refuses a `continues` naming a block that does not exist", () => {
    expect(() =>
      assignNumbers([section("a", [steps("a.p", ["s1"], "a.typo")])], catalogWithTestBlocks),
    ).toThrow(/a\.typo/);
  });

  it("refuses a `continues` naming a block that has not been counted yet", () => {
    expect(() =>
      assignNumbers(
        [section("a", [steps("a.p1", ["s1"], "a.p2"), steps("a.p2", ["s2"])])],
        catalogWithTestBlocks,
      ),
    ).toThrow(/a\.p2/);
  });

  it("`block` scope restarts in every section too", () => {
    const { numbers: n, figures } = assignNumbers(
      [section("a", [steps("a.p", ["s1", "s2"])]), section("b", [steps("b.p", ["s3"])])],
      catalogWithTestBlocks,
    );
    expect(n.get("s2")).toBe("2");
    expect(n.get("s3")).toBe("1");
  });

  it("renumbers items after conditioning removed one", () => {
    const { numbers: n, figures } = assignNumbers(
      [section("a", [steps("a.p", ["s1", "s3"])])],
      catalogWithTestBlocks,
    );
    expect(n.get("s1")).toBe("1");
    expect(n.get("s3")).toBe("2");
  });

  it("numbers a block itself when it declares no `itemsProp`, even if it owns a `rows` prop", () => {
    const widget: BlockNode = {
      kind: "block",
      id: "a.w",
      type: rowsNamedBlock.type,
      props: { rows: ["not", "numbered", "items"] },
    };
    const { numbers: n, figures } = assignNumbers([section("a", [widget])], catalogWithTestBlocks);
    // The block gets the ordinal; the strings inside `rows` get nothing.
    expect(n.get("a.w")).toBe("1.1");
  });
});
