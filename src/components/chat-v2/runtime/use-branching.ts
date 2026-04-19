"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { patchThread } from "@/lib/chat/persistence";
import { buildChildrenMap, getHeadPath, getSiblings } from "@/lib/chat/message-tree";
import type { ThinkexUIMessage } from "@/lib/chat/types";
import type { MessageTree } from "@/components/chat-v2/runtime/use-initial-messages";

export interface BranchingState {
  tree: MessageTree;
  headPath: ThinkexUIMessage[];
  headId: string | null;
  siblings(messageId: string): string[];
  setHead(messageId: string): Promise<void>;
  editUserMessage(messageId: string, newText: string): Promise<{
    message: ThinkexUIMessage;
    parentId: string | null;
    path: ThinkexUIMessage[];
  }>;
}

export function useBranching(args: {
  threadId: string;
  initialTree: MessageTree;
  initialHeadId: string | null;
  messages: ThinkexUIMessage[];
  setMessages: (messages: ThinkexUIMessage[]) => void;
}) {
  const [tree, setTree] = useState<MessageTree>(args.initialTree);
  const [headId, setHeadId] = useState<string | null>(args.initialHeadId);

  useEffect(() => {
    setTree(args.initialTree);
  }, [args.initialTree]);

  useEffect(() => {
    setHeadId(args.initialHeadId);
  }, [args.initialHeadId]);

  useEffect(() => {
    setTree((current) => {
      const nextMessagesById = new Map(current.messagesById);
      const nextParentMap = new Map(current.parentMap);

      for (let index = 0; index < args.messages.length; index++) {
        const message = args.messages[index]!;
        nextMessagesById.set(message.id, message);
        if (!nextParentMap.has(message.id)) {
          nextParentMap.set(message.id, args.messages[index - 1]?.id ?? null);
        }
      }

      return {
        messagesById: nextMessagesById,
        parentMap: nextParentMap,
        childrenMap: buildChildrenMap(nextParentMap),
      };
    });

    if (args.messages.length > 0) {
      setHeadId(args.messages[args.messages.length - 1]!.id);
    }
  }, [args.messages]);

  const headPath = useMemo(
    () =>
      getHeadPath(
        tree.messagesById,
        tree.parentMap,
        tree.childrenMap,
        headId,
        {},
      ),
    [tree, headId],
  );

  const siblings = useCallback(
    (messageId: string) => getSiblings(tree.parentMap, tree.childrenMap, messageId),
    [tree],
  );

  const setHead = useCallback(
    async (messageId: string) => {
      const nextPath = getHeadPath(
        tree.messagesById,
        tree.parentMap,
        tree.childrenMap,
        messageId,
        {},
      );
      args.setMessages(nextPath);
      setHeadId(messageId);
      await patchThread(args.threadId, { headMessageId: messageId });
    },
    [args, tree],
  );

  const editUserMessage = useCallback(
    async (messageId: string, newText: string) => {
      const original = tree.messagesById.get(messageId);
      if (!original || original.role !== "user") {
        throw new Error("Only user messages can be edited");
      }

      const parentId = tree.parentMap.get(messageId) ?? null;
      const newMessageId = crypto.randomUUID();
      const nextMessage: ThinkexUIMessage = {
        ...original,
        id: newMessageId,
        parts: original.parts.map((part) =>
          part.type === "text"
            ? { ...part, text: newText }
            : part,
        ) as ThinkexUIMessage["parts"],
      };

      const nextMessagesById = new Map(tree.messagesById);
      const nextParentMap = new Map(tree.parentMap);
      nextMessagesById.set(nextMessage.id, nextMessage);
      nextParentMap.set(nextMessage.id, parentId);
      const nextTree: MessageTree = {
        messagesById: nextMessagesById,
        parentMap: nextParentMap,
        childrenMap: buildChildrenMap(nextParentMap),
      };
      setTree(nextTree);
      setHeadId(nextMessage.id);

      const path = getHeadPath(
        nextTree.messagesById,
        nextTree.parentMap,
        nextTree.childrenMap,
        nextMessage.id,
        {},
      );

      args.setMessages(path);
      await patchThread(args.threadId, { headMessageId: nextMessage.id });

      return {
        message: nextMessage,
        parentId,
        path,
      };
    },
    [args, tree],
  );

  return {
    tree,
    headPath,
    headId,
    siblings,
    setHead,
    editUserMessage,
  } satisfies BranchingState;
}
