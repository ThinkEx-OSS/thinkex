import type { UIMessage } from "ai";
import { normalizeProcessUrlsArgs } from "./process-urls-shared";
import { normalizeWebSearchResult } from "./web-search-shared";

function normalizeExecuteCodeOutput(output: unknown): unknown {
  if (typeof output === "string") {
    return output;
  }

  if (output != null && typeof output === "object" && !Array.isArray(output)) {
    const record = output as Record<string, unknown>;
    if (typeof record.text === "string") return record.text;
    if (typeof record.result === "string") return record.result;
    if (typeof record.value === "string") return record.value;
  }

  return output;
}

function normalizeWebSearchOutput(output: unknown): unknown {
  const normalized = normalizeWebSearchResult(output);
  return normalized ?? output;
}

export function normalizeLegacyToolMessages(messages: UIMessage[]): UIMessage[] {
  return messages.map((message) => {
    if (!Array.isArray(message.parts)) {
      return message;
    }

    const parts = message.parts.map((part) => {
      if (!part.type.startsWith("tool-")) {
        return part;
      }

      if (part.type === "tool-processUrls" && "input" in part) {
        const normalizedInput = normalizeProcessUrlsArgs(part.input);
        return normalizedInput ? { ...part, input: normalizedInput } : part;
      }

      if (
        part.type === "tool-executeCode" &&
        "state" in part &&
        part.state === "output-available" &&
        "output" in part
      ) {
        return { ...part, output: normalizeExecuteCodeOutput(part.output) };
      }

      if (
        part.type === "tool-webSearch" &&
        "state" in part &&
        part.state === "output-available" &&
        "output" in part
      ) {
        return { ...part, output: normalizeWebSearchOutput(part.output) };
      }

      return part;
    });

    return { ...message, parts };
  });
}
