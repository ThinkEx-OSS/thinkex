import { describe, it, expect } from "vitest";
import {
  applyEdits,
  applyEditsBestEffort,
  replace,
  normalizeLineEndings,
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

describe("applyEdits", () => {
  it("performs exact single replacement", () => {
    const content = "# Title\n\nHello world";
    const result = applyEdits(content, [{ oldText: "Hello world", newText: "Goodbye world" }]);
    expect(result.newContent).toBe("# Title\n\nGoodbye world");
  });

  it("applies two disjoint replacements in one call", () => {
    const content = "aaa\nbbb\nccc";
    const result = applyEdits(content, [
      { oldText: "aaa", newText: "AAA" },
      { oldText: "ccc", newText: "CCC" },
    ]);
    expect(result.newContent).toBe("AAA\nbbb\nCCC");
  });

  it("edits applied to original content, not incrementally", () => {
    const content = "foo bar baz";
    const result = applyEdits(content, [
      { oldText: "foo", newText: "XXX" },
      { oldText: "baz", newText: "YYY" },
    ]);
    expect(result.newContent).toBe("XXX bar YYY");
  });

  it("throws on overlapping edits", () => {
    const content = "abcdef";
    expect(() =>
      applyEdits(content, [
        { oldText: "abcd", newText: "X" },
        { oldText: "cdef", newText: "Y" },
      ])
    ).toThrow(/overlap/i);
  });

  it("throws on duplicate oldText (matches multiple locations)", () => {
    const content = "foo bar foo bar";
    expect(() =>
      applyEdits(content, [{ oldText: "foo bar", newText: "replaced" }])
    ).toThrow(/occurrences/i);
  });

  it("throws multi-edit duplicate error with index", () => {
    const content = "foo bar foo bar";
    expect(() =>
      applyEdits(content, [
        { oldText: "foo bar", newText: "replaced" },
        { oldText: "something", newText: "else" },
      ])
    ).toThrow(/edits\[0\]/);
  });

  it("throws on empty oldText", () => {
    expect(() =>
      applyEdits("content", [{ oldText: "", newText: "new" }])
    ).toThrow(/oldText must not be empty/i);
  });

  it("throws multi-edit empty oldText error with index", () => {
    expect(() =>
      applyEdits("content", [
        { oldText: "content", newText: "x" },
        { oldText: "", newText: "new" },
      ])
    ).toThrow(/edits\[1\]\.oldText must not be empty/);
  });

  it("throws when no changes made (replacement produces identical content)", () => {
    const content = "hello";
    expect(() =>
      applyEdits(content, [{ oldText: "hello", newText: "hello" }])
    ).toThrow(/No changes made/i);
  });

  it("throws when oldText not found (single edit)", () => {
    expect(() =>
      applyEdits("actual content", [{ oldText: "typo contnet", newText: "replacement" }])
    ).toThrow(/Could not find the exact text/);
  });

  it("throws when oldText not found (multi edit)", () => {
    expect(() =>
      applyEdits("actual content", [
        { oldText: "actual", newText: "new" },
        { oldText: "missing", newText: "x" },
      ])
    ).toThrow(/Could not find edits\[1\]/);
  });

  it("unwraps code fence from oldText for JSON contexts", () => {
    const content = '{\n  "cards": []\n}';
    const oldFenced = '```json\n{\n  "cards": []\n}\n```';
    const result = applyEdits(content, [{ oldText: oldFenced, newText: '{"cards":[{"front":"A","back":"B"}]}' }]);
    expect(result.newContent).toBe('{"cards":[{"front":"A","back":"B"}]}');
  });

  it("normalizes fenced JSON newText in JSON edit contexts", () => {
    const content = '{\n  "questions": []\n}';
    const oldTail = "[]\n}";
    const fencedNew = '```json\n[\n  {\n    "id": "q2"\n  }\n]\n```';
    const result = applyEdits(content, [{ oldText: oldTail, newText: fencedNew }]);
    expect(result.newContent).toContain('"id": "q2"');
    expect(result.newContent).not.toContain("```");
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
      '      "correctIndex": 0',
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
      '      "correctIndex": 1',
      "    }",
      "  ]",
      "}",
    ].join("\n");

    const result = applyEdits(content, [{ oldText: oldTail, newText: newTail }]);
    expect(result.newContent).toContain('"id": "q2"');
    expect(result.newContent).toContain('"questionText": "Q2"');
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

    const result = applyEdits(content, [{ oldText: oldTail, newText: newTail }]);
    expect(result.newContent).toContain('"id": "c2"');
    expect(result.newContent).toContain('"front": "f2"');
  });

  it("preserves newlines and indentation in replacement", () => {
    const content = "before\n  indented\nafter";
    const result = applyEdits(content, [{ oldText: "  indented", newText: "  modified" }]);
    expect(result.newContent).toBe("before\n  modified\nafter");
  });

  it("handles CRLF normalization", () => {
    const contentWithCrlf = "# Title\r\n\r\nHello world";
    const result = applyEdits(contentWithCrlf, [{ oldText: "# Title\n\nHello world", newText: "# Title\n\nHi" }]);
    expect(result.newContent).toBe("# Title\n\nHi");
  });

  it("returns baseContent as normalized content", () => {
    const content = "hello\r\nworld";
    const result = applyEdits(content, [{ oldText: "hello", newText: "goodbye" }]);
    expect(result.baseContent).toBe("hello\nworld");
  });

  it("matches trimmed boundary text when unique", () => {
    const content = "  \n\n\n- Satisfaction\n  - Describe specific nonprofit *in detail*:\n  ...\n\n  \n\n\n";
    const result = applyEdits(content, [
      {
        oldText: "- Satisfaction\n  - Describe specific nonprofit *in detail*:\n  ...",
        newText: "- Satisfaction\n  - Describe specific nonprofit *in detail*:\n  - Updated details",
      },
    ]);
    expect(result.newContent).toContain("Updated details");
  });

  it("keeps ambiguity errors under lenient matching", () => {
    const block = "  \n\n\n- Satisfaction\n  ...\n\n  \n\n\n";
    const content = `${block}middle\n${block}`;
    expect(() =>
      applyEdits(content, [{ oldText: "- Satisfaction\n  ...", newText: "- Satisfaction\n  - updated" }]),
    ).toThrow(/occurrences/i);
  });
});

describe("applyEditsBestEffort", () => {
  it("applies successful edits and reports failed ones", () => {
    const content = "alpha\nbeta\ngamma";
    const result = applyEditsBestEffort(content, [
      { oldText: "beta", newText: "BETA" },
      { oldText: "missing", newText: "x" },
    ]);
    expect(result.newContent).toBe("alpha\nBETA\ngamma");
    expect(result.appliedEditIndices).toEqual([0]);
    expect(result.failedEdits).toEqual([
      expect.objectContaining({ index: 1 }),
    ]);
    expect(result.hadFailures).toBe(true);
  });
});

describe("replace (deprecated wrapper)", () => {
  it("performs exact string replacement", () => {
    const content = "# Title\n\nHello world";
    expect(replace(content, "Hello world", "Goodbye world")).toBe(
      "# Title\n\nGoodbye world"
    );
  });

  it("throws when oldString and newString are identical", () => {
    expect(() => replace("content", "content", "content")).toThrow(
      /No changes to apply/
    );
  });

  it("throws when oldString not found", () => {
    expect(() =>
      replace("actual content", "typo contnet", "replacement")
    ).toThrow(/Could not find/);
  });
});

describe("trimDiff", () => {
  it("trims common indentation from diff lines", () => {
    const diff = "--- a\n+++ b\n-    content\n+    new";
    const result = trimDiff(diff);
    expect(result).toContain("-content");
    expect(result).toContain("+new");
    expect(result).not.toContain("-    content");
  });
});
