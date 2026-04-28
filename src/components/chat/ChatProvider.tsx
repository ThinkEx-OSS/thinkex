"use client";

import { Chat, useChat } from "@ai-sdk/react";
import { useQueryClient } from "@tanstack/react-query";
import { createContext, useCallback, useContext, useEffect, useEffectEvent, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { toast } from "sonner";
import { useShallow } from "zustand/react/shallow";

import { useWorkspaceContext } from "@/contexts/WorkspaceContext";
import { useViewingItemIds } from "@/hooks/ui/use-viewing-item-ids";
import { useWorkspaceContextProvider } from "@/hooks/ai/use-workspace-context-provider";
import { useWorkspaceState } from "@/hooks/workspace/use-workspace-state";
import { chatDebug, summarizeRoster } from "@/lib/chat/debug";
import { chatQueryKeys, fetchThreadMessages, type ThreadListItem } from "@/lib/chat/queries";
import { createChatTransport } from "@/lib/chat/transport";
import type { ChatMessage } from "@/lib/chat/types";
import { hasMeaningfulContent } from "@/lib/chat/types";
import { type ThreadStatus } from "@/lib/chat/thread-runtime-state";
import { useUIStore } from "@/lib/stores/ui-store";
import { selectCurrentThreadId, useWorkspaceStore } from "@/lib/stores/workspace-store";
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
  isHistoryLoading: boolean;
  selectThread: (threadId: string) => void;
  startNewThread: () => void;
}

interface ChatManagerContextValue {
  workspaceId: string;
  aliveThreadIds: readonly string[];
  threadOrderVersion: number;
  getRuntime: (threadId: string) => Chat<ChatMessage> | undefined;
  disposeThread: (threadId: string) => void;
  getThreadStatusSnapshot: (threadId: string | undefined) => ThreadStatus;
  getThreadLastStartedAt: (threadId: string | undefined) => number;
}

const ChatContext = createContext<ChatContextValue | null>(null);
const ChatManagerContext = createContext<ChatManagerContextValue | null>(null);

function getStatusSubscription(chat: Chat<ChatMessage>) {
  const register = (
    chat as Chat<ChatMessage> & {
      "~registerStatusCallback"?: (onChange: () => void) => () => void;
    }
  )["~registerStatusCallback"];

  if (typeof register !== "function") {
    if (process.env.NODE_ENV !== "production") {
      console.warn(
        "[ChatProvider] Chat['~registerStatusCallback'] is unavailable. Per-thread status subscriptions are disabled.",
      );
    }
    return null;
  }

  return register.bind(chat);
}

function describeChatError(error: Error): {
  title: string;
  description: string;
} {
  const errorMessage = error.message?.toLowerCase() || "";
  const responseBody = (
    error as unknown as { responseBody?: string }
  ).responseBody?.toLowerCase() || "";
  const errorData = (
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
      title: "AI backend configuration error",
      description:
        "Please check the AI provider or gateway environment variables configured for your self-hosted deployment.",
    };
  }
  return {
    title: "Something went wrong",
    description:
      error.message || "An unexpected error occurred. Please try again.",
  };
}

export function useChatContext(): ChatContextValue {
  const ctx = useContext(ChatContext);
  if (!ctx) {
    throw new Error("useChatContext must be used inside <ChatProvider>");
  }
  return ctx;
}

export function useChatContextSafe(): ChatContextValue | null {
  return useContext(ChatContext);
}

export function useChatThreadManager(): ChatManagerContextValue {
  const ctx = useContext(ChatManagerContext);
  if (!ctx) {
    throw new Error(
      "useChatThreadManager must be used inside <ChatProvider>",
    );
  }
  return ctx;
}

export function useThreadStatus(threadId: string | undefined): ThreadStatus {
  const { aliveThreadIds, getRuntime } = useChatThreadManager();
  const chat =
    threadId && aliveThreadIds.includes(threadId)
      ? getRuntime(threadId)
      : undefined;

  return useSyncExternalStore<ThreadStatus>(
    useCallback(
      (onChange) => {
        if (!chat) return () => {};
        const register = getStatusSubscription(chat);
        if (!register) return () => {};
        return register(onChange);
      },
      [chat],
    ),
    () => (chat ? (chat.status as ThreadStatus) : "idle"),
    () => "idle",
  );
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

export function ChatProvider({ workspaceId, children }: ChatProviderProps) {
  const queryClient = useQueryClient();

  const persistedThreadId = useWorkspaceStore(
    selectCurrentThreadId(workspaceId),
  );
  const setCurrentThreadId = useWorkspaceStore(
    (state) => state.setCurrentThreadId,
  );

  const selectedModelId = useUIStore((state) => state.selectedModelId);
  const memoryEnabled = useUIStore((state) => state.memoryEnabled);
  const activeFolderId = useUIStore((state) => state.activeFolderId);
  const selectedCardIdsSet = useUIStore((state) => state.selectedCardIds);
  const activePdfPageByItemId = useUIStore(
    useShallow((state) => state.activePdfPageByItemId),
  );
  const { state: workspaceState } = useWorkspaceState(workspaceId);
  const viewingItemIds = useViewingItemIds();
  const { currentWorkspace } = useWorkspaceContext();
  const systemPrompt = useWorkspaceContextProvider(
    workspaceId,
    workspaceState,
    currentWorkspace?.name,
  );

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

  const transportContext = useMemo(
    () => ({
      workspaceId,
      modelId: selectedModelId,
      memoryEnabled,
      activeFolderId,
      selectedCardsContext,
      system: systemPrompt,
    }),
    [
      activeFolderId,
      memoryEnabled,
      selectedCardsContext,
      selectedModelId,
      systemPrompt,
      workspaceId,
    ],
  );

  const getTransportContext = useEffectEvent(() => transportContext);

  const [transport] = useState(() =>
    createChatTransport(getTransportContext),
  );

  const runtimesRef = useRef<Map<string, Chat<ChatMessage>>>(new Map());
  const pendingRef = useRef<Map<string, Promise<Chat<ChatMessage>>>>(new Map());
  const threadLastStartedAtRef = useRef<Map<string, number>>(new Map());
  const runtimeStatusDisposersRef = useRef<Map<string, () => void>>(new Map());
  const generationRef = useRef(0);
  const [aliveThreadIds, setAliveThreadIds] = useState<readonly string[]>([]);
  const [threadOrderVersion, setThreadOrderVersion] = useState(0);
  const [activeRuntime, setActiveRuntime] = useState<Chat<ChatMessage> | null>(
    null,
  );

  const bumpThreadOrderVersion = useCallback(() => {
    setThreadOrderVersion((value) => value + 1);
  }, []);

  const handleError = useCallback((error: Error) => {
    console.error("[Chat Error]", error);
    const { title, description } = describeChatError(error);
    toast.error(title, { description });
  }, []);

  const buildRuntime = useCallback(
    (threadId: string, initialMessages: ChatMessage[]): Chat<ChatMessage> => {
      const cleaned = initialMessages.filter(hasMeaningfulContent);
      chatDebug("runtime: create", {
        threadId,
        droppedEmpty: initialMessages.length - cleaned.length,
        ...summarizeRoster(cleaned as unknown[]),
      });

      const chat = new Chat<ChatMessage>({
        id: threadId,
        transport,
        messages: cleaned,
        onError: handleError,
        onData: (dataPart) => {
          if (dataPart.type !== "data-chat-title") return;
          const title =
            typeof dataPart.data === "string" ? dataPart.data : undefined;
          if (!title) return;
          queryClient.setQueryData<ThreadListItem[]>(
            chatQueryKeys.threads(workspaceId),
            (prev) =>
              prev?.map((thread) =>
                thread.id === threadId ? { ...thread, title } : thread,
              ),
          );
        },
        onFinish: () => {
          void queryClient.invalidateQueries({
            queryKey: chatQueryKeys.threads(workspaceId),
          });
        },
      });

      const register = getStatusSubscription(chat);
      if (register) {
        const dispose = register(() => {
          bumpThreadOrderVersion();
        });
        runtimeStatusDisposersRef.current.set(threadId, dispose);
      }

      return chat;
    },
    [bumpThreadOrderVersion, handleError, queryClient, transport, workspaceId],
  );

  const ensureRuntime = useCallback(
    async (threadId: string, opts: { hydrate: boolean }) => {
      const existing = runtimesRef.current.get(threadId);
      if (existing) return existing;

      const inFlight = pendingRef.current.get(threadId);
      if (inFlight) return inFlight;

      const generation = generationRef.current;
      let promise!: Promise<Chat<ChatMessage>>;
      promise = (async () => {
        let initial: ChatMessage[] = [];

        if (opts.hydrate) {
          try {
            initial = await fetchThreadMessages(threadId);
          } catch (error) {
            console.warn("[ChatProvider] failed to hydrate thread", {
              threadId,
              error,
            });
            initial = [];
          }
        }

        if (generationRef.current !== generation) {
          throw new Error("runtime build superseded");
        }
        if (pendingRef.current.get(threadId) !== promise) {
          throw new Error("runtime build superseded");
        }

        pendingRef.current.delete(threadId);

        const chat = buildRuntime(threadId, initial);
        runtimesRef.current.set(threadId, chat);
        setAliveThreadIds((prev) =>
          prev.includes(threadId) ? prev : [...prev, threadId],
        );
        bumpThreadOrderVersion();
        return chat;
      })();

      pendingRef.current.set(threadId, promise);
      return promise;
    },
    [buildRuntime, bumpThreadOrderVersion],
  );

  const getRuntime = useCallback(
    (threadId: string) => runtimesRef.current.get(threadId),
    [],
  );

  const disposeThread = useCallback(
    (threadId: string) => {
      pendingRef.current.delete(threadId);

      const statusDispose = runtimeStatusDisposersRef.current.get(threadId);
      if (statusDispose) {
        statusDispose();
        runtimeStatusDisposersRef.current.delete(threadId);
      }

      threadLastStartedAtRef.current.delete(threadId);

      const chat = runtimesRef.current.get(threadId);
      if (chat) {
        try {
          chat.stop();
        } catch {
          // noop
        }
        runtimesRef.current.delete(threadId);
      }

      setActiveRuntime((current) =>
        current?.id === threadId ? null : current,
      );
      setAliveThreadIds((prev) => prev.filter((id) => id !== threadId));
      bumpThreadOrderVersion();
    },
    [bumpThreadOrderVersion],
  );

  useEffect(() => {
    const runtimeStatusDisposers = runtimeStatusDisposersRef.current;
    const runtimes = runtimesRef.current;
    const pending = pendingRef.current;
    const threadLastStartedAt = threadLastStartedAtRef.current;

    return () => {
      generationRef.current += 1;

      runtimeStatusDisposers.forEach((dispose) => dispose());
      runtimeStatusDisposers.clear();

      runtimes.forEach((chat) => {
        try {
          chat.stop();
        } catch {
          // noop
        }
      });

      runtimes.clear();
      pending.clear();
      threadLastStartedAt.clear();
      setAliveThreadIds([]);
      bumpThreadOrderVersion();
    };
  }, [workspaceId, bumpThreadOrderVersion]);

  const [threadId, setThreadId] = useState<string>(
    () => persistedThreadId ?? generateThreadId(),
  );
  const [shouldHydrateOnOpen, setShouldHydrateOnOpen] = useState(
    () => !!persistedThreadId,
  );
  const previousWorkspaceIdRef = useRef(workspaceId);

  useEffect(() => {
    const workspaceChanged = previousWorkspaceIdRef.current !== workspaceId;
    previousWorkspaceIdRef.current = workspaceId;

    if (persistedThreadId) {
      setThreadId((current) =>
        workspaceChanged || current !== persistedThreadId
          ? persistedThreadId
          : current,
      );
      setActiveRuntime(getRuntime(persistedThreadId) ?? null);
      setShouldHydrateOnOpen(true);
      return;
    }

    setShouldHydrateOnOpen(false);
    setActiveRuntime(null);
    if (workspaceChanged) {
      setThreadId(generateThreadId());
    }
  }, [getRuntime, persistedThreadId, workspaceId]);

  useEffect(() => {
    let cancelled = false;

    void ensureRuntime(threadId, {
      hydrate: shouldHydrateOnOpen,
    })
      .then((runtime) => {
        if (!cancelled) {
          setActiveRuntime(runtime);
        }
      })
      .catch((error) => {
        const isSuperseded =
          error instanceof Error && /superseded/i.test(error.message);
        if (!isSuperseded) {
          console.error("[ChatProvider] failed to ensure runtime", error);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [ensureRuntime, shouldHydrateOnOpen, threadId]);

  const chat = activeRuntime;

  const pendingTransport = useMemo(
    () => ({
      sendMessages: async () => {
        throw new Error("Chat runtime is not ready");
      },
      reconnectToStream: async () => null,
    }),
    [],
  );

  const pendingChat = useMemo(
    () =>
      new Chat<ChatMessage>({
        id: "__pending__",
        messages: [],
        transport: pendingTransport,
      }),
    [pendingTransport],
  );

  const activeChat = chat ?? pendingChat;

  const {
    messages,
    status,
    error,
    sendMessage,
    regenerate,
    stop,
    clearError,
    setMessages,
  } = useChat<ChatMessage>({ chat: activeChat });

  const markThreadStarted = useCallback(
    (targetThreadId: string) => {
      threadLastStartedAtRef.current.set(targetThreadId, Date.now());
      bumpThreadOrderVersion();
      queryClient.setQueryData<ThreadListItem[]>(
        chatQueryKeys.threads(workspaceId),
        (previous) => {
          if (!previous) {
            return [
              {
                id: targetThreadId,
                status: "regular",
              },
            ];
          }

          if (previous.some((thread) => thread.id === targetThreadId)) {
            return previous;
          }

          return [
            {
              id: targetThreadId,
              status: "regular",
            },
            ...previous,
          ];
        },
      );
      void queryClient.invalidateQueries({
        queryKey: chatQueryKeys.threads(workspaceId),
      });
    },
    [bumpThreadOrderVersion, queryClient, workspaceId],
  );

  const persistActiveThreadSelection = useCallback(() => {
    if (persistedThreadId !== threadId) {
      setCurrentThreadId(workspaceId, threadId);
    }
  }, [persistedThreadId, setCurrentThreadId, threadId, workspaceId]);

  const selectThread = useCallback(
    (nextThreadId: string) => {
      setActiveRuntime(getRuntime(nextThreadId) ?? null);
      setThreadId(nextThreadId);
      setShouldHydrateOnOpen(true);
      setCurrentThreadId(workspaceId, nextThreadId);
    },
    [getRuntime, setCurrentThreadId, workspaceId],
  );

  const startNewThread = useCallback(() => {
    const nextThreadId = generateThreadId();
    setActiveRuntime(null);
    setThreadId(nextThreadId);
    setShouldHydrateOnOpen(false);
    void queryClient.invalidateQueries({
      queryKey: chatQueryKeys.threads(workspaceId),
    });
  }, [queryClient, workspaceId]);

  const sendMessageWithPersistence = useCallback<
    ChatContextValue["sendMessage"]
  >(
    (...args) => {
      if (!chat) return Promise.resolve(undefined);
      markThreadStarted(threadId);
      persistActiveThreadSelection();
      return sendMessage(...args);
    },
    [chat, markThreadStarted, persistActiveThreadSelection, sendMessage, threadId],
  );

  const regenerateWithTracking = useCallback<ChatContextValue["regenerate"]>(
    (...args) => {
      if (!chat) return Promise.resolve(undefined);
      markThreadStarted(threadId);
      persistActiveThreadSelection();
      return regenerate(...args);
    },
    [chat, markThreadStarted, persistActiveThreadSelection, regenerate, threadId],
  );

  const chatValue = useMemo<ChatContextValue>(
    () => ({
      threadId,
      workspaceId,
      status: chat ? status : "ready",
      error: chat ? error : undefined,
      messages: chat ? (messages as ChatMessage[]) : [],
      setMessages: chat ? setMessages : () => {},
      sendMessage: sendMessageWithPersistence,
      regenerate: regenerateWithTracking,
      stop: chat ? stop : async () => {},
      clearError: chat ? clearError : () => {},
      isHistoryLoading: !chat,
      selectThread,
      startNewThread,
    }),
    [
      chat,
      clearError,
      error,
      messages,
      regenerateWithTracking,
      selectThread,
      sendMessageWithPersistence,
      setMessages,
      startNewThread,
      status,
      stop,
      threadId,
      workspaceId,
    ],
  );

  const managerValue = useMemo<ChatManagerContextValue>(
    () => ({
      workspaceId,
      aliveThreadIds,
      threadOrderVersion,
      getRuntime,
      disposeThread,
      getThreadStatusSnapshot: (targetThreadId) => {
        if (!targetThreadId) return "idle";
        const runtime = getRuntime(targetThreadId);
        return runtime ? (runtime.status as ThreadStatus) : "idle";
      },
      getThreadLastStartedAt: (targetThreadId) =>
        targetThreadId
          ? (threadLastStartedAtRef.current.get(targetThreadId) ?? 0)
          : 0,
    }),
    [
      aliveThreadIds,
      disposeThread,
      getRuntime,
      threadOrderVersion,
      workspaceId,
    ],
  );

  return (
    <ChatManagerContext.Provider value={managerValue}>
      <ChatContext.Provider value={chatValue}>{children}</ChatContext.Provider>
    </ChatManagerContext.Provider>
  );
}
