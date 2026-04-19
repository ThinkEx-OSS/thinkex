"use client";

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { loadMessages } from "@/lib/chat/persistence";
import {
  buildChildrenMap,
  getHeadPath,
  sortParentsBeforeChildren,
} from "@/lib/chat/message-tree";
import type { StoredMessage, ThinkexUIMessage } from "@/lib/chat/types";

export interface MessageTree {
  messagesById: Map<string, ThinkexUIMessage>;
  parentMap: Map<string, string | null>;
  childrenMap: Map<string | null, string[]>;
}

export function buildMessageTreeFromStoredMessages(args: {
  rows: StoredMessage[];
  headId: string | null;
}): {
  tree: MessageTree;
  headId: string | null;
  headPath: ThinkexUIMessage[];
} {
  const decoded = sortParentsBeforeChildren(
    args.rows.map((row) => ({
      parentId: row.parent_id,
      message: decodeStoredMessage(row),
      created_at: row.created_at,
    })),
    (row) => row.created_at,
  );

  const messagesById = new Map<string, ThinkexUIMessage>();
  const parentMap = new Map<string, string | null>();

  for (const row of decoded) {
    messagesById.set(row.message.id, row.message);
    parentMap.set(row.message.id, row.parentId);
  }

  const childrenMap = buildChildrenMap(parentMap);
  const headPath = getHeadPath(
    messagesById,
    parentMap,
    childrenMap,
    args.headId,
    {},
  );

  return {
    tree: {
      messagesById,
      parentMap,
      childrenMap,
    },
    headId: args.headId,
    headPath,
  };
}

function decodeStoredMessage(row: StoredMessage): ThinkexUIMessage {
  const content =
    row.content && typeof row.content === "object" && !Array.isArray(row.content)
      ? row.content
      : {};

  return {
    id: row.id,
    role:
      (content as { role?: ThinkexUIMessage["role"] }).role === "assistant"
        ? "assistant"
        : "user",
    parts: Array.isArray((content as { parts?: unknown }).parts)
      ? ((content as { parts: ThinkexUIMessage["parts"] }).parts ?? [])
      : [],
    metadata:
      (content as { metadata?: ThinkexUIMessage["metadata"] }).metadata ?? {},
  } satisfies ThinkexUIMessage;
}

export function useInitialMessages(threadId: string | null): {
  messages: ThinkexUIMessage[];
  headId: string | null;
  isLoading: boolean;
  tree: MessageTree;
} {
  const query = useQuery({
    queryKey: ["thread-messages", threadId],
    queryFn: () =>
      threadId
        ? loadMessages(threadId)
        : Promise.resolve({ messages: [], headId: null }),
    enabled: !!threadId,
  });

  const value = useMemo(() => {
    const data = query.data ?? { messages: [], headId: null };
    return buildMessageTreeFromStoredMessages({
      rows: data.messages,
      headId: data.headId,
    });
  }, [query.data]);

  return {
    messages: value.headPath,
    headId: value.headId,
    isLoading: query.isLoading,
    tree: value.tree,
  };
}
