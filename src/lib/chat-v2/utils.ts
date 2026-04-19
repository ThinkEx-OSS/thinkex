import type { UIMessagePart } from "ai";
import type { chatV2Message } from "@/lib/db/schema";
import type { ChatMessage } from "@/lib/chat-v2/types";

export const fetcher = async (url: string) => {
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(await response.text() || `Request failed with ${response.status}`);
  }

  return response.json();
};

export async function fetchWithErrorHandlers(
  input: RequestInfo | URL,
  init?: RequestInit,
) {
  try {
    const response = await fetch(input, init);

    if (!response.ok) {
      throw new Error(await response.text() || `Request failed with ${response.status}`);
    }

    return response;
  } catch (error) {
    if (typeof navigator !== "undefined" && !navigator.onLine) {
      throw new Error("You appear to be offline.");
    }

    throw error;
  }
}

export function sanitizeText(text: string) {
  return text.replace("<has_function_call>", "");
}

type ChatV2MessageRow = typeof chatV2Message.$inferSelect;

export function convertToUIMessages(messages: ChatV2MessageRow[]): ChatMessage[] {
  return messages.map((message) => ({
    id: message.id,
    role: message.role as ChatMessage["role"],
    parts: message.parts as UIMessagePart[],
  }));
}
