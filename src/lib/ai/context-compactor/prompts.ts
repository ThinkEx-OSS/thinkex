import { getToolName, isToolUIPart, type UIMessage } from "ai";

export const COMPRESSION_SYSTEM_PROMPT = `You are a conversation summarizer. Your job is to compress a chat conversation into a dense, information-rich summary that preserves all important context.

Rules:
- Preserve ALL factual information: names, numbers, dates, URLs, code snippets, decisions made
- Preserve the user's stated goals, preferences, and constraints
- Preserve any tool calls and their results (what was searched, what was found)
- Preserve the assistant's key conclusions and recommendations
- Do NOT add opinions or new information
- Do NOT use phrases like "the user asked" or "the assistant responded" — state facts directly
- Write in compact bullet points grouped by topic
- Target roughly 1/4 the length of the original conversation
- If there are code blocks or technical details that are actively being worked on, preserve them verbatim`;

export const COMPRESSION_USER_PROMPT = `Summarize this conversation, preserving all important context:

<conversation>
{CONVERSATION}
</conversation>

Provide a dense summary:`;

export function makeSummaryUIMessage(summary: string): UIMessage {
  return {
    id: "__compression_summary__",
    role: "user",
    parts: [
      {
        type: "text",
        text: wrapSummary(summary),
      },
    ],
    createdAt: new Date(0),
  } as UIMessage;
}

export function wrapSummary(summary: string): string {
  return `[Previous conversation summary — treat as established context]\n\n${summary}`;
}

export function formatConversationForCompression(
  messages: UIMessage[],
): string {
  return messages
    .map((msg) => {
      const role = msg.role === "user" ? "User" : "Assistant";
      const text = msg.parts
        .map((p) => {
          if (p.type === "text") return p.text;
          if (isToolUIPart(p)) {
            let result = `[Tool: ${getToolName(p)}`;
            if ("input" in p && p.input !== undefined) {
              try {
                result += ` args=${JSON.stringify(p.input)}`;
              } catch {}
            }
            if ("output" in p && p.output !== undefined) {
              try {
                result += ` → ${JSON.stringify(p.output)}`;
              } catch {}
            } else if ("errorText" in p && p.errorText) {
              result += ` → ${p.errorText}`;
            }
            result += "]";
            return result;
          }
          return "";
        })
        .filter(Boolean)
        .join("\n");
      return `${role}:\n${text}`;
    })
    .join("\n\n");
}
