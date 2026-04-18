import type { UIMessage, UIDataTypes } from "ai";
import type { ReplySelection } from "@/lib/stores/ui-store";

/**
 * Custom message metadata carried on every ThinkexUIMessage.
 * Populated by server via `toUIMessageStreamResponse({ messageMetadata })`
 * and by the client composer for per-request data (reply selections).
 */
export interface ThinkexMessageMetadata {
  replySelections?: ReplySelection[];
  createdAt?: number;
  model?: string;
  totalTokens?: number;
  [key: string]: unknown;
}

/**
 * Placeholder tool-set type. PR 3 will replace `Record<string, never>`
 * with `InferUITools<typeof createChatTools>` once the server tool factory
 * exports a typed ToolSet. Keeping this empty here avoids server imports
 * on the client in PR 1.
 */
export type ThinkexUITools = Record<string, never>;

export type ThinkexUIMessage = UIMessage<
  ThinkexMessageMetadata,
  UIDataTypes,
  ThinkexUITools
>;

export interface ThreadListItem {
  remoteId: string;
  status: "regular" | "archived";
  title?: string;
  externalId?: string;
}

/**
 * Shape of one row from `GET /api/threads/[id]/messages`.
 * `content` is the stored envelope; for `format = "ai-sdk/v6"` rows it is
 * `{ role, parts, metadata }` matching UIMessage minus the `id` field.
 */
export interface StoredMessage {
  id: string;
  parent_id: string | null;
  format: string;
  content: Record<string, unknown>;
  created_at: string;
}

export const STORAGE_FORMAT = "ai-sdk/v6" as const;
