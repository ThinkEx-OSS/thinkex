import { describe, expect, it, vi } from "vitest";
import { safeValidateUIMessages, type UIMessage } from "ai";

vi.mock("@/lib/ai/workers", () => ({
  workspaceWorker: vi.fn(),
}));

vi.mock("@e2b/code-interpreter", () => ({
  Sandbox: class {
    static create = vi.fn();
  },
}));

import { CHAT_TOOL } from "../chat-tool-names";
import { createEditItemTool } from "../tools/edit-item-tool";
import { createExecuteCodeTool } from "../tools/execute-code";
import {
  normalizeLegacyCodeExecuteInput,
  normalizeLegacyItemEditInput,
  normalizeLegacyToolMessages,
} from "../legacy-tool-message-compat";

describe("normalizeLegacyToolMessages", () => {
  it("normalizes legacy processUrls jsonInput tool args and drops instruction", () => {
    const messages = [
      {
        id: "1",
        role: "assistant",
        parts: [
          {
            type: "tool-processUrls",
            toolCallId: "call_1",
            state: "input-available",
            input: {
              jsonInput: JSON.stringify({
                urls: ["https://example.com"],
                instruction: "Extract dates.",
              }),
            },
          },
        ],
      },
    ] as UIMessage[];

    const normalized = normalizeLegacyToolMessages(messages);
    const part = normalized[0]?.parts[0];

    expect(part).toMatchObject({
      type: "tool-web_fetch",
      input: {
        urls: ["https://example.com"],
      },
    });
  });

  it("normalizes legacy webSearch string outputs", () => {
    const messages = [
      {
        id: "1",
        role: "assistant",
        parts: [
          {
            type: "tool-webSearch",
            toolCallId: "call_3",
            state: "output-available",
            input: { query: "latest AI news" },
            output: JSON.stringify({
              text: "Summary text",
              sources: [{ title: "Example", url: "https://example.com" }],
              groundingMetadata: {
                groundingChunks: [
                  { web: { uri: "https://example.com", title: "Example" } },
                ],
              },
            }),
          },
        ],
      },
    ] as UIMessage[];

    const normalized = normalizeLegacyToolMessages(messages);
    const part = normalized[0]?.parts[0];

    expect(part).toMatchObject({
      type: "tool-web_search",
      output: {
        text: "Summary text",
        sources: [{ title: "Example", url: "https://example.com" }],
      },
    });
  });

  it("normalizes legacy webSearch string outputs without sources", () => {
    const messages = [
      {
        id: "1",
        role: "assistant",
        parts: [
          {
            type: "tool-webSearch",
            toolCallId: "call_4",
            state: "output-available",
            input: { query: "latest AI news" },
            output: JSON.stringify({
              text: "Summary text",
              groundingMetadata: {
                groundingChunks: [
                  { web: { uri: "https://example.com", title: "Example" } },
                ],
              },
            }),
          },
        ],
      },
    ] as UIMessage[];

    const normalized = normalizeLegacyToolMessages(messages);
    const part = normalized[0]?.parts[0];

    expect(part).toMatchObject({
      type: "tool-web_search",
      output: {
        text: "Summary text",
        sources: [],
      },
    });
  });

  it("leaves canonical snake_case tool part types unchanged", () => {
    const messages = [
      {
        id: "1",
        role: "assistant",
        parts: [
          {
            type: "tool-workspace_read",
            toolCallId: "call_x",
            state: "input-available",
            input: { path: "a.md" },
          },
        ],
      },
    ] as UIMessage[];

    const normalized = normalizeLegacyToolMessages(messages);
    expect(normalized[0]?.parts[0]).toMatchObject({
      type: "tool-workspace_read",
      input: { path: "a.md" },
    });
  });

  it("maps intermediate snake read_workspace to workspace_read", () => {
    const messages = [
      {
        id: "1",
        role: "assistant",
        parts: [
          {
            type: "tool-read_workspace",
            toolCallId: "call_y",
            state: "input-available",
            input: { path: "b.md" },
          },
        ],
      },
    ] as UIMessage[];

    const normalized = normalizeLegacyToolMessages(messages);
    expect(normalized[0]?.parts[0]).toMatchObject({
      type: "tool-workspace_read",
      input: { path: "b.md" },
    });
  });

  it("preserves active non-canonical tools when they are still available", () => {
    const messages = [
      {
        id: "1",
        role: "assistant",
        parts: [
          {
            type: "tool-custom_client_tool",
            toolCallId: "call_custom",
            state: "input-available",
            input: { query: "hello" },
          },
        ],
      },
    ] as UIMessage[];

    const normalized = normalizeLegacyToolMessages(messages, {
      availableToolNames: ["custom_client_tool"],
    });

    expect(normalized[0]?.parts[0]).toMatchObject({
      type: "tool-custom_client_tool",
      input: { query: "hello" },
    });
  });

  it("downgrades removed camelCase tools to text", () => {
    const messages = [
      {
        id: "1",
        role: "assistant",
        parts: [
          {
            type: "tool-magicFetch",
            toolCallId: "call_removed",
            state: "output-available",
            input: { description: "fetch something" },
            output: "done",
          },
        ],
      },
    ] as UIMessage[];

    const normalized = normalizeLegacyToolMessages(messages);
    expect(normalized[0]?.parts[0]).toMatchObject({
      type: "text",
      text: expect.stringContaining("magicFetch"),
    });
  });

  it("downgrades removed snake_case tools to text", () => {
    const messages = [
      {
        id: "1",
        role: "assistant",
        parts: [
          {
            type: "tool-magic_fetch",
            toolCallId: "call_removed_snake",
            state: "input-available",
            input: { description: "fetch something else" },
          },
        ],
      },
    ] as UIMessage[];

    const normalized = normalizeLegacyToolMessages(messages);
    expect(normalized[0]?.parts[0]).toMatchObject({
      type: "text",
      text: expect.stringContaining("magic_fetch"),
    });
  });

  it("maps legacy item_edit oldString/newString to edits for safeValidateUIMessages", async () => {
    const messages = [
      {
        id: "1",
        role: "assistant",
        parts: [
          {
            type: "tool-item_edit",
            toolCallId: "call_edit",
            state: "input-available",
            input: {
              itemName: "Study Guide",
              oldString: "alpha",
              newString: "beta",
              replaceAll: false,
            },
          },
        ],
      },
    ] as UIMessage[];

    const tools = {
      [CHAT_TOOL.ITEM_EDIT]: createEditItemTool({
        workspaceId: "ws-1",
        userId: "user-1",
      }),
    };
    const normalized = normalizeLegacyToolMessages(messages, {
      availableToolNames: Object.keys(tools),
    });
    const part = normalized[0]?.parts[0];
    expect(part).toMatchObject({
      type: "tool-item_edit",
      input: {
        itemName: "Study Guide",
        edits: [{ oldText: "alpha", newText: "beta" }],
      },
    });
    const input = part && "input" in part ? part.input : undefined;
    expect(input && typeof input === "object").toBeTruthy();
    expect(input).not.toHaveProperty("oldString");
    expect(input).not.toHaveProperty("newString");
    expect(input).not.toHaveProperty("replaceAll");

    const validation = await safeValidateUIMessages({ messages: normalized, tools });
    expect(validation.success).toBe(true);
  });

  it("normalizeLegacyItemEditInput leaves new-format payloads unchanged", () => {
    const input = {
      itemName: "Doc",
      edits: [{ oldText: "a", newText: "b" }],
    };
    expect(normalizeLegacyItemEditInput(input)).toBe(input);
  });

  it("maps legacy code_execute task to code for safeValidateUIMessages", async () => {
    const messages = [
      {
        id: "1",
        role: "assistant",
        parts: [
          {
            type: "tool-code_execute",
            toolCallId: "call_py",
            state: "input-available",
            input: { task: "print(1+1)" },
          },
        ],
      },
    ] as UIMessage[];

    const tools = {
      [CHAT_TOOL.CODE_EXECUTE]: createExecuteCodeTool(),
    };
    const normalized = normalizeLegacyToolMessages(messages, {
      availableToolNames: Object.keys(tools),
    });
    const part = normalized[0]?.parts[0];
    expect(part).toMatchObject({
      type: "tool-code_execute",
      input: { code: "print(1+1)" },
    });
    const input = part && "input" in part ? part.input : undefined;
    expect(input).not.toHaveProperty("task");

    const validation = await safeValidateUIMessages({ messages: normalized, tools });
    expect(validation.success).toBe(true);
  });

  it("normalizeLegacyCodeExecuteInput drops task when code is already set", () => {
    expect(normalizeLegacyCodeExecuteInput({ code: "print('a')", task: "print('b')" })).toEqual({
      code: "print('a')",
    });
  });

  it("normalizeLegacyCodeExecuteInput maps task when code missing or empty", () => {
    expect(normalizeLegacyCodeExecuteInput({ task: "x" })).toEqual({ code: "x" });
    expect(normalizeLegacyCodeExecuteInput({ code: "", task: "y" })).toEqual({ code: "y" });
  });

  it("allows validation to succeed after downgrading removed tools", async () => {
    const messages = [
      {
        id: "1",
        role: "assistant",
        parts: [
          {
            type: "tool-magic_fetch",
            toolCallId: "call_removed_validation",
            state: "output-available",
            input: { description: "old removed tool" },
            output: "legacy output",
          },
        ],
      },
    ] as UIMessage[];

    const originalValidation = await safeValidateUIMessages({
      messages,
      tools: {},
    });
    expect(originalValidation.success).toBe(false);

    const normalized = normalizeLegacyToolMessages(messages);
    const normalizedValidation = await safeValidateUIMessages({
      messages: normalized,
      tools: {},
    });

    expect(normalizedValidation.success).toBe(true);
    expect(normalized[0]?.parts[0]).toMatchObject({
      type: "text",
      text: expect.stringContaining("no longer supported"),
    });
  });
});
