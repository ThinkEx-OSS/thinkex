import { describe, expect, it } from "vitest";
import { withSanitizedModelOutput } from "../tool-utils";

/**
 * Extract the toModelOutput function from a wrapped tool definition.
 */
function getToModelOutput(toolDef: Record<string, any>) {
  const wrapped = withSanitizedModelOutput(toolDef);
  return (wrapped as any).toModelOutput as (args: { output: any }) => {
    type: string;
    value: any;
  };
}

describe("withSanitizedModelOutput", () => {
  // ── Basics ──────────────────────────────────────────────

  it("attaches toModelOutput to the tool definition", () => {
    const toolDef = { description: "test" };
    const result = withSanitizedModelOutput(toolDef);
    expect((result as any).toModelOutput).toBeTypeOf("function");
  });

  it("returns the same object reference (mutation, not copy)", () => {
    const toolDef = { description: "test" };
    const result = withSanitizedModelOutput(toolDef);
    expect(result).toBe(toolDef);
  });

  // ── Field stripping ─────────────────────────────────────

  it("strips event from output", () => {
    const toModelOutput = getToModelOutput({});
    const result = toModelOutput({
      output: {
        success: true,
        message: "Created note",
        event: { id: "evt-1", type: "ITEM_CREATED", payload: { huge: "data" } },
        version: 42,
      },
    });
    expect(result.value).not.toHaveProperty("event");
  });

  it("strips version from output", () => {
    const toModelOutput = getToModelOutput({});
    const result = toModelOutput({
      output: { success: true, message: "Done", version: 42 },
    });
    expect(result.value).not.toHaveProperty("version");
  });

  it("strips itemId from output", () => {
    const toModelOutput = getToModelOutput({});
    const result = toModelOutput({
      output: { success: true, message: "Done", itemId: "abc-123" },
    });
    expect(result.value).not.toHaveProperty("itemId");
  });

  it("strips all client-only and redundant fields", () => {
    const toModelOutput = getToModelOutput({});
    const result = toModelOutput({
      output: {
        success: true,
        message: "Created quiz",
        event: { id: "evt-1" },
        version: 10,
        itemId: "q-1",
        quizId: "q-1",
        noteId: "n-1",
        interactionId: "int-1",
        cardCount: 5,
        questionCount: 3,
        deletedItem: "Old Note",
        itemName: "My Quiz",
        title: "Quiz Title",
      },
    });
    expect(result.value).toEqual({
      success: true,
      message: "Created quiz",
    });
  });

  // ── Field preservation ──────────────────────────────────

  it("preserves success and message", () => {
    const toModelOutput = getToModelOutput({});
    const result = toModelOutput({
      output: { success: true, message: "Created note successfully" },
    });
    expect(result.value).toEqual({
      success: true,
      message: "Created note successfully",
    });
  });

  it("preserves diff and filediff for edit results", () => {
    const toModelOutput = getToModelOutput({});
    const result = toModelOutput({
      output: {
        success: true,
        message: "Updated note",
        event: { id: "evt-2" },
        version: 5,
        itemId: "note-1",
        diff: "--- note\n+++ note\n@@ -1 +1 @@\n-old\n+new",
        filediff: { additions: 1, deletions: 1 },
      },
    });
    expect(result.value).toEqual({
      success: true,
      message: "Updated note",
      diff: "--- note\n+++ note\n@@ -1 +1 @@\n-old\n+new",
      filediff: { additions: 1, deletions: 1 },
    });
  });

  it("preserves unknown/new fields (denylist, not allowlist)", () => {
    const toModelOutput = getToModelOutput({});
    const result = toModelOutput({
      output: {
        success: true,
        message: "Done",
        someFutureField: "new data",
      },
    });
    expect(result.value).toHaveProperty("someFutureField", "new data");
  });

  // ── Error / failure outputs ─────────────────────────────

  it("passes through error results unchanged (no event to strip)", () => {
    const toModelOutput = getToModelOutput({});
    const result = toModelOutput({
      output: { success: false, message: "No workspace context available" },
    });
    expect(result.value).toEqual({
      success: false,
      message: "No workspace context available",
    });
  });

  it("handles error field from deep research failures", () => {
    const toModelOutput = getToModelOutput({});
    const result = toModelOutput({
      output: { error: "Failed to start deep research" },
    });
    expect(result.value).toEqual({
      error: "Failed to start deep research",
    });
  });

  // ── Non-object outputs ──────────────────────────────────

  it("passes through string output unchanged", () => {
    const toModelOutput = getToModelOutput({});
    const result = toModelOutput({ output: "plain text response" });
    expect(result).toEqual({ type: "json", value: "plain text response" });
  });

  it("passes through null output unchanged", () => {
    const toModelOutput = getToModelOutput({});
    const result = toModelOutput({ output: null });
    expect(result).toEqual({ type: "json", value: null });
  });

  it("passes through undefined output unchanged", () => {
    const toModelOutput = getToModelOutput({});
    const result = toModelOutput({ output: undefined });
    expect(result).toEqual({ type: "json", value: undefined });
  });

  it("passes through numeric output unchanged", () => {
    const toModelOutput = getToModelOutput({});
    const result = toModelOutput({ output: 42 });
    expect(result).toEqual({ type: "json", value: 42 });
  });

  // ── Array outputs (regression: should not mangle) ──────

  it("passes through array output unchanged (no mangling to keyed object)", () => {
    const toModelOutput = getToModelOutput({});
    const arr = [{ name: "item1" }, { name: "item2" }];
    const result = toModelOutput({ output: arr });
    expect(result).toEqual({ type: "json", value: arr });
    expect(Array.isArray(result.value)).toBe(true);
  });

  it("does not strip fields inside array elements", () => {
    const toModelOutput = getToModelOutput({});
    const arr = [{ event: "should-stay", version: 1 }];
    const result = toModelOutput({ output: arr });
    expect(result.value[0]).toHaveProperty("event", "should-stay");
    expect(result.value[0]).toHaveProperty("version", 1);
  });

  // ── Return format ───────────────────────────────────────

  it("always returns { type: 'json', value: ... } for objects", () => {
    const toModelOutput = getToModelOutput({});
    const result = toModelOutput({
      output: { success: true, message: "ok" },
    });
    expect(result.type).toBe("json");
    expect(result).toHaveProperty("value");
  });

  it("always returns { type: 'json', value: ... } for primitives", () => {
    const toModelOutput = getToModelOutput({});
    const result = toModelOutput({ output: "hello" });
    expect(result.type).toBe("json");
    expect(result).toHaveProperty("value");
  });

  // ── Realistic tool output scenarios ─────────────────────

  it("sanitizes a realistic createNote result", () => {
    const toModelOutput = getToModelOutput({});
    const result = toModelOutput({
      output: {
        success: true,
        itemId: "item_abc123",
        message: 'Created note "Research Summary" successfully',
        cardCount: undefined,
        event: {
          id: "evt_xyz",
          type: "ITEM_CREATED",
          payload: {
            item: {
              id: "item_abc123",
              name: "Research Summary",
              type: "note",
              data: { field1: "# Long markdown...", blockContent: [{ type: "paragraph", content: [{ type: "text", text: "lots of data" }] }] },
            },
          },
          timestamp: 1710000000000,
          userId: "user_1",
        },
        version: 47,
      },
    });
    expect(result.value).toEqual({
      success: true,
      message: 'Created note "Research Summary" successfully',
    });
  });

  it("sanitizes a realistic editItem result with diff", () => {
    const toModelOutput = getToModelOutput({});
    const result = toModelOutput({
      output: {
        success: true,
        itemId: "note-1",
        message: "Updated note successfully",
        event: {
          id: "evt_edit",
          type: "ITEM_UPDATED",
          payload: { id: "note-1", changes: { data: { field1: "new content", blockContent: [] } } },
        },
        version: 48,
        diff: "--- note\n+++ note\n@@ -1,3 +1,3 @@\n-old line\n+new line",
        filediff: { additions: 1, deletions: 1 },
        itemName: "My Note",
      },
    });
    expect(result.value).toEqual({
      success: true,
      message: "Updated note successfully",
      diff: "--- note\n+++ note\n@@ -1,3 +1,3 @@\n-old line\n+new line",
      filediff: { additions: 1, deletions: 1 },
    });
  });

  it("sanitizes a realistic deleteItem result", () => {
    const toModelOutput = getToModelOutput({});
    const result = toModelOutput({
      output: {
        success: true,
        itemId: "note-2",
        message: "Deleted note successfully",
        event: { id: "evt_del", type: "ITEM_DELETED", payload: { id: "note-2" } },
        version: 49,
        deletedItem: "Old Note",
      },
    });
    expect(result.value).toEqual({
      success: true,
      message: "Deleted note successfully",
    });
  });

  it("sanitizes a realistic createQuiz result", () => {
    const toModelOutput = getToModelOutput({});
    const result = toModelOutput({
      output: {
        success: true,
        itemId: "quiz-1",
        quizId: "quiz-1",
        title: "History Quiz",
        questionCount: 5,
        message: 'Created quiz "History Quiz" with 5 questions.',
        event: { id: "evt_quiz", type: "ITEM_CREATED", payload: {} },
        version: 50,
      },
    });
    expect(result.value).toEqual({
      success: true,
      message: 'Created quiz "History Quiz" with 5 questions.',
    });
  });

  it("sanitizes a realistic deepResearch result", () => {
    const toModelOutput = getToModelOutput({});
    const result = toModelOutput({
      output: {
        success: true,
        itemId: "note-dr",
        noteId: "note-dr",
        interactionId: "int_abc",
        message: "Deep research started and note created.",
        event: { id: "evt_dr", type: "ITEM_CREATED", payload: {} },
        version: 51,
      },
    });
    expect(result.value).toEqual({
      success: true,
      message: "Deep research started and note created.",
    });
  });
});
