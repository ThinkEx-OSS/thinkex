"use client";

import { useMemo } from "react";
import type {
  ThreadHistoryAdapter,
  GenericThreadHistoryAdapter,
  MessageFormatAdapter,
  MessageFormatItem,
  MessageFormatRepository,
  MessageStorageEntry,
} from "@assistant-ui/react";
import { useAui } from "@assistant-ui/react";

/**
 * Sorts messages so parents always come before their children.
 * Required for MessageRepository.import() which expects parent to exist before child.
 * Uses topological sort with created_at + id as tiebreakers for stable ordering.
 */
function sortParentsBeforeChildren<
  T extends { parentId: string | null; message: { id: string } }
>(items: T[], getCreatedAt: (item: T) => string): T[] {
  const output: T[] = [];
  const added = new Set<string>();

  const getReady = () =>
    items.filter(
      (m) =>
        !added.has(m.message.id) &&
        (m.parentId === null || added.has(m.parentId))
    );

  while (output.length < items.length) {
    const ready = getReady();
    if (ready.length === 0) {
      // Orphan or circular ref: add remaining by created_at to avoid infinite loop
      const remaining = items.filter((m) => !added.has(m.message.id));
      remaining.sort((a, b) => {
        const tA = new Date(getCreatedAt(a)).getTime();
        const tB = new Date(getCreatedAt(b)).getTime();
        return tA - tB || a.message.id.localeCompare(b.message.id);
      });
      output.push(...remaining);
      break;
    }
    ready.sort((a, b) => {
      const tA = new Date(getCreatedAt(a)).getTime();
      const tB = new Date(getCreatedAt(b)).getTime();
      return tA - tB || a.message.id.localeCompare(b.message.id);
    });
    const next = ready[0]!;
    output.push(next);
    added.add(next.message.id);
  }

  return output;
}

/**
 * AI SDK–only thread history adapter.
 * Uses withFormat(aiSDKV6FormatAdapter) for persistence via useExternalHistory.
 * Base load/append are stubs since ExternalStoreRuntime uses withFormat for persistence.
 */
export function useCustomThreadHistoryAdapter(): ThreadHistoryAdapter {
  const aui = useAui();

  return useMemo<ThreadHistoryAdapter>(
    () => ({
      async load() {
        return { messages: [] };
      },
      async append() {
        // No-op: ExternalStoreRuntime uses withFormat for persistence
      },
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
                (err as { error?: string }).error ||
                  `Failed to save message: ${res.status}`
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

            const filtered = messages.filter(
              (m: { format?: string }) => m.format === formatAdapter.format
            );
            type DecodedItem = MessageFormatItem<TMessage> & {
              created_at: string;
            };
            const decoded: DecodedItem[] = filtered.map(
              (m: {
                id: string;
                parent_id: string | null;
                format: string;
                content: unknown;
                created_at?: string;
              }) => {
                const d = formatAdapter.decode({
                  id: m.id,
                  parent_id: m.parent_id,
                  format: m.format,
                  content: m.content as TStorageFormat,
                } as MessageStorageEntry<TStorageFormat>);
                return {
                  ...d,
                  created_at: m.created_at ?? new Date().toISOString(),
                };
              }
            );

            // Topological sort: parents before children for MessageRepository.import()
            // formatAdapter.decode returns messages with id (ai-sdk/v6 and similar formats)
            type SortableItem = {
              parentId: string | null;
              message: { id: string };
              created_at: string;
            };
            const sorted = sortParentsBeforeChildren(
              decoded as SortableItem[],
              (d) => d.created_at
            ) as DecodedItem[];

            return {
              messages: sorted.map(({ parentId, message }) => ({
                parentId,
                message,
              })),
            };
          },
        };
      },
    }),
    [aui]
  );
}
