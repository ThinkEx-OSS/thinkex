import { getTokenCompanyClient } from "@/lib/ai/token-company-client";
import { logger } from "@/lib/utils/logger";

const AGGRESSIVENESS = 0.05;
const RECENT_MESSAGE_COUNT = 5;
const TOKEN_THRESHOLD = 20_000;
const MIN_COMPRESSIBLE_CHARS = 200;

function estimateTokens(charCount: number): number {
  return Math.ceil(charCount / 4);
}

function extractTextFromContent(content: unknown): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content
    .filter(
      (part: any) => part.type === "text" && typeof part.text === "string",
    )
    .map((part: any) => part.text)
    .join("\n");
}

function wrapProtectedContent(text: string): string {
  let result = text.replace(
    /(```[\s\S]*?```)/g,
    "<ttc_safe>$1</ttc_safe>",
  );
  result = result.replace(
    /^(\s*[\[{][\s\S]*?[\]}]\s*)$/gm,
    "<ttc_safe>$1</ttc_safe>",
  );
  return result;
}

function stripSafeTags(text: string): string {
  return text.replace(/<\/?ttc_safe>/g, "");
}

export function createTTCPrepareStep() {
  return async (options: {
    messages: any[];
    stepNumber: number;
    steps: any[];
  }) => {
    if (options.stepNumber > 0) return undefined;

    const client = getTokenCompanyClient();
    if (!client.isEnabled) return undefined;

    const messages = options.messages;

    let totalChars = 0;
    for (const msg of messages) {
      totalChars += extractTextFromContent(msg.content).length;
    }

    const estTokens = estimateTokens(totalChars);
    if (estTokens < TOKEN_THRESHOLD) {
      logger.debug(
        `🔧 [TTC] Skipping compression: ~${estTokens} tokens < ${TOKEN_THRESHOLD} threshold`,
      );
      return undefined;
    }

    const recentBoundary = Math.max(0, messages.length - RECENT_MESSAGE_COUNT);
    const compressibleSegments: Array<{
      msgIndex: number;
      partIndex: number;
      text: string;
    }> = [];

    for (let i = 0; i < recentBoundary; i++) {
      const msg = messages[i];
      if (msg.role !== "assistant" && msg.role !== "tool") continue;

      const content = msg.content;
      if (!Array.isArray(content)) continue;

      for (let j = 0; j < content.length; j++) {
        const part = content[j];
        if (part.type !== "text" || typeof part.text !== "string") continue;
        if (part.text.length < MIN_COMPRESSIBLE_CHARS) continue;
        compressibleSegments.push({
          msgIndex: i,
          partIndex: j,
          text: part.text,
        });
      }
    }

    if (compressibleSegments.length === 0) return undefined;

    const DELIMITER_PREFIX = "<<<SEG_";
    const DELIMITER_SUFFIX = ">>>";
    const batchedInput = compressibleSegments
      .map((seg, idx) => {
        const protected_ = wrapProtectedContent(seg.text);
        return `${DELIMITER_PREFIX}${idx}${DELIMITER_SUFFIX}\n${protected_}`;
      })
      .join("\n\n");

    const result = await client.compress(batchedInput, AGGRESSIVENESS);
    if (!result) return undefined;

    logger.info("📊 [TTC] Compressed conversation history:", {
      segments: compressibleSegments.length,
      originalTokens: result.originalTokens,
      compressedTokens: result.compressedTokens,
      savedTokens: result.originalTokens - result.compressedTokens,
      savedPercent: (
        ((result.originalTokens - result.compressedTokens) /
          result.originalTokens) *
        100
      ).toFixed(1),
    });

    const delimiterRegex = new RegExp(
      `${DELIMITER_PREFIX.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\d+${DELIMITER_SUFFIX.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*`,
    );
    const compressedParts = result.output.split(delimiterRegex).filter(Boolean);

    const newMessages = messages.map((msg: any, msgIdx: number) => {
      const segsForMsg = compressibleSegments
        .map((seg, segIdx) => ({ ...seg, segIdx }))
        .filter((seg) => seg.msgIndex === msgIdx);

      if (segsForMsg.length === 0) return msg;

      const newContent = msg.content.map((part: any, partIdx: number) => {
        const seg = segsForMsg.find((s) => s.partIndex === partIdx);
        if (!seg || !compressedParts[seg.segIdx]) return part;
        return {
          ...part,
          text: stripSafeTags(compressedParts[seg.segIdx].trim()),
        };
      });

      return { ...msg, content: newContent };
    });

    return { messages: newMessages };
  };
}
