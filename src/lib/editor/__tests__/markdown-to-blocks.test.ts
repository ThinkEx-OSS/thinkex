import { describe, it, expect } from "vitest";
import {
  markdownToBlocks,
  fixLLMDoubleEscaping,
} from "@/lib/editor/markdown-to-blocks";

describe("fixLLMDoubleEscaping", () => {
  it("converts literal \\n to newline when NOT followed by letter (preserves \\neq, \\nabla)", () => {
    // \n followed by space or punctuation → convert (LLM meant newline)
    expect(fixLLMDoubleEscaping("line1\\n\\nline2")).toContain("\n");
    expect(fixLLMDoubleEscaping("a\\n b")).toBe("a\n b");
    // \n followed by letter → preserve (LaTeX e.g. \\neq, \\nabla)
    expect(fixLLMDoubleEscaping("line1\\nline2")).toBe("line1\\nline2");
  });

  it("preserves \\neq (LaTeX) - does not convert \\n to newline", () => {
    const result = fixLLMDoubleEscaping("$a \\neq b$");
    expect(result).toContain("\\neq");
    expect(result).not.toContain("\n");
  });

  it("preserves \\nabla and \\nu", () => {
    const result = fixLLMDoubleEscaping("$\\nabla f$ and $\\nu$");
    expect(result).toContain("\\nabla");
    expect(result).toContain("\\nu");
  });

  it("converts \\' to ' outside math", () => {
    expect(fixLLMDoubleEscaping("it\\'s fine")).toBe("it's fine");
  });

  it("does not modify content inside code blocks", () => {
    const result = fixLLMDoubleEscaping("```\nvar\\nvalue\n```");
    expect(result).toBe("```\nvar\\nvalue\n```");
  });
});

describe("markdownToBlocks - currency and math pipeline", () => {
  it("preserves \\$ (escaped currency) as $ in output", async () => {
    const md = "Cost is \\$19.99 today.";
    const blocks = await markdownToBlocks(md);
    const json = JSON.stringify(blocks);
    expect(json).toContain("$19.99");
    expect(json).not.toContain("\\$19.99");
  });

  it("parses $x^2$ as inline math", async () => {
    const md = "Formula $x^2$ here";
    const blocks = await markdownToBlocks(md);
    expect(blocks.length).toBeGreaterThanOrEqual(1);
    const block = blocks[0];
    const content = (block as any)?.content;
    expect(Array.isArray(content)).toBe(true);
    const mathNode = content?.find((c: any) => c.type === "inlineMath");
    expect(mathNode).toBeDefined();
    expect(mathNode!.props.latex).toBe("x^2");
  });

  it("parses $$E=mc^2$$ as block math", async () => {
    const md = "$$\nE=mc^2\n$$";
    const blocks = await markdownToBlocks(md);
    const mathBlock = blocks.find((b: any) => b.type === "math");
    expect(mathBlock).toBeDefined();
    expect((mathBlock as any).props.latex).toBe("E=mc^2");
  });

  it("keeps $5 as text when AI uses \\$5", async () => {
    const md = "Price is \\$5.";
    const blocks = await markdownToBlocks(md);
    const json = JSON.stringify(blocks);
    expect(json).toContain("5");
    // Should be plain text, not inlineMath with latex "5"
    const hasMathWithJust5 = json.includes('"latex":"5"');
    expect(hasMathWithJust5).toBe(false);
  });

  it("handles currency and math together", async () => {
    const md = "Cost \\$19.99. Formula $x^2$.";
    const blocks = await markdownToBlocks(md);
    const json = JSON.stringify(blocks);
    expect(json).toContain("19.99");
    expect(json).toContain("x^2");
  });
});
