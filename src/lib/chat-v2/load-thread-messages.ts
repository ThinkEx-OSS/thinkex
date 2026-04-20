import { canonicalizeToolUIPartType } from "@/lib/ai/chat-tool-names";
import type { ChatMessage, ThreadMessagesResponse } from "./types";

function normalizeParts(message: ChatMessage): ChatMessage {
  return {
    ...message,
    parts: message.parts.map((part) => {
      if (!part.type.startsWith("tool-")) return part;
      return {
        ...part,
        type: canonicalizeToolUIPartType(part.type),
      } as typeof part;
    }),
  };
}

function isChatMessage(value: unknown): value is ChatMessage {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.id === "string" &&
    typeof candidate.role === "string" &&
    Array.isArray(candidate.parts)
  );
}

export async function loadThreadMessages(threadId: string): Promise<ChatMessage[]> {
  const response = await fetch(`/api/threads/${threadId}/messages?format=ai-sdk/v6`, {
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(await response.text());
  }

  const data = (await response.json()) as ThreadMessagesResponse;

  return [...data.messages]
    .sort((a, b) => a.created_at.localeCompare(b.created_at))
    .map((row) => row.content)
    .filter(isChatMessage)
    .map(normalizeParts);
}
