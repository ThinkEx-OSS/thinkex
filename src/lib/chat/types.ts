import type { UIMessage } from "ai";
import type { ReplySelection } from "@/lib/stores/ui-store";

/**
 * Persisted metadata that travels with every user message and survives a thread reload.
 * Only `custom.replySelections` is kept long-term; selected cards are ephemeral context
 * injected server-side from the request body and never written to the message row.
 */
export interface ChatMessageMetadata {
  custom?: {
    replySelections?: ReplySelection[];
  };
}

/**
 * The single message type used on the wire (API request body), in the client runtime
 * (`useChat` state), and in `chat_messages.content` for `format = 'ai-sdk-ui/v1'` rows.
 * Mirrors `UIMessage` from the AI SDK with our metadata overlay.
 */
export type ChatMessage = UIMessage<ChatMessageMetadata>;

/** Marker value written to `chat_messages.format` for every new row created after the migration. */
export const CHAT_MESSAGE_FORMAT = "ai-sdk-ui/v1" as const;
export type ChatMessageFormat = typeof CHAT_MESSAGE_FORMAT;

/**
 * Returns true if the UI message has at least one user-visible part. Pure structural
 * parts (`step-start`) and empty/whitespace text parts don't count.
 *
 * Used as a guard for persistence and hydration so empty/aborted assistant rows
 * (which would otherwise fail `safeValidateUIMessages.parts.nonempty(...)`) never
 * make it into the validated message list.
 */
export function hasMeaningfulContent(message: unknown): boolean {
  if (!message || typeof message !== "object") return false;
  const parts = (message as { parts?: unknown }).parts;
  if (!Array.isArray(parts) || parts.length === 0) return false;
  return parts.some((part) => {
    if (!part || typeof part !== "object") return false;
    const type = (part as { type?: unknown }).type;
    if (typeof type !== "string") return false;
    if (type === "step-start") return false;
    if (type === "text" || type === "reasoning") {
      const text = (part as { text?: unknown }).text;
      return typeof text === "string" && text.trim().length > 0;
    }
    return true;
  });
}
