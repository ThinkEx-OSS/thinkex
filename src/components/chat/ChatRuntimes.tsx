"use client";

import { Chat } from "@ai-sdk/react";
import { useQueryClient } from "@tanstack/react-query";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
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
  fetchThreadMessages,
  type ThreadListItem,
} from "@/lib/chat/queries";
import { createChatTransport } from "@/lib/chat/transport";
import type { ChatMessage } from "@/lib/chat/types";
import { hasMeaningfulContent } from "@/lib/chat/types";
import { useUIStore } from "@/lib/stores/ui-store";
import { formatSelectedCardsMetadata } from "@/lib/utils/format-workspace-context";

/**
 * Owns one `Chat` instance per visited threadId for the active workspace.
 *
 * Visible components bind via `useChat({ chat })` (in `ChatProvider`); the
 * dropdown subscribes to per-thread status with `useThreadStatus`. Switching
 * threads simply rebinds — the previous Chat keeps its in-flight stream
 * because it is no longer keyed by `threadId` at the hook level.
 */

type ChatStatus = "submitted" | "streaming" | "ready" | "error";
type ThreadStatus = ChatStatus | "idle";

interface ChatRuntimesContextValue {
  workspaceId: string;
  /** Get-or-create a runtime. Resolves once history is hydrated for existing threads. */
  ensureRuntime: (
    threadId: string,
    opts: { hydrate: boolean },
  ) => Promise<Chat<ChatMessage>>;
  /** Get an already-created runtime synchronously (or undefined). */
  getRuntime: (threadId: string) => Chat<ChatMessage> | undefined;
  /** Dispose a runtime (calls chat.stop() and removes from registry). */
  disposeRuntime: (threadId: string) => void;
  /** Reactive list of threadIds currently in the registry — drives consumer re-renders. */
  aliveThreadIds: readonly string[];
}

const ChatRuntimesContext = createContext<ChatRuntimesContextValue | null>(
  null,
);

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

interface ChatRuntimesProviderProps {
  workspaceId: string;
  children: ReactNode;
}

export function ChatRuntimesProvider({
  workspaceId,
  children,
}: ChatRuntimesProviderProps) {
  const queryClient = useQueryClient();

  // === Workspace-level request payload (model, memory, selections, system) ===
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

  // Live ref so the shared transport always reads fresh values without
  // recreating it for every keystroke. The Chat's own `id` is threaded into
  // the body via `prepareSendMessagesRequest`'s `id` parameter, so the
  // workspace transport is shared across all runtimes.
  const ctxRef = useRef({
    threadId: "",
    workspaceId,
    modelId: selectedModelId,
    memoryEnabled,
    activeFolderId,
    selectedCardsContext,
    system: systemPrompt,
  });
  ctxRef.current.workspaceId = workspaceId;
  ctxRef.current.modelId = selectedModelId;
  ctxRef.current.memoryEnabled = memoryEnabled;
  ctxRef.current.activeFolderId = activeFolderId;
  ctxRef.current.selectedCardsContext = selectedCardsContext;
  ctxRef.current.system = systemPrompt;

  const transport = useMemo(
    () => createChatTransport(() => ctxRef.current),
    // Stable transport for the lifetime of the provider; payload is pulled
    // through the ref on every send.
    [],
  );

  // === Registry ===
  const runtimesRef = useRef<Map<string, Chat<ChatMessage>>>(new Map());
  const pendingRef = useRef<Map<string, Promise<Chat<ChatMessage>>>>(new Map());
  const generationRef = useRef(0);
  const [aliveThreadIds, setAliveThreadIds] = useState<readonly string[]>([]);

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
        // Live title updates: the chat route writes a `data-chat-title`
        // part to the SSE stream once `generateThreadTitle` resolves. We
        // patch the threads list cache so ChatHeader / ThreadListDropdown
        // show the real title without a refetch — even if the user is
        // currently viewing a different thread.
        onData: (dataPart) => {
          if (dataPart.type !== "data-chat-title") return;
          const title =
            typeof dataPart.data === "string" ? dataPart.data : undefined;
          if (!title) return;
          queryClient.setQueryData<ThreadListItem[]>(
            chatQueryKeys.threads(workspaceId),
            (prev) =>
              prev?.map((t) => (t.id === threadId ? { ...t, title } : t)),
          );
        },
        onFinish: () => {
          // Refresh threads list once a turn finishes so newly-created
          // threads appear and lastMessageAt sort order updates — even when
          // the user has navigated away from this thread.
          void queryClient.invalidateQueries({
            queryKey: chatQueryKeys.threads(workspaceId),
          });
        },
      });
      return chat;
    },
    [transport, handleError, queryClient, workspaceId],
  );

  const ensureRuntime = useCallback<ChatRuntimesContextValue["ensureRuntime"]>(
    async (threadId, opts) => {
      const existing = runtimesRef.current.get(threadId);
      if (existing) return existing;
      const inFlight = pendingRef.current.get(threadId);
      if (inFlight) return inFlight;

      const generation = generationRef.current;
      const promise: Promise<Chat<ChatMessage>> = (async () => {
        let initial: ChatMessage[] = [];
        if (opts.hydrate) {
          try {
            initial = await fetchThreadMessages(threadId);
          } catch (err) {
            chatWarn("runtime: history fetch failed", { threadId, err });
            initial = [];
          }
        }
        // If we were torn down (workspace switch) while fetching, abandon —
        // the cleanup bumped the generation counter.
        if (generationRef.current !== generation) {
          chatDebug("runtime: stale build discarded", { threadId });
          throw new Error("runtime build superseded");
        }
        pendingRef.current.delete(threadId);
        const chat = buildRuntime(threadId, initial);
        runtimesRef.current.set(threadId, chat);
        setAliveThreadIds((prev) =>
          prev.includes(threadId) ? prev : [...prev, threadId],
        );
        return chat;
      })();
      pendingRef.current.set(threadId, promise);
      return promise;
    },
    [buildRuntime],
  );

  const getRuntime = useCallback<ChatRuntimesContextValue["getRuntime"]>(
    (threadId) => runtimesRef.current.get(threadId),
    [],
  );

  const disposeRuntime = useCallback<
    ChatRuntimesContextValue["disposeRuntime"]
  >((threadId) => {
    const chat = runtimesRef.current.get(threadId);
    pendingRef.current.delete(threadId);
    if (!chat) return;
    chatDebug("runtime: dispose", { threadId });
    try {
      chat.stop();
    } catch {
      /* noop */
    }
    runtimesRef.current.delete(threadId);
    setAliveThreadIds((prev) => prev.filter((id) => id !== threadId));
  }, []);

  // Dispose all runtimes on unmount AND when the workspace changes in place.
  // ChatRuntimesProvider isn't keyed by workspaceId in DashboardLayout, so the
  // workspaceId prop can flip without a remount; the effect's cleanup catches
  // both cases. The generation bump invalidates any in-flight hydrate promises.
  useEffect(() => {
    const runtimes = runtimesRef.current;
    const pending = pendingRef.current;
    const generation = generationRef;
    return () => {
      generation.current++;
      runtimes.forEach((chat, threadId) => {
        chatDebug("runtime: dispose (workspace teardown)", { threadId });
        try {
          chat.stop();
        } catch {
          /* noop */
        }
      });
      runtimes.clear();
      pending.clear();
      setAliveThreadIds([]);
    };
  }, [workspaceId]);

  const value = useMemo<ChatRuntimesContextValue>(
    () => ({
      workspaceId,
      ensureRuntime,
      getRuntime,
      disposeRuntime,
      aliveThreadIds,
    }),
    [workspaceId, ensureRuntime, getRuntime, disposeRuntime, aliveThreadIds],
  );

  return (
    <ChatRuntimesContext.Provider value={value}>
      {children}
    </ChatRuntimesContext.Provider>
  );
}

export function useChatRuntimesContext(): ChatRuntimesContextValue {
  const ctx = useContext(ChatRuntimesContext);
  if (!ctx) {
    throw new Error(
      "useChatRuntimesContext must be used inside <ChatRuntimesProvider>",
    );
  }
  return ctx;
}

/**
 * Returns the runtime for `threadId` if it exists in the registry. Re-renders
 * when the registry adds/removes runtimes so callers pick up new instances
 * without an extra subscription layer.
 */
export function useThreadRuntime(
  threadId: string | undefined,
): Chat<ChatMessage> | undefined {
  const { getRuntime, aliveThreadIds } = useChatRuntimesContext();
  if (!threadId || !aliveThreadIds.includes(threadId)) return undefined;
  return getRuntime(threadId);
}

/**
 * Subscribes to a thread's status reactively. Returns "idle" when no runtime
 * exists yet (brand-new thread that hasn't been created or visited).
 */
export function useThreadStatus(
  threadId: string | undefined,
): ThreadStatus {
  const chat = useThreadRuntime(threadId);
  return useSyncExternalStore<ThreadStatus>(
    useCallback(
      (onChange) =>
        chat ? chat["~registerStatusCallback"](onChange) : () => {},
      [chat],
    ),
    () => (chat ? chat.status : "idle"),
    () => "idle",
  );
}
