import { describe, expect, it } from "vitest";
import { fixLLMDoubleEscaping } from "@/lib/utils/fix-markdown-from-llm";

describe("fixLLMDoubleEscaping", () => {
  it("converts literal newlines outside math", () => {
    expect(fixLLMDoubleEscaping("line1\\n\\nline2")).toContain("\n");
    expect(fixLLMDoubleEscaping("a\\n b")).toBe("a\n b");
    expect(fixLLMDoubleEscaping("line1\\nline2")).toBe("line1\\nline2");
  });

  it("preserves latex commands that begin with n", () => {
    expect(fixLLMDoubleEscaping("$a \\neq b$")).toBe("$a \\neq b$");
    expect(fixLLMDoubleEscaping("$\\nabla f$ and $\\nu$")).toBe(
      "$\\nabla f$ and $\\nu$",
    );
  });

  it("converts escaped apostrophes outside math", () => {
    expect(fixLLMDoubleEscaping("it\\'s fine")).toBe("it's fine");
  });

  it("leaves code fences unchanged", () => {
    const result = fixLLMDoubleEscaping("```\nvar\\nvalue\n```");
    expect(result).toBe("```\nvar\\nvalue\n```");
  });
});
