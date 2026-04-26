"use client";

import { type Chat, useChat } from "@ai-sdk/react";
import { useQueryClient } from "@tanstack/react-query";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

import { useChatRuntimesContext } from "@/components/chat/ChatRuntimes";
import { chatQueryKeys } from "@/lib/chat/queries";
import type { ChatMessage } from "@/lib/chat/types";
import {
  selectCurrentThreadId,
  useWorkspaceStore,
} from "@/lib/stores/workspace-store";

interface ChatContextValue {
  threadId: string;
  workspaceId: string;
  status: ReturnType<typeof useChat>["status"];
  error: ReturnType<typeof useChat>["error"];
  messages: ChatMessage[];
  setMessages: ReturnType<typeof useChat<ChatMessage>>["setMessages"];
  sendMessage: ReturnType<typeof useChat<ChatMessage>>["sendMessage"];
  regenerate: ReturnType<typeof useChat<ChatMessage>>["regenerate"];
  stop: ReturnType<typeof useChat>["stop"];
  clearError: ReturnType<typeof useChat>["clearError"];
  /** True until the runtime for the active thread is ready (hydrated). */
  isHistoryLoading: boolean;
  selectThread: (threadId: string) => void;
  /** Reset the active chat (new thread id, empty messages). */
  startNewThread: () => void;
}

const ChatContext = createContext<ChatContextValue | null>(null);

export function useChatContext(): ChatContextValue {
  const ctx = useContext(ChatContext);
  if (!ctx)
    throw new Error("useChatContext must be used inside <ChatProvider>");
  return ctx;
}

/** Same hook, but does not throw when used outside. Use sparingly. */
export function useChatContextSafe(): ChatContextValue | null {
  return useContext(ChatContext);
}

interface ChatProviderProps {
  workspaceId: string;
  children: ReactNode;
}

function generateThreadId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `thread-${Math.random().toString(36).slice(2)}-${Date.now()}`;
}
/**
 * Owns the *visible* threadId selection for a workspace and binds the
 * current Chat runtime to the rest of the chat surface.
 *
 * Concurrent generation across threads is achieved by storing one `Chat`
 * instance per threadId in `<ChatRuntimesProvider>`'s in-memory registry.
 * Switching threads simply rebinds via `useChat({ chat })`; previous
 * runtimes keep streaming in the background.
 */
export function ChatProvider({ workspaceId, children }: ChatProviderProps) {
  const queryClient = useQueryClient();
  const persistedThreadId = useWorkspaceStore(
    selectCurrentThreadId(workspaceId),
  );
  const setCurrentThreadId = useWorkspaceStore(
    (state) => state.setCurrentThreadId,
  );
  const { ensureRuntime, getRuntime, aliveThreadIds } =
    useChatRuntimesContext();

  const [threadId, setThreadId] = useState<string>(
    () => persistedThreadId ?? generateThreadId(),
  );
  const [shouldHydrateOnFirstLoad, setShouldHydrateOnFirstLoad] = useState(
    () => !!persistedThreadId,
  );
  const threadIdRef = useRef(threadId);
  threadIdRef.current = threadId;
  const previousWorkspaceIdRef = useRef(workspaceId);

  useEffect(() => {
    const workspaceChanged = previousWorkspaceIdRef.current !== workspaceId;
    previousWorkspaceIdRef.current = workspaceId;

    if (!persistedThreadId) {
      setShouldHydrateOnFirstLoad(false);
      if (workspaceChanged) {
        setThreadId(generateThreadId());
      }
      return;
    }

    if (workspaceChanged || persistedThreadId !== threadIdRef.current) {
      setThreadId(persistedThreadId);
      setShouldHydrateOnFirstLoad(true);
    }
  }, [persistedThreadId, workspaceId]);

  // Kick off (or short-circuit on) the runtime for the active threadId. The
  // resolved Chat is stored in the workspace-level registry; we read it back
  // synchronously below so a thread switch never displays a stale runtime.
  useEffect(() => {
    void ensureRuntime(threadId, {
      hydrate: shouldHydrateOnFirstLoad,
    }).catch((err) => {
      const isSuperseded =
        err instanceof Error && /superseded/i.test(err.message);
      if (!isSuperseded) {
        console.error("[ChatProvider] failed to ensure runtime", err);
      }
    });
  }, [threadId, shouldHydrateOnFirstLoad, ensureRuntime]);

  const chat = useMemo<Chat<ChatMessage> | null>(() => {
    if (!aliveThreadIds.includes(threadId)) return null;
    return getRuntime(threadId) ?? null;
  }, [aliveThreadIds, getRuntime, threadId]);

  const selectThread = useCallback(
    (nextThreadId: string) => {
      setThreadId(nextThreadId);
      setShouldHydrateOnFirstLoad(true);
      setCurrentThreadId(workspaceId, nextThreadId);
    },
    [setCurrentThreadId, workspaceId],
  );

  const startNewThread = useCallback(() => {
    const next = generateThreadId();
    setThreadId(next);
    setShouldHydrateOnFirstLoad(false);
    void queryClient.invalidateQueries({
      queryKey: chatQueryKeys.threads(workspaceId),
    });
  }, [queryClient, workspaceId]);

  if (!chat) {
    return (
      <ChatContext.Provider
        value={{
          threadId,
          workspaceId,
          status: "ready",
          error: undefined,
          messages: [],
          setMessages: () => {},
          sendMessage: async () => {},
          regenerate: async () => {},
          stop: async () => {},
          clearError: () => {},
          isHistoryLoading: true,
          selectThread,
          startNewThread,
        }}
      >
        {children}
      </ChatContext.Provider>
    );
  }

  return (
    <BoundChatProvider
      chat={chat}
      threadId={threadId}
      workspaceId={workspaceId}
      persistedThreadId={persistedThreadId}
      selectThread={selectThread}
      startNewThread={startNewThread}
    >
      {children}
    </BoundChatProvider>
  );
}

interface BoundChatProviderProps {
  chat: Chat<ChatMessage>;
  threadId: string;
  workspaceId: string;
  persistedThreadId: string | undefined;
  selectThread: (threadId: string) => void;
  startNewThread: () => void;
  children: ReactNode;
}

function BoundChatProvider({
  chat,
  threadId,
  workspaceId,
  persistedThreadId,
  selectThread,
  startNewThread,
  children,
}: BoundChatProviderProps) {
  const setCurrentThreadId = useWorkspaceStore(
    (state) => state.setCurrentThreadId,
  );

  const {
    messages,
    status,
    error,
    sendMessage,
    regenerate,
    stop,
    clearError,
    setMessages,
  } = useChat<ChatMessage>({ chat });

  const sendMessageWithPersistence = useCallback<
    ChatContextValue["sendMessage"]
  >(
    (...args) => {
      if (persistedThreadId !== threadId) {
        setCurrentThreadId(workspaceId, threadId);
      }
      return sendMessage(...args);
    },
    [persistedThreadId, sendMessage, setCurrentThreadId, threadId, workspaceId],
  );

  const value = useMemo<ChatContextValue>(
    () => ({
      threadId,
      workspaceId,
      status,
      error,
      messages: messages as ChatMessage[],
      setMessages,
      sendMessage: sendMessageWithPersistence,
      regenerate,
      stop,
      clearError,
      isHistoryLoading: false,
      selectThread,
      startNewThread,
    }),
    [
      threadId,
      workspaceId,
      status,
      error,
      messages,
      setMessages,
      sendMessageWithPersistence,
      regenerate,
      stop,
      clearError,
      selectThread,
      startNewThread,
    ],
  );

  return <ChatContext.Provider value={value}>{children}</ChatContext.Provider>;
}
