import { describe, expect, it, vi } from "vitest";
import {
  getNewFinishedMessages,
  resolveInitialParentId,
} from "@/lib/chat-v2/stream-persistence";
import type { ChatMessage } from "@/lib/chat-v2/types";

describe("stream persistence helpers", () => {
  it("uses the regenerated assistant sibling parent id", async () => {
    const getStoredMessageParentId = vi.fn().mockResolvedValue("u1");

    const parentId = await resolveInitialParentId({
      trigger: "regenerate-message",
      regenerateMessageId: "a1",
      lastMessage: {
        id: "a1",
        role: "assistant",
        parts: [{ type: "text", text: "old answer" }],
      },
      getStoredMessageParentId,
    });

    expect(parentId).toBe("u1");
    expect(getStoredMessageParentId).toHaveBeenCalledWith("a1");
  });

  it("filters already-validated messages before persistence", () => {
    const validatedMessages: ChatMessage[] = [
      { id: "u1", role: "user", parts: [{ type: "text", text: "hello" }] },
      {
        id: "a1",
        role: "assistant",
        parts: [{ type: "text", text: "old answer" }],
      },
    ];
    const finishedMessages: ChatMessage[] = [
      ...validatedMessages,
      {
        id: "a2",
        role: "assistant",
        parts: [{ type: "text", text: "new answer" }],
      },
    ];

    const newMessages = getNewFinishedMessages({
      finishedMessages,
      validatedMessages,
    });

    expect(newMessages).toEqual([
      {
        id: "a2",
        role: "assistant",
        parts: [{ type: "text", text: "new answer" }],
      },
    ]);
  });
});
