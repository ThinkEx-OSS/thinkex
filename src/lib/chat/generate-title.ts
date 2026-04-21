import "server-only";

import { generateText } from "ai";

import {
  buildGatewayProviderOptions,
  createGatewayLanguageModel,
  getGatewayAttributionHeaders,
} from "@/lib/ai/gateway-provider-options";
import { getGatewayModelIdForPurpose } from "@/lib/ai/models";

const MAX_TITLE_LENGTH = 60;

/**
 * Generate a short title from the first user message. Pure helper — does
 * not touch the database. The chat route writes the result via the same
 * DB write that updates `chat_threads.lastMessageAt` and broadcasts it on
 * the SSE stream as `data-chat-title` so the client picks it up live.
 */
export async function generateThreadTitle({
  userId,
  firstUserMessageText,
}: {
  userId: string;
  firstUserMessageText: string;
}): Promise<string> {
  const prompt = firstUserMessageText.trim();
  if (!prompt) return "";

  const modelId = getGatewayModelIdForPurpose("title-generation");
  const { text } = await generateText({
    model: createGatewayLanguageModel(modelId),
    providerOptions: buildGatewayProviderOptions(modelId, { userId }),
    headers: getGatewayAttributionHeaders(),
    messages: [
      {
        role: "user",
        content:
          "Generate a very short (max 6 words) title for a chat conversation based on this first user message. " +
          "No quotes, no punctuation at the end, no markdown. Just the title text.\n\n" +
          `First message: ${prompt}`,
      },
    ],
  });

  return text
    .trim()
    .replace(/^["']+|["']+$/g, "")
    .slice(0, MAX_TITLE_LENGTH);
}
