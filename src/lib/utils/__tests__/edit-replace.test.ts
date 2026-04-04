import { describe, it, expect } from "vitest";
import {
  replace,
  normalizeLineEndings,
  unescapeString,
  trimDiff,
} from "@/lib/utils/edit-replace";

describe("normalizeLineEndings", () => {
  it("converts CRLF to LF", () => {
    expect(normalizeLineEndings("a\r\nb\r\nc")).toBe("a\nb\nc");
  });

  it("leaves plain LF unchanged", () => {
    expect(normalizeLineEndings("a\nb\nc")).toBe("a\nb\nc");
  });

  it("handles mixed line endings", () => {
    expect(normalizeLineEndings("a\r\nb\nc\r\n")).toBe("a\nb\nc\n");
  });
});

describe("replace (edit/replace for oldString/newString)", () => {
  it("performs exact string replacement", () => {
    const content = "# Title\n\nHello world";
    expect(replace(content, "Hello world", "Goodbye world")).toBe(
      "# Title\n\nGoodbye world"
    );
  });

  it("replace with normalized line endings (worker normalizes before calling)", () => {
    const contentWithCrlf = "# Title\r\n\r\nHello world";
    const oldStr = "# Title\n\nHello world";
    // After normalizing both (as worker does), replace succeeds.
    // Raw CRLF may or may not match depending on replacers; we always normalize.
    const normalized = contentWithCrlf.replaceAll("\r\n", "\n");
    expect(replace(normalized, oldStr, "# Title\n\nHi")).toBe("# Title\n\nHi");
  });

  it("throws when oldString not found", () => {
    expect(() =>
      replace("actual content", "typo contnet", "replacement")
    ).toThrow("Could not find oldString");
  });

  it("throws when oldString matches multiple times without replaceAll", () => {
    expect(() =>
      replace("foo bar foo bar", "foo bar", "replaced")
    ).toThrow("multiple matches");
  });

  it("replaces all occurrences when replaceAll=true", () => {
    expect(
      replace("foo bar foo bar", "foo bar", "x", true)
    ).toBe("x x");
  });

  it("uses LineTrimmedReplacer when exact match has extra whitespace", () => {
    const content = "  line1  \n  line2  \n  line3  ";
    const find = "line1\nline2\nline3";
    const result = replace(content, find, "replaced");
    expect(result).toBe("replaced");
  });

  it("preserves newlines and indentation in replacement", () => {
    const content = "before\n  indented\nafter";
    expect(
      replace(content, "  indented", "  modified")
    ).toBe("before\n  modified\nafter");
  });

  it("handles math block format from workspace_read", () => {
    const content = "# Note\n\n$$\nx^2\n$$\n\nMore text";
    expect(replace(content, "$$\nx^2\n$$\n\n", "$$\n2x\n$$\n\n")).toBe(
      "# Note\n\n$$\n2x\n$$\n\nMore text"
    );
  });

  it("handles oldString wrapped in code fences", () => {
    const content = "{\n  \"cards\": []\n}";
    const oldFenced = "```json\n{\n  \"cards\": []\n}\n```";
    const result = replace(content, oldFenced, "{\"cards\":[{\"front\":\"A\",\"back\":\"B\"}]}");
    expect(result).toBe("{\"cards\":[{\"front\":\"A\",\"back\":\"B\"}]}");
  });

  it("normalizes fenced JSON newString in JSON edit contexts", () => {
    const content = "{\n  \"questions\": []\n}";
    const oldTail = "[]\n}";
    const fencedNew = "```json\n[\n  {\n    \"id\": \"q2\"\n  }\n]\n```";
    const result = replace(content, oldTail, fencedNew);
    expect(result).toContain('"id": "q2"');
    expect(result).not.toContain("```");
  });

  it("supports appending a quiz question near end of JSON", () => {
    const content = [
      "{",
      '  "questions": [',
      "    {",
      '      "id": "q1",',
      '      "type": "multiple_choice",',
      '      "questionText": "Q1",',
      '      "options": ["A", "B", "C", "D"],',
      '      "correctIndex": 0,',
      '      "explanation": "e1"',
      "    }",
      "  ]",
      "}",
    ].join("\n");

    const oldTail = "  ]\n}";
    const newTail = [
      "    ,",
      "    {",
      '      "id": "q2",',
      '      "type": "multiple_choice",',
      '      "questionText": "Q2",',
      '      "options": ["A", "B", "C", "D"],',
      '      "correctIndex": 1,',
      '      "explanation": "e2"',
      "    }",
      "  ]",
      "}",
    ].join("\n");

    const result = replace(content, oldTail, newTail);
    expect(result).toContain('"id": "q2"');
    expect(result).toContain('"questionText": "Q2"');
  });

  it("supports appending a flashcard near end of JSON", () => {
    const content = [
      "{",
      '  "cards": [',
      "    {",
      '      "id": "c1",',
      '      "front": "f1",',
      '      "back": "b1"',
      "    }",
      "  ]",
      "}",
    ].join("\n");

    const oldTail = "  ]\n}";
    const newTail = [
      "    ,",
      "    {",
      '      "id": "c2",',
      '      "front": "f2",',
      '      "back": "b2"',
      "    }",
      "  ]",
      "}",
    ].join("\n");

    const result = replace(content, oldTail, newTail);
    expect(result).toContain('"id": "c2"');
    expect(result).toContain('"front": "f2"');
  });

  it("preserves ambiguity error when multiple matches remain", () => {
    const content = "foo\nfoo\nfoo";
    expect(() => replace(content, "foo", "bar")).toThrow("multiple matches");
  });
});

describe("unescapeString", () => {
  it("converts literal \\n to newline", () => {
    expect(unescapeString("a\\nb")).toBe("a\nb");
  });

  it("converts \\$ to $", () => {
    expect(unescapeString("\\$5")).toBe("$5");
  });
});

describe("trimDiff", () => {
  it("trims common indentation from diff lines", () => {
    const diff = "--- a\n+++ b\n-    content\n+    new";
    const result = trimDiff(diff);
    // trimDiff finds min leading whitespace (4) and trims that from each content line
    expect(result).toContain("-content");
    expect(result).toContain("+new");
    expect(result).not.toContain("-    content");
  });
});
