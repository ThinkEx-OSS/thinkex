import { getToolName, isToolUIPart, type UIMessage } from "ai";

const MODEL_BUDGETS: Record<string, number> = {
  "gemini-3.1-pro": 180_000,
  "gemini-3-flash": 180_000,
  "gemini-2.5-flash": 180_000,
  "gemini-2.5-flash-lite": 180_000,
  "claude-sonnet-4.6": 160_000,
  "claude-haiku-4.5": 160_000,
  "gpt-5-chat": 100_000,
};
const DEFAULT_BUDGET = 120_000;
const PRESERVE_RATIO = 0.75;

export function estimateTokens(text: string): number {
  let tokens = 0;
  for (const char of text) {
    const code = char.codePointAt(0) ?? 0;
    if (
      (code >= 0x4e00 && code <= 0x9fff) ||
      (code >= 0x3400 && code <= 0x4dbf) ||
      (code >= 0xf900 && code <= 0xfaff)
    ) {
      tokens += 1.5;
    } else {
      tokens += 0.3;
    }
  }
  return Math.ceil(tokens);
}

export function extractTextFromUIMessage(msg: UIMessage): string {
  return msg.parts
    .map((p) => {
      if (p.type === "text") return p.text;
      if (isToolUIPart(p)) {
        const parts = [getToolName(p)];
        if ("input" in p && p.input !== undefined) {
          try {
            parts.push(JSON.stringify(p.input));
          } catch {}
        }
        if ("output" in p && p.output !== undefined) {
          try {
            parts.push(JSON.stringify(p.output));
          } catch {}
        } else if ("errorText" in p && p.errorText) {
          parts.push(p.errorText);
        }
        return parts.join(" ");
      }
      return "";
    })
    .join(" ");
}

export function estimateUIMessagesTokens(messages: UIMessage[]): number {
  return messages.reduce(
    (sum, msg) => sum + estimateTokens(extractTextFromUIMessage(msg)),
    0,
  );
}

export function getContextBudget(modelId: string): number {
  const bare = modelId.replace(
    /^(google|anthropic|openai|azure|vertex|bedrock)\//,
    "",
  );
  for (const [key, budget] of Object.entries(MODEL_BUDGETS)) {
    if (bare.startsWith(key)) return budget;
  }
  return DEFAULT_BUDGET;
}

export function getPreserveThreshold(modelId: string): number {
  return Math.floor(getContextBudget(modelId) * PRESERVE_RATIO);
}
