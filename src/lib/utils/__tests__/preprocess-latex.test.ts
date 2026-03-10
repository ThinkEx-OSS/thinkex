import { describe, it, expect } from "vitest";
import { preprocessLatex } from "@/lib/utils/preprocess-latex";

describe("preprocessLatex - currency and math", () => {
  describe("currency protection", () => {
    it("preserves $5 as text (not math)", () => {
      const result = preprocessLatex("The cost is $5 today.");
      expect(result).toBe("The cost is $5 today.");
    });

    it("preserves $19.99 as text", () => {
      const result = preprocessLatex("Price: $19.99");
      expect(result).toBe("Price: $19.99");
    });

    it("preserves $1,000.50 with commas", () => {
      const result = preprocessLatex("Total: $1,000.50");
      expect(result).toBe("Total: $1,000.50");
    });

    it("preserves multiple currency values in one string", () => {
      const result = preprocessLatex("Items: $5, $19.99, and $1,000");
      expect(result).toBe("Items: $5, $19.99, and $1,000");
    });

    it("preserves $100k and $100M (k/M suffixes)", () => {
      const result = preprocessLatex("Budget: $100k revenue $100M target.");
      expect(result).toBe("Budget: $100k revenue $100M target.");
    });

    it("does NOT protect $127$ (math - dollar on both sides)", () => {
      const input = "The formula $127$ is wrong";
      const result = preprocessLatex(input);
      // $127$ is not currency (dollar on both sides), so we leave it unchanged
      expect(result).toBe(input);
    });
  });

  describe("LaTeX delimiter conversion", () => {
    it("converts \\(...\\) to $...$ (inline math)", () => {
      const result = preprocessLatex("Formula: \\(x^2\\) here");
      expect(result).toBe("Formula: $x^2$ here");
    });

    it("converts \\[...\\] to $$...$$ (display math)", () => {
      const result = preprocessLatex("Display: \\[E=mc^2\\]");
      expect(result).toBe("Display: $$E=mc^2$$");
    });

    it("handles multiline display math", () => {
      const result = preprocessLatex("\\[\\int_0^1 x \\, dx\\]");
      expect(result).toBe("$$\\int_0^1 x \\, dx$$");
    });
  });

  describe("code block preservation", () => {
    it("does not modify content inside code blocks", () => {
      const md = "```\n$5 and \\(x\\)\n```";
      const result = preprocessLatex(md);
      expect(result).toBe("```\n$5 and \\(x\\)\n```");
    });

    it("does not modify inline code", () => {
      const result = preprocessLatex("Use `$var` in code");
      expect(result).toBe("Use `$var` in code");
    });
  });

  describe("mixed content", () => {
    it("handles currency and math in same string", () => {
      const result = preprocessLatex(
        "Cost is $19.99. The formula \\(E=mc^2\\) is famous."
      );
      expect(result).toContain("$19.99");
      expect(result).toContain("$E=mc^2$");
    });

    it("handles currency adjacent to math", () => {
      const result = preprocessLatex("Price $5. The formula $x^2$ works.");
      expect(result).toContain("$5.");
      expect(result).toContain("$x^2$");
    });
  });
});
