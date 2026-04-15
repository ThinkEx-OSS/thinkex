import { generateText } from "ai";
import type { UIMessage } from "ai";
import { getGatewayModelIdForPurpose } from "@/lib/ai/models";
import {
  buildGatewayProviderOptions,
  createGatewayLanguageModel,
  getGatewayAttributionHeaders,
} from "@/lib/ai/gateway-provider-options";
import { logger } from "@/lib/utils/logger";
import {
  COMPRESSION_SYSTEM_PROMPT,
  COMPRESSION_USER_PROMPT,
  formatConversationForCompression,
} from "./prompts";

let consecutiveFailures = 0;
let lastFailureTime = 0;
const MAX_FAILURES = 3;
const BREAKER_RESET_MS = 60_000;

export async function compressMessages(
  messagesToCompress: UIMessage[],
  existingSummary?: string | null,
): Promise<string | null> {
  if (consecutiveFailures >= MAX_FAILURES) {
    if (Date.now() - lastFailureTime < BREAKER_RESET_MS) {
      logger.warn("🗜️ [COMPACTOR] Circuit breaker open — skipping compression");
      return null;
    }
    logger.info("🗜️ [COMPACTOR] Circuit breaker reset after timeout");
    consecutiveFailures = 0;
  }

  try {
    let conversationText = formatConversationForCompression(messagesToCompress);

    if (existingSummary) {
      conversationText = `[Previous summary]\n${existingSummary}\n\n[New messages]\n${conversationText}`;
    }

    const prompt = COMPRESSION_USER_PROMPT.replace(
      "{CONVERSATION}",
      conversationText,
    );

    const gatewayModelId = getGatewayModelIdForPurpose("title-generation");
    const { text } = await generateText({
      model: createGatewayLanguageModel(gatewayModelId),
      providerOptions: buildGatewayProviderOptions(gatewayModelId) as any,
      headers: getGatewayAttributionHeaders(),
      system: COMPRESSION_SYSTEM_PROMPT,
      prompt,
    });

    const summary = text.trim();
    if (!summary) {
      throw new Error("Empty summary returned");
    }

    consecutiveFailures = 0;
    logger.info("🗜️ [COMPACTOR] Compression succeeded", {
      inputMessages: messagesToCompress.length,
      summaryLength: summary.length,
    });
    return summary;
  } catch (error) {
    consecutiveFailures++;
    lastFailureTime = Date.now();
    logger.error("🗜️ [COMPACTOR] Compression failed", {
      error: error instanceof Error ? error.message : String(error),
      consecutiveFailures,
    });
    return null;
  }
}
