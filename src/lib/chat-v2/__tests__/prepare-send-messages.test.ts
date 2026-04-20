import { describe, expect, it } from "vitest";
import { buildPrepareSendMessagesBody } from "@/lib/chat-v2/prepare-send-messages";
import type { ChatMessage } from "@/lib/chat-v2/types";

describe("buildPrepareSendMessagesBody", () => {
  it("injects metadata onto the last user message on send", () => {
    const messages: ChatMessage[] = [
      { id: "u1", role: "user", parts: [{ type: "text", text: "hello" }] },
    ];

    const body = buildPrepareSendMessagesBody({
      id: "thread-1",
      workspaceId: "workspace-1",
      messages,
      trigger: "submit-message",
      modelId: "model-1",
      memoryEnabled: true,
      activeFolderId: "folder-1",
      selectedCardsContext: "context",
      selectedCardIds: ["card-1"],
      replySelections: [{ text: "quoted text", title: "Doc" }],
      system: "system prompt",
    });

    expect(body.messages.at(-1)?.metadata).toEqual({
      replySelections: [{ text: "quoted text", title: "Doc" }],
      selectedCards: ["card-1"],
    });
    expect(body.trigger).toBe("submit-message");
    expect(body.system).toBe("system prompt");
  });

  it("preserves regenerate payload shape when last message is assistant", () => {
    const messages: ChatMessage[] = [
      { id: "u1", role: "user", parts: [{ type: "text", text: "hello" }] },
      { id: "a1", role: "assistant", parts: [{ type: "text", text: "world" }] },
    ];

    const body = buildPrepareSendMessagesBody({
      id: "thread-1",
      workspaceId: "workspace-1",
      messages,
      trigger: "regenerate-message",
      messageId: "a1",
      modelId: "model-1",
      memoryEnabled: false,
    });

    expect(body.messageId).toBe("a1");
    expect(body.messages).toEqual(messages);
    expect(body.memoryEnabled).toBe(false);
  });

  it("keeps tool approval continuation messages intact", () => {
    const messages: ChatMessage[] = [
      {
        id: "a1",
        role: "assistant",
        parts: [
          {
            type: "tool-web_search",
            toolCallId: "call-1",
            state: "approval-responded",
            input: { query: "x" },
            approval: { id: "approval-1", approved: true },
          },
        ],
      },
    ];

    const body = buildPrepareSendMessagesBody({
      id: "thread-1",
      workspaceId: "workspace-1",
      messages,
      trigger: "submit-message",
      messageId: "a1",
      modelId: "model-1",
      memoryEnabled: true,
    });

    expect(body.messages[0].parts[0]).toMatchObject({
      type: "tool-web_search",
      state: "approval-responded",
    });
    expect(body.messageId).toBe("a1");
  });
});
