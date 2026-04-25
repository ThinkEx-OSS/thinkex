"use client";

import { useChat } from "@ai-sdk/react";
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
import { toast } from "sonner";
import { useShallow } from "zustand/react/shallow";

import { useWorkspaceContext } from "@/contexts/WorkspaceContext";
import { useViewingItemIds } from "@/hooks/ui/use-viewing-item-ids";
import { useWorkspaceContextProvider } from "@/hooks/ai/use-workspace-context-provider";
import { useWorkspaceState } from "@/hooks/workspace/use-workspace-state";
import { chatDebug, chatWarn, summarizeRoster } from "@/lib/chat/debug";
import {
  chatQueryKeys,
  useThreadMessagesQuery,
  type ThreadListItem,
} from "@/lib/chat/queries";
import { createChatTransport } from "@/lib/chat/transport";
import type { ChatMessage } from "@/lib/chat/types";
import { useUIStore } from "@/lib/stores/ui-store";
import {
  selectCurrentThreadId,
  useWorkspaceStore,
} from "@/lib/stores/workspace-store";
import { formatSelectedCardsMetadata } from "@/lib/utils/format-workspace-context";

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
  /** True until the persisted history hydrates (only relevant for resumed threads). */
  isHistoryLoading: boolean;
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

function describeChatError(error: Error): {
  title: string;
  description: string;
} {
  const errorMessage = error.message?.toLowerCase() || "";
  const responseBody =
    (
      error as unknown as { responseBody?: string }
    ).responseBody?.toLowerCase() || "";
  const errorData =
    (
      error as unknown as { data?: { error?: { message?: string } } }
    ).data?.error?.message?.toLowerCase() || "";
  const combined = `${errorMessage} ${responseBody} ${errorData}`;

  if (
    combined.includes("timeout") ||
    combined.includes("504") ||
    combined.includes("gateway")
  ) {
    return {
      title: "Request timed out",
      description: "The AI is taking too long to respond. Please try again.",
    };
  }
  if (
    combined.includes("network") ||
    combined.includes("fetch") ||
    combined.includes("failed to fetch")
  ) {
    return {
      title: "Connection error",
      description: "Unable to reach the server. Please check your connection.",
    };
  }
  if (combined.includes("500") || combined.includes("internal server")) {
    return {
      title: "Server error",
      description: "Something went wrong on our end. Please try again.",
    };
  }
  if (combined.includes("429") || combined.includes("rate limit")) {
    return {
      title: "Rate limited",
      description: "Too many requests. Please wait a moment and try again.",
    };
  }
  if (combined.includes("401") || combined.includes("unauthorized")) {
    return {
      title: "Authentication error",
      description: "Your session may have expired. Please refresh the page.",
    };
  }
  if (
    combined.includes("api key not valid") ||
    combined.includes("api_key_invalid") ||
    combined.includes("api key not defined") ||
    combined.includes("api key is not set") ||
    (combined.includes("api key") &&
      (combined.includes("not valid") || combined.includes("invalid")))
  ) {
    return {
      title: "API key not valid",
      description:
        "Please check your GOOGLE_GENERATIVE_AI_API_KEY in your environment variables.",
    };
  }
  return {
    title: "Something went wrong",
    description:
      error.message || "An unexpected error occurred. Please try again.",
  };
}

/**
 * Owns the `useChat` instance for a workspace. Generates a thread id on first
 * use, hydrates history when a thread id is restored from `workspaceStore`, and
 * exposes the runtime to the rest of the chat surface via context.
 */
export function ChatProvider({ workspaceId, children }: ChatProviderProps) {
  const persistedThreadId = useWorkspaceStore(
    selectCurrentThreadId(workspaceId),
  );
  const setCurrentThreadId = useWorkspaceStore(
    (state) => state.setCurrentThreadId,
  );

  // Lazily generate a thread id when none is persisted. Stored in zustand so
  // it survives re-renders and selection of the same workspace.
  const [threadId, setThreadId] = useState<string>(
    () => persistedThreadId ?? generateThreadId(),
  );

  useEffect(() => {
    if (!persistedThreadId) {
      setCurrentThreadId(workspaceId, threadId);
    } else if (persistedThreadId !== threadId) {
      setThreadId(persistedThreadId);
    }
  }, [persistedThreadId, threadId, setCurrentThreadId, workspaceId]);

  const queryClient = useQueryClient();

  // History only matters for resumed threads. For brand-new ids, the GET
  // returns `[]` and useChat starts empty regardless.
  const { data: persistedMessages, isLoading: isHistoryLoading } =
    useThreadMessagesQuery(threadId);

  // [chat-debug] Watch the hydration query so we can confirm what the
  // server is sending. If the assistant entries here have `partCount=0`,
  // the bug is in persistence (server side); if they're correct, the bug
  // is in the seed-into-useChat step below or in the renderer.
  useEffect(() => {
    if (!persistedMessages) {
      chatDebug("hydrate query: pending/empty", {
        threadId,
        isHistoryLoading,
      });
      return;
    }
    const roster = summarizeRoster(persistedMessages as unknown[]);
    chatDebug("hydrate query: data", { threadId, ...roster });
    if (roster.emptyAssistants.length > 0) {
      chatWarn("hydrate query: assistant rows have empty parts", {
        threadId,
        emptyAssistants: roster.emptyAssistants,
      });
    }
  }, [persistedMessages, threadId, isHistoryLoading]);

  // Live request payload context (model, memory, selections). Pulled from
  // the same zustand stores the old WorkspaceRuntimeProvider used.
  const selectedModelId = useUIStore((state) => state.selectedModelId);
  const memoryEnabled = useUIStore((state) => state.memoryEnabled);
  const activeFolderId = useUIStore((state) => state.activeFolderId);
  const selectedCardIdsSet = useUIStore((state) => state.selectedCardIds);
  const activePdfPageByItemId = useUIStore(
    useShallow((state) => state.activePdfPageByItemId),
  );
  const { state: workspaceState } = useWorkspaceState(workspaceId);
  const viewingItemIds = useViewingItemIds();

  const contextCardIds = useMemo(() => {
    const ids = new Set<string>(selectedCardIdsSet);
    viewingItemIds.forEach((id) => ids.add(id));
    return ids;
  }, [selectedCardIdsSet, viewingItemIds]);

  const selectedCardsContext = useMemo(() => {
    if (contextCardIds.size === 0) return "";
    const contextItems = workspaceState.filter((item) =>
      contextCardIds.has(item.id),
    );
    if (contextItems.length === 0) return "";
    return formatSelectedCardsMetadata(
      contextItems,
      workspaceState,
      activePdfPageByItemId,
      viewingItemIds,
    );
  }, [workspaceState, contextCardIds, activePdfPageByItemId, viewingItemIds]);

  const { currentWorkspace } = useWorkspaceContext();
  // Build the workspace-level system prompt. Forwarded via the transport so
  // the server can prepend it to the model messages.
  const systemPrompt = useWorkspaceContextProvider(
    workspaceId,
    workspaceState,
    currentWorkspace?.name,
  );

  // Live ref so the transport always reads fresh values without recreating.
  const ctxRef = useRef({
    threadId,
    workspaceId,
    modelId: selectedModelId,
    memoryEnabled,
    activeFolderId,
    selectedCardsContext,
    system: systemPrompt,
  });
  ctxRef.current.threadId = threadId;
  ctxRef.current.workspaceId = workspaceId;
  ctxRef.current.modelId = selectedModelId;
  ctxRef.current.memoryEnabled = memoryEnabled;
  ctxRef.current.activeFolderId = activeFolderId;
  ctxRef.current.selectedCardsContext = selectedCardsContext;
  ctxRef.current.system = systemPrompt;

  const transport = useMemo(
    () => createChatTransport(() => ctxRef.current),
    // Stable transport across the component lifetime; payload is pulled
    // through the ref on every send.
    [],
  );

  const handleError = useCallback((error: Error) => {
    console.error("[Chat Error]", error);
    const { title, description } = describeChatError(error);
    toast.error(title, { description });
  }, []);

  const chat = useChat<ChatMessage>({
    id: threadId,
    transport,
    messages: (persistedMessages as ChatMessage[] | undefined) ?? undefined,
    onError: handleError,
    // Live title updates: the chat route writes a `data-chat-title` part to
    // the SSE stream once `generateThreadTitle` resolves. We patch the
    // threads list cache so ChatHeader / ThreadListDropdown show the real
    // title without a refetch.
    onData: (dataPart) => {
      if (dataPart.type !== "data-chat-title") return;
      const title =
        typeof dataPart.data === "string" ? dataPart.data : undefined;
      if (!title) return;
      queryClient.setQueryData<ThreadListItem[]>(
        chatQueryKeys.threads(workspaceId),
        (prev) => prev?.map((t) => (t.id === threadId ? { ...t, title } : t)),
      );
    },
  });

  const {
    messages,
    status,
    error,
    sendMessage,
    regenerate,
    stop,
    clearError,
    setMessages,
  } = chat;

  // When persisted history loads after the first render, seed messages once.
  // (useChat's `messages` initializer only runs on mount.)
  const seededRef = useRef(false);
  useEffect(() => {
    if (seededRef.current) return;
    if (!persistedMessages || persistedMessages.length === 0) return;
    if (messages.length > 0) {
      chatDebug("seed: skipped, useChat already has messages", {
        threadId,
        useChatCount: messages.length,
        persistedCount: persistedMessages.length,
      });
      seededRef.current = true;
      return;
    }
    chatDebug("seed: pushing persisted messages into useChat", {
      threadId,
      ...summarizeRoster(persistedMessages as unknown[]),
    });
    setMessages(persistedMessages as ChatMessage[]);
    seededRef.current = true;
  }, [persistedMessages, messages.length, setMessages, threadId]);

  // Reset the seed guard whenever we switch threads.
  useEffect(() => {
    seededRef.current = false;
  }, [threadId]);

  // After a turn completes, refresh the threads list once so newly-created
  // threads appear in the sidebar dropdown. Live title updates are handled
  // by `onData` above (data-chat-title stream part), so a single
  // post-completion invalidate is enough.
  const prevStatusRef = useRef(status);
  useEffect(() => {
    const prev = prevStatusRef.current;
    prevStatusRef.current = status;
    const wasActive = prev === "streaming" || prev === "submitted";
    const isActive = status === "streaming" || status === "submitted";
    if (!wasActive || isActive) return;
    void queryClient.invalidateQueries({
      queryKey: chatQueryKeys.threads(workspaceId),
    });
  }, [status, queryClient, workspaceId]);

  const startNewThread = useCallback(() => {
    const next = generateThreadId();
    setMessages([]);
    setCurrentThreadId(workspaceId, next);
    setThreadId(next);
    void queryClient.invalidateQueries({
      queryKey: chatQueryKeys.threads(workspaceId),
    });
  }, [queryClient, setMessages, setCurrentThreadId, workspaceId]);

  const value = useMemo<ChatContextValue>(
    () => ({
      threadId,
      workspaceId,
      status,
      error,
      messages: messages as ChatMessage[],
      setMessages,
      sendMessage,
      regenerate,
      stop,
      clearError,
      isHistoryLoading,
      startNewThread,
    }),
    [
      threadId,
      workspaceId,
      status,
      error,
      messages,
      setMessages,
      sendMessage,
      regenerate,
      stop,
      clearError,
      isHistoryLoading,
      startNewThread,
    ],
  );

  return <ChatContext.Provider value={value}>{children}</ChatContext.Provider>;
}
