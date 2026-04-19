import { generateText } from "ai";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { chatV2 } from "@/lib/db/schema";
import { getGatewayModelIdForPurpose } from "@/lib/ai/models";
import {
  buildGatewayProviderOptions,
  createGatewayLanguageModel,
  getGatewayAttributionHeaders,
} from "@/lib/ai/gateway-provider-options";

const MAX_TITLE_LENGTH = 60;

export async function maybeGenerateChatTitle({
  chatId,
  userId,
  firstUserMessageText,
  currentTitle,
}: {
  chatId: string;
  userId: string;
  firstUserMessageText: string;
  currentTitle: string;
}) {
  if (currentTitle !== "New chat") return;
  const prompt = firstUserMessageText.trim();
  if (!prompt) return;

  try {
    const modelId = getGatewayModelIdForPurpose("title-generation");
    const { text } = await generateText({
      model: createGatewayLanguageModel(modelId),
      providerOptions: buildGatewayProviderOptions(modelId, { userId }) as any,
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
    const title = text.trim().replace(/^["']+|["']+$/g, "").slice(0, MAX_TITLE_LENGTH);
    if (!title) return;

    await db
      .update(chatV2)
      .set({ title, updatedAt: new Date().toISOString() })
      .where(eq(chatV2.id, chatId));
  } catch (err) {
    console.warn("[chat-v2] title generation failed", err);
  }
}
