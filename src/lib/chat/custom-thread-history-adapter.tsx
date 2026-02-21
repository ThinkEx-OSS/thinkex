"use client";

import { useMemo } from "react";
import type {
  ThreadHistoryAdapter,
  ExportedMessageRepositoryItem,
  GenericThreadHistoryAdapter,
  MessageFormatAdapter,
  MessageFormatItem,
  MessageFormatRepository,
  MessageStorageEntry,
} from "@assistant-ui/react";
import { useAui } from "@assistant-ui/react";
import { auiV0Encode, auiV0Decode } from "./aui-v0";

const FORMAT = "aui/v0";

/**
 * Matches FormattedCloudPersistence / AssistantCloudThreadHistoryAdapter exactly:
 * - API returns messages newest-first
 * - We reverse to get oldest-first (parents before children) for MessageRepository.import()
 * - headId falls back to messages.at(-1) in import(), which after reverse = newest = active branch tip
 */

export function useCustomThreadHistoryAdapter(): ThreadHistoryAdapter {
  const aui = useAui();

  return useMemo<ThreadHistoryAdapter>(() => ({
    /**
     * Required by useExternalHistory: the AI SDK runtime calls withFormat(aiSDKV6FormatAdapter)
     * and uses the returned adapter for append/load. Without this, messages are never persisted.
     */
    withFormat<TMessage, TStorageFormat>(
      formatAdapter: MessageFormatAdapter<TMessage, TStorageFormat>
    ): GenericThreadHistoryAdapter<TMessage> {
      return {
        async append(item: MessageFormatItem<TMessage>) {
          const { remoteId } = await aui.threadListItem().initialize();
          const messageId = formatAdapter.getId(item.message);
          const encoded = formatAdapter.encode(item) as TStorageFormat;

          const res = await fetch(`/api/threads/${remoteId}/messages`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              messageId,
              parentId: item.parentId,
              format: formatAdapter.format,
              content: encoded,
            }),
          });

          if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            throw new Error(
              (err as { error?: string }).error || `Failed to save message: ${res.status}`
            );
          }
        },
        async load(): Promise<MessageFormatRepository<TMessage>> {
          const remoteId = aui.threadListItem().getState().remoteId;
          if (!remoteId) return { messages: [] };

          const res = await fetch(
            `/api/threads/${remoteId}/messages?format=${formatAdapter.format}`
          );
          if (!res.ok) {
            throw new Error(`Failed to load messages: ${res.status}`);
          }

          const { messages } = await res.json();
          if (!Array.isArray(messages) || messages.length === 0) {
            return { messages: [] };
          }

          const result = messages
            .filter(
              (m: { format?: string }) => m.format === formatAdapter.format
            )
            .map(
              (m: { id: string; parent_id: string | null; format: string; content: unknown }) =>
                formatAdapter.decode({
                  id: m.id,
                  parent_id: m.parent_id,
                  format: m.format,
                  content: m.content as TStorageFormat,
                } as MessageStorageEntry<TStorageFormat>)
            )
            .reverse();

          return { messages: result };
        },
      };
    },
    async append({ parentId, message }: ExportedMessageRepositoryItem) {
      const { remoteId } = await aui.threadListItem().initialize();
      const encoded = auiV0Encode(message);

      const res = await fetch(`/api/threads/${remoteId}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messageId: message.id,
          parentId,
          format: FORMAT,
          content: encoded,
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(
          (err as { error?: string }).error || `Failed to save message: ${res.status}`
        );
      }
    },
    async load() {
      const remoteId = aui.threadListItem().getState().remoteId;
      if (!remoteId) return { messages: [] };

      const res = await fetch(
        `/api/threads/${remoteId}/messages?format=${FORMAT}`
      );
      if (!res.ok) {
        throw new Error(`Failed to load messages: ${res.status}`);
      }

      const { messages } = await res.json();
      if (!Array.isArray(messages) || messages.length === 0) {
        return { messages: [] };
      }

      const result = messages
        .filter((m: { format?: string }) => m.format === FORMAT)
        .map(
          (m: {
            id: string;
            parent_id: string | null;
            format: string;
            content: unknown;
            created_at?: string;
          }) =>
            auiV0Decode({
              ...m,
              created_at: m.created_at ?? new Date().toISOString(),
            })
        )
        .reverse();

      return { messages: result };
    },
  }), [aui]);
}
