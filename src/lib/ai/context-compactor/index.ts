import type { UIMessage } from "ai";
import { logger } from "@/lib/utils/logger";
import { compressMessages } from "./compressor";
import { makeSummaryUIMessage } from "./prompts";
import {
  estimateTokens,
  estimateUIMessagesTokens,
  getContextBudget,
  getPreserveThreshold,
} from "./token-budget";

const MIN_PRESERVE_TURNS = 3;

export interface CompressionState {
  compressionSummary: string | null;
  compressedUpToMessageId: string | null;
  lastInputTokens: number | null;
}

export interface CompactionResult {
  messages: UIMessage[];
  updatedState: CompressionState | null;
}

export async function compactMessages(
  messages: UIMessage[],
  state: CompressionState,
  modelId: string,
): Promise<CompactionResult> {
  const budget = getContextBudget(modelId);
  const preserveThreshold = getPreserveThreshold(modelId);
  const estimatedTokens =
    state.lastInputTokens ?? estimateUIMessagesTokens(messages);
  let needsRecompression = false;

  logger.debug("🗜️ [COMPACTOR] Evaluating budget", {
    estimatedTokens,
    budget,
    hasExistingSummary: !!state.compressionSummary,
    messageCount: messages.length,
  });

  if (state.compressionSummary && state.compressedUpToMessageId) {
    const cutoffIdx = messages.findIndex(
      (message) => message.id === state.compressedUpToMessageId,
    );

    if (cutoffIdx !== -1) {
      const recentMessages = messages.slice(cutoffIdx + 1);
      const recentTokens = estimateUIMessagesTokens(recentMessages);
      const summaryTokens = estimateTokens(state.compressionSummary);
      const totalWithSummary = recentTokens + summaryTokens;

      if (totalWithSummary < budget) {
        logger.debug("🗜️ [COMPACTOR] Using cached summary", {
          recentMessages: recentMessages.length,
          totalWithSummary: Math.ceil(totalWithSummary),
        });
        return {
          messages: [
            makeSummaryUIMessage(state.compressionSummary),
            ...recentMessages,
          ],
          updatedState: null,
        };
      }

      logger.info(
        "🗜️ [COMPACTOR] Re-compressing — conversation grew past budget",
      );
      needsRecompression = true;
    } else {
      logger.warn("🗜️ [COMPACTOR] Stale cache — discarding summary", {
        missingMessageId: state.compressedUpToMessageId,
      });
      needsRecompression = true;
    }
  }

  if (estimatedTokens < budget && !needsRecompression) {
    return { messages, updatedState: null };
  }

  let preserveFromIdx = messages.length;
  let preserveTokens = 0;
  let userTurnsSeen = 0;

  for (let i = messages.length - 1; i >= 0; i--) {
    const msgTokens = estimateUIMessagesTokens([messages[i]]);
    if (messages[i].role === "user") userTurnsSeen++;

    if (
      userTurnsSeen > MIN_PRESERVE_TURNS &&
      preserveTokens + msgTokens > preserveThreshold
    ) {
      break;
    }
    preserveFromIdx = i;
    preserveTokens += msgTokens;
  }

  if (preserveFromIdx <= 1) {
    logger.debug("🗜️ [COMPACTOR] Not enough messages to compress");
    return { messages, updatedState: null };
  }

  const toCompress = messages.slice(0, preserveFromIdx);
  const toPreserve = messages.slice(preserveFromIdx);
  const cutoffMessageId = toCompress[toCompress.length - 1].id;

  logger.info("🗜️ [COMPACTOR] Compressing messages", {
    compressing: toCompress.length,
    preserving: toPreserve.length,
    cutoffMessageId,
  });

  const summary = await compressMessages(toCompress, state.compressionSummary);

  if (!summary) {
    return { messages, updatedState: null };
  }

  return {
    messages: [makeSummaryUIMessage(summary), ...toPreserve],
    updatedState: {
      compressionSummary: summary,
      compressedUpToMessageId: cutoffMessageId,
      lastInputTokens: null,
    },
  };
}

export { estimateTokens, estimateUIMessagesTokens } from "./token-budget";
