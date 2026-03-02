import { describe, it, expect } from "vitest";
import {
  getNoteContentAsMarkdown,
  formatItemContent,
} from "@/lib/utils/format-workspace-context";
import { replace } from "@/lib/utils/edit-replace";
import type { Item, NoteData } from "@/lib/workspace-state/types";

/**
 * Minimal Block structure matching BlockNote schema (paragraph, heading, math).
 * Avoids importing full BlockNoteEditor which has React deps.
 */
function mkParagraph(text: string, id = "p1") {
  return {
    id,
    type: "paragraph",
    content: [{ type: "text", text, styles: {} }],
    children: [],
  };
}

function mkHeading(level: number, text: string, id = "h1") {
  return {
    id,
    type: "heading",
    props: { level },
    content: [{ type: "text", text, styles: {} }],
    children: [],
  };
}

function mkMathBlock(latex: string, id = "m1") {
  return {
    id,
    type: "math",
    props: { latex },
    content: "none",
    children: [],
  };
}

function mkNoteItem(
  blockContent: unknown[],
  overrides: Partial<Item> = {}
): Item {
  return {
    id: "note-1",
    name: "Test Note",
    type: "note",
    subtitle: "",
    data: { blockContent } as NoteData,
    ...overrides,
  };
}

describe("getNoteContentAsMarkdown", () => {
  it("returns empty string for empty blockContent", () => {
    expect(getNoteContentAsMarkdown({} as NoteData)).toBe("");
  });

  it("returns empty string when blockContent is empty array", () => {
    expect(getNoteContentAsMarkdown({ blockContent: [] } as NoteData)).toBe("");
  });

  it("serializes paragraph block", () => {
    const data = {
      blockContent: [mkParagraph("Hello world")],
    } as NoteData;
    expect(getNoteContentAsMarkdown(data)).toBe("Hello world\n\n");
  });

  it("serializes heading block", () => {
    const data = {
      blockContent: [mkHeading(1, "Title")],
    } as NoteData;
    expect(getNoteContentAsMarkdown(data)).toBe("# Title\n\n");
  });

  it("serializes math block", () => {
    const data = {
      blockContent: [mkMathBlock("x^2")],
    } as NoteData;
    expect(getNoteContentAsMarkdown(data)).toBe("$$\nx^2\n$$\n\n");
  });

  it("normalizes \\r\\n to \\n", () => {
    // Use text with CRLF to exercise normalization path
    const block = mkParagraph("line1\r\nline2");
    const data = {
      blockContent: [block],
    } as NoteData;
    const content = getNoteContentAsMarkdown(data);
    expect(content).not.toContain("\r\n");
    expect(content).toBe("line1\nline2\n\n");
  });
});

describe("formatItemContent (readWorkspace format) matches getNoteContentAsMarkdown (edit search)", () => {
  /**
   * Critical: content shown by readWorkspace must be exactly what editItem searches.
   * So the editable portion of formatItemContent output must equal getNoteContentAsMarkdown.
   */
  it("note content from formatItemContent starts with raw markdown (no wrapper)", () => {
    const blockContent = [mkHeading(1, "Test"), mkParagraph("Body text")];
    const item = mkNoteItem(blockContent);

    const formatted = formatItemContent(item);
    const rawContent = getNoteContentAsMarkdown(item.data as NoteData);

    // The formatted output for a note should BEGIN with the raw content
    // (sources, if any, come after a blank line and "Sources:")
    expect(formatted.startsWith(rawContent)).toBe(true);
    expect(formatted.trimEnd()).toBe(rawContent.trimEnd());
  });

  it("oldString copied from readWorkspace (strip line numbers) can be used in replace", () => {
    const blockContent = [
      mkHeading(1, "My Note"),
      mkParagraph("First para"),
      mkParagraph("Second para"),
    ];
    const item = mkNoteItem(blockContent);
    const rawContent = getNoteContentAsMarkdown(item.data as NoteData);

    // Simulate readWorkspace: split into lines, add "N: " prefix
    const lines = rawContent.split(/\r?\n/);
    const numbered = lines.map((line, i) => `${i + 1}: ${line}`).join("\n");

    // Simulate AI stripping line numbers: take content after "N: " from each line
    const stripped = numbered
      .split("\n")
      .map((l) => l.replace(/^\d+:\s*/, ""))
      .join("\n");

    expect(stripped).toBe(rawContent);

    // Now apply replace - must succeed
    const newContent = replace(
      rawContent,
      "First para",
      "Updated para"
    );
    expect(newContent).toContain("Updated para");
    expect(newContent).not.toContain("First para");
  });
});
