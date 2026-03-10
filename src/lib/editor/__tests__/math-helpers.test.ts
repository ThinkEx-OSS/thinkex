import { describe, it, expect } from "vitest";
import {
  convertMathInBlocks,
  CURRENCY_PLACEHOLDER,
} from "@/lib/editor/math-helpers";

const mkParagraph = (text: string, id = "p1") => ({
  id,
  type: "paragraph",
  content: [{ type: "text", text, styles: {} }],
  children: [],
});

describe("convertMathInBlocks - currency and math", () => {
  describe("currency protection (bare $5, $19.99)", () => {
    it("leaves bare $5 as plain text, not inlineMath", () => {
      const blocks = [mkParagraph("The cost is $5 today.")];
      const result = convertMathInBlocks(blocks);
      expect(result).toHaveLength(1);
      expect(result[0]!.type).toBe("paragraph");
      const content = (result[0] as any).content;
      expect(content).toHaveLength(1);
      expect(content[0]!.type).toBe("text");
      expect(content[0]!.text).toBe("The cost is $5 today.");
    });

    it("leaves $19.99 as plain text", () => {
      const blocks = [mkParagraph("Price: $19.99")];
      const result = convertMathInBlocks(blocks);
      const text = (result[0] as any).content[0].text;
      expect(text).toBe("Price: $19.99");
    });

    it("leaves $1,000.50 as plain text", () => {
      const blocks = [mkParagraph("Total: $1,000.50")];
      const result = convertMathInBlocks(blocks);
      const text = (result[0] as any).content[0].text;
      expect(text).toBe("Total: $1,000.50");
    });

    it("leaves $100k and $100M as plain text (k/M suffixes)", () => {
      const blocks = [mkParagraph("Budget: $100k revenue $100M target.")];
      const result = convertMathInBlocks(blocks);
      const text = (result[0] as any).content[0].text;
      expect(text).toBe("Budget: $100k revenue $100M target.");
    });

    it("does NOT treat $127$ as currency (dollar both sides = math)", () => {
      const blocks = [mkParagraph("Value $127$ dollars")];
      const result = convertMathInBlocks(blocks);
      const content = (result[0] as any).content;
      // Should have inlineMath for "127"
      const mathNode = content.find((c: any) => c.type === "inlineMath");
      expect(mathNode).toBeDefined();
      expect(mathNode.props.latex).toBe("127");
    });
  });

  describe("math conversion", () => {
    it("converts $x^2$ to inlineMath", () => {
      const blocks = [mkParagraph("Formula $x^2$ here")];
      const result = convertMathInBlocks(blocks);
      const content = (result[0] as any).content;
      const mathNode = content.find((c: any) => c.type === "inlineMath");
      expect(mathNode).toBeDefined();
      expect(mathNode.props.latex).toBe("x^2");
    });

    it("converts $$x^2$$ alone in paragraph to block math", () => {
      const blocks = [mkParagraph("$$x^2$$")];
      const result = convertMathInBlocks(blocks);
      expect(result).toHaveLength(1);
      expect(result[0]!.type).toBe("math");
      expect((result[0] as any).props.latex).toBe("x^2");
    });

    it("converts $$E=mc^2$$ to math block", () => {
      const blocks = [mkParagraph("$$E=mc^2$$")];
      const result = convertMathInBlocks(blocks);
      expect((result[0] as any).props.latex).toBe("E=mc^2");
    });
  });

  describe("mixed currency and math", () => {
    it("keeps $5 as text and $x^2$ as math in same paragraph", () => {
      const blocks = [mkParagraph("Cost is $5. Formula: $x^2$.")];
      const result = convertMathInBlocks(blocks);
      const content = (result[0] as any).content;
      const textParts = content.filter((c: any) => c.type === "text");
      const mathParts = content.filter((c: any) => c.type === "inlineMath");
      expect(textParts.some((t: any) => t.text?.includes("$5"))).toBe(true);
      expect(mathParts).toHaveLength(1);
      expect(mathParts[0].props.latex).toBe("x^2");
    });

    it("handles $19.99 and $E=mc^2$ in same text", () => {
      const blocks = [mkParagraph("Price $19.99. Famous: $E=mc^2$.")];
      const result = convertMathInBlocks(blocks);
      const content = (result[0] as any).content;
      const mathNode = content.find((c: any) => c.type === "inlineMath");
      expect(mathNode.props.latex).toBe("E=mc^2");
      const fullText = content
        .filter((c: any) => c.type === "text")
        .map((c: any) => c.text)
        .join("");
      expect(fullText).toContain("$19.99");
    });
  });

  describe("CURRENCY_PLACEHOLDER", () => {
    it("contains no $ so regex skips it", () => {
      expect(CURRENCY_PLACEHOLDER).not.toContain("$");
    });
  });
});
