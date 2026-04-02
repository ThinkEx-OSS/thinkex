import { describe, it, expect } from "vitest";
import { serializeBlockNote } from "@/lib/utils/serialize-blocknote";

/**
 * Minimal block structures for testing. BlockNote Block type is strict; we use
 * plain objects and cast to any to test serializeBlockNote runtime behavior.
 */
const mkParagraph = (text: string) =>
  ({
    id: "p1",
    type: "paragraph",
    props: {},
    content: [{ type: "text", text, styles: {} }],
    children: [],
  }) as any;

const mkHeading = (level: number, text: string) =>
  ({
    id: "h1",
    type: "heading",
    props: { level },
    content: [{ type: "text", text, styles: {} }],
    children: [],
  }) as any;

const mkMathBlock = (latex: string) =>
  ({
    id: "m1",
    type: "math",
    props: { latex },
    content: "none",
    children: [],
  }) as any;

describe("serializeBlockNote", () => {
  it("returns empty string for empty blocks", () => {
    expect(serializeBlockNote([])).toBe("");
  });

  it("serializes paragraph", () => {
    expect(serializeBlockNote([mkParagraph("Hello")])).toBe("Hello\n\n");
  });

  it("serializes heading", () => {
    expect(serializeBlockNote([mkHeading(1, "Title")])).toBe("# Title\n\n");
  });

  it("serializes math block with newlines around latex", () => {
    expect(serializeBlockNote([mkMathBlock("x^2")])).toBe("$$\nx^2\n$$\n\n");
  });

  it("serializes multiple blocks", () => {
    const blocks = [
      mkHeading(1, "Note"),
      mkParagraph("First"),
      mkParagraph("Second"),
    ];
    const result = serializeBlockNote(blocks as any);
    expect(result).toContain("# Note\n\n");
    expect(result).toContain("First\n\n");
    expect(result).toContain("Second\n\n");
  });

  it("round-trip: serialized format is suitable for editItem oldString", () => {
    const blocks = [mkHeading(2, "Section"), mkParagraph("Content")];
    const md = serializeBlockNote(blocks as any);
    // No extra wrapper like "   - Content:" - raw markdown
    expect(md.startsWith("#")).toBe(true);
    expect(md).not.toMatch(/^\s*-\s*Content:/m);
  });

  it("handles cmsc351-style structure: heading + bold paragraph + numbered list + inlineMath", () => {
    // Structure from real workspace (Insertion Sort document)
    const blocks = [
      {
        id: "h1",
        type: "heading",
        props: { level: 2, textColor: "default", isToggleable: false },
        content: [{ type: "text", text: "Simple Explanation", styles: {} }],
        children: [],
      },
      {
        id: "p1",
        type: "paragraph",
        props: {},
        content: [
          { type: "text", text: "The Idea:", styles: { bold: true } },
          {
            type: "text",
            text: " Take each card from left to right.",
            styles: {},
          },
        ],
        children: [],
      },
      ...["First item", "Second item", "Third item"].map((text, i) => ({
        id: `n${i}`,
        type: "numberedListItem",
        props: {},
        content: [{ type: "text", text, styles: {} }],
        children: [],
      })),
      {
        id: "p2",
        type: "paragraph",
        props: {},
        content: [
          { type: "text", text: "Time:", styles: { bold: true } },
          { type: "text", text: " Takes about ", styles: {} },
          { type: "inlineMath", props: { latex: "n^2" } },
          {
            type: "text",
            text: " steps for n items.",
            styles: {},
          },
        ],
        children: [],
      },
    ];
    const md = serializeBlockNote(blocks as any);

    expect(md).toContain("## Simple Explanation\n\n");
    expect(md).toContain("**The Idea:** Take each card from left to right.");
    expect(md).toMatch(/1\. First item/);
    expect(md).toMatch(/2\. Second item/);
    expect(md).toMatch(/3\. Third item/);
    expect(md).toContain("**Time:** Takes about ");
    expect(md).toContain("$n^2$");
    expect(md).toContain(" steps for n items.");
  });

  it("handles empty paragraph content", () => {
    const blocks = [
      {
        id: "p1",
        type: "paragraph",
        props: {},
        content: [],
        children: [],
      },
    ];
    expect(serializeBlockNote(blocks as any)).toBe("\n\n");
  });
});
