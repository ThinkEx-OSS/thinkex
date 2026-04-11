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

type ThreadHistoryAui = {
  threadListItem(): {
    initialize(): Promise<{ remoteId: string }>;
    getState(): {
      remoteId?: string | null;
    };
  };
};

/**
 * Sorts messages so parents always come before their children.
 * Required for MessageRepository.import() which expects parent to exist before child.
 * Uses topological sort with created_at + id as tiebreakers for stable ordering.
 */
export function sortParentsBeforeChildren<
  T extends { parentId: string | null; message: { id: string } },
>(items: T[], getCreatedAt: (item: T) => string): T[] {
  const output: T[] = [];
  const added = new Set<string>();
  const allIds = new Set(items.map((item) => item.message.id));
  const compareItems = (a: T, b: T) => {
    const tA = new Date(getCreatedAt(a)).getTime();
    const tB = new Date(getCreatedAt(b)).getTime();
    return tA - tB || a.message.id.localeCompare(b.message.id);
  };

  const getReady = () =>
    items.filter(
      (m) =>
        !added.has(m.message.id) &&
        (m.parentId === null ||
          added.has(m.parentId) ||
          !allIds.has(m.parentId) ||
          m.parentId === m.message.id),
    );

  while (output.length < items.length) {
    const ready = getReady();
    if (ready.length === 0) {
      // Break cycles by advancing one message at a time, preserving as much
      // parent-before-child ordering as possible for the remaining subtree.
      const next = items
        .filter((m) => !added.has(m.message.id))
        .sort(compareItems)[0];
      if (!next) break;
      output.push(next);
      added.add(next.message.id);
      continue;
    }
    ready.sort(compareItems);
    const next = ready[0]!;
    output.push(next);
    added.add(next.message.id);
  }

  return output;
}

export function createCustomThreadHistoryAdapter(
  aui: ThreadHistoryAui,
  fetchImpl: typeof fetch = fetch,
): ThreadHistoryAdapter {
  return {
    async load() {
      return { messages: [] };
    },
    async append() {
      // No-op: ExternalStoreRuntime uses withFormat for persistence
    },
    withFormat<TMessage, TStorageFormat extends Record<string, unknown>>(
      formatAdapter: MessageFormatAdapter<TMessage, TStorageFormat>,
    ): GenericThreadHistoryAdapter<TMessage> {
      return {
        async append(item: MessageFormatItem<TMessage>) {
          const { remoteId } = await aui.threadListItem().initialize();
          const messageId = formatAdapter.getId(item.message);
          const encoded = formatAdapter.encode(item) as TStorageFormat;

          const res = await fetchImpl(
            `/api/threads/${encodeURIComponent(remoteId)}/messages`,
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                messageId,
                parentId: item.parentId,
                format: formatAdapter.format,
                content: encoded,
              }),
            },
          );

          if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            throw new Error(
              (err as { error?: string }).error ||
                `Failed to save message: ${res.status}`,
            );
          }
        },
        async update(
          item: MessageFormatItem<TMessage>,
          localMessageId: string,
        ) {
          const remoteId = aui.threadListItem().getState().remoteId;
          if (!remoteId) {
            console.warn(
              "[thread-history] update() skipped: thread not yet initialized (no remoteId)",
            );
            return;
          }

          const encoded = formatAdapter.encode(item) as TStorageFormat;

          const res = await fetchImpl(
            `/api/threads/${encodeURIComponent(remoteId)}/messages/${encodeURIComponent(localMessageId)}`,
            {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ content: encoded }),
            },
          );

          if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            throw new Error(
              (err as { error?: string }).error ||
                `Failed to update message: ${res.status}`,
            );
          }
        },
        async load(): Promise<MessageFormatRepository<TMessage>> {
          const remoteId = aui.threadListItem().getState().remoteId;
          if (!remoteId) return { messages: [] };

          const res = await fetchImpl(
            `/api/threads/${encodeURIComponent(remoteId)}/messages?format=${encodeURIComponent(formatAdapter.format)}`,
          );
          if (!res.ok) {
            throw new Error(`Failed to load messages: ${res.status}`);
          }

          const data = await res.json();
          const messages = Array.isArray(data?.messages) ? data.messages : [];
          const apiHeadId = data?.headId ?? null;

          if (messages.length === 0) {
            return { messages: [], headId: apiHeadId };
          }

          type DecodedItem = MessageFormatItem<TMessage> & {
            created_at: string;
          };
          const decoded: DecodedItem[] = messages.map(
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
            },
          );

          type SortableItem = {
            parentId: string | null;
            message: { id: string };
            created_at: string;
          };
          const sorted = sortParentsBeforeChildren(
            decoded as SortableItem[],
            (d) => d.created_at,
          ) as DecodedItem[];

          const headId =
            apiHeadId ??
            (sorted.length > 0
              ? formatAdapter.getId(sorted[sorted.length - 1]!.message)
              : null);

          return {
            messages: sorted.map(({ parentId, message }) => ({
              parentId,
              message,
            })),
            headId,
          };
        },
        reportTelemetry(_items, _options) {
          // Optional: wire to Posthog, runs API, etc. Cloud uses runs.report().
        },
      };
    },
  };
}

/**
 * AI SDK–only thread history adapter.
 * Uses withFormat(aiSDKV6FormatAdapter) for persistence via useExternalHistory.
 * Base load/append are stubs since ExternalStoreRuntime uses withFormat for persistence.
 */
export function useCustomThreadHistoryAdapter(): ThreadHistoryAdapter {
  const aui = useAui();

  return useMemo<ThreadHistoryAdapter>(
    () => createCustomThreadHistoryAdapter(aui),
    [aui],
  );
}
