import type { UIMessage } from "ai";
import {
  CHAT_TOOL,
  canonicalizeToolUIPartType,
  isCanonicalChatToolName,
} from "./chat-tool-names";
import { normalizeProcessUrlsArgs } from "./process-urls-shared";
import { normalizeWebSearchResult } from "./web-search-shared";

function normalizeWebSearchOutput(output: unknown): unknown {
  const normalized = normalizeWebSearchResult(output);
  return normalized ?? output;
}

function summarizeRemovedToolPart(toolName: string): string {
  return `[Legacy tool omitted: ${toolName}. This tool is no longer supported in chat history replay.]`;
}

export function normalizeLegacyToolMessages(
  messages: UIMessage[],
  options?: { availableToolNames?: Iterable<string> },
): UIMessage[] {
  const availableToolNames = new Set(options?.availableToolNames ?? []);

  return messages.map((message): UIMessage => {
    if (!Array.isArray(message.parts)) {
      return message;
    }

    const parts = message.parts.map((part) => {
      if (!part.type.startsWith("tool-")) {
        return part;
      }

      const originalToolName = part.type.slice("tool-".length);
      const type = canonicalizeToolUIPartType(part.type);
      const canonicalToolName = type.slice("tool-".length);

      // Downgrade to text only when this part was not transformed (`type === part.type`),
      // the original name is unknown to the current runtime (`!availableToolNames.has(originalToolName)`),
      // and it is not a canonical tool name (`!isCanonicalChatToolName(originalToolName)`).
      // If we transformed a legacy alias, we keep the tool part and preserve behavior.
      if (
        type === part.type &&
        !availableToolNames.has(originalToolName) &&
        !isCanonicalChatToolName(originalToolName)
      ) {
        return {
          type: "text",
          text: summarizeRemovedToolPart(originalToolName),
        };
      }

      let next = type === part.type ? part : { ...part, type };

      if (type === `tool-${CHAT_TOOL.WEB_FETCH}` && "input" in next) {
        const normalizedInput = normalizeProcessUrlsArgs(next.input);
        next = normalizedInput ? { ...next, input: normalizedInput } : next;
      }

      if (
        type === `tool-${CHAT_TOOL.WEB_SEARCH}` &&
        "state" in next &&
        next.state === "output-available" &&
        "output" in next
      ) {
        next = { ...next, output: normalizeWebSearchOutput(next.output) };
      }

      return next;
    });

    return { ...message, parts } as UIMessage;
  });
}
