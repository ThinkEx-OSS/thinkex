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
