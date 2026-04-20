"use client";

import {
  AbstractChat,
  DefaultChatTransport,
  type ChatRequestOptions,
  type ChatState,
  type ChatStatus,
} from "ai";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { formatWorkspaceContext, formatSelectedCardsMetadata } from "@/lib/utils/format-workspace-context";
import { useUIStore } from "@/lib/stores/ui-store";
import { useWorkspaceStore } from "@/lib/stores/workspace-store";
import { useWorkspaceContext } from "@/contexts/WorkspaceContext";
import { createPrepareSendMessagesRequest } from "./prepare-send-messages";
import { loadThreadMessages } from "./load-thread-messages";
import type { ChatMessage } from "./types";
import type { Item } from "@/lib/workspace-state/types";

class RuntimeChat extends AbstractChat<ChatMessage> {}

export type ComposerAttachment = {
  id: string;
  file?: File;
  filename: string;
  mediaType: string;
  url?: string;
  isUploading: boolean;
  uploadPromise?: Promise<void>;
};

interface ChatRuntimeContextValue {
  workspaceId: string;
  items: Item[];
  threadId: string | null;
  setThreadId: (threadId: string | null) => void;
  messages: ChatMessage[];
  setMessages: (messages: ChatMessage[]) => void;
  sendMessage: (message?: Parameters<RuntimeChat["sendMessage"]>[0], options?: ChatRequestOptions) => Promise<void>;
  regenerate: RuntimeChat["regenerate"];
  stop: RuntimeChat["stop"];
  status: ChatStatus;
  error?: Error;
  isLoading: boolean;
  refreshMessages: () => Promise<void>;
  refreshMessagesIfSafe: () => Promise<void>;
  refreshThreads: () => Promise<void>;
  input: string;
  setInput: (value: string) => void;
  attachments: ComposerAttachment[];
  setAttachments: React.Dispatch<React.SetStateAction<ComposerAttachment[]>>;
  composerRef: RefObject<HTMLTextAreaElement | null>;
  focusComposer: () => void;
}

const ChatRuntimeContext = createContext<ChatRuntimeContextValue | null>(null);

function snapshotValue<T>(value: T): T {
  if (typeof structuredClone === "function") {
    return structuredClone(value);
  }
  return JSON.parse(JSON.stringify(value)) as T;
}

function useRuntimeChatState(initialMessages: ChatMessage[]) {
  const [, forceUpdate] = useReducer((count) => count + 1, 0);
  const messagesRef = useRef<ChatMessage[]>(initialMessages);
  const statusRef = useRef<ChatStatus>("ready");
  const errorRef = useRef<Error | undefined>(undefined);

  const sync = useCallback(() => {
    forceUpdate();
  }, []);

  const state = useMemo<ChatState<ChatMessage>>(
    () => ({
      get status() {
        return statusRef.current;
      },
      set status(value: ChatStatus) {
        statusRef.current = value;
        sync();
      },
      get error() {
        return errorRef.current;
      },
      set error(value: Error | undefined) {
        errorRef.current = value;
        sync();
      },
      get messages() {
        return messagesRef.current;
      },
      set messages(value: ChatMessage[]) {
        messagesRef.current = value;
        sync();
      },
      pushMessage(message) {
        messagesRef.current = [...messagesRef.current, message];
        sync();
      },
      popMessage() {
        const next = [...messagesRef.current];
        next.pop();
        messagesRef.current = next;
        sync();
      },
      replaceMessage(index, message) {
        const next = [...messagesRef.current];
        next[index] = message;
        messagesRef.current = next;
        sync();
      },
      snapshot(thing) {
        return snapshotValue(thing);
      },
    }),
    [sync],
  );

  return { state, messagesRef, statusRef, errorRef, sync };
}

function updateUrlThread(
  pathname: string,
  searchParams: URLSearchParams,
  router: ReturnType<typeof useRouter>,
  threadId: string | null,
) {
  const nextParams = new URLSearchParams(searchParams.toString());
  if (threadId) {
    nextParams.set("thread", threadId);
  } else {
    nextParams.delete("thread");
  }
  const query = nextParams.toString();
  router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
}

interface ChatRuntimeProviderProps {
  workspaceId: string;
  items: Item[];
  initialThreadId: string | null;
  onReady?: () => void;
  children: ReactNode;
}

export function ChatRuntimeProvider({
  workspaceId,
  items,
  initialThreadId,
  onReady,
  children,
}: ChatRuntimeProviderProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { currentWorkspace } = useWorkspaceContext();
  const composerRef = useRef<HTMLTextAreaElement | null>(null);
  const selectedModelId = useUIStore((state) => state.selectedModelId);
  const memoryEnabled = useUIStore((state) => state.memoryEnabled);
  const activeFolderId = useUIStore((state) => state.activeFolderId);
  const replySelections = useUIStore((state) => state.replySelections);
  const clearReplySelections = useUIStore((state) => state.clearReplySelections);
  const selectedCardIds = useUIStore((state) => [...state.selectedCardIds]);
  const activePdfPageByItemId = useUIStore((state) => state.activePdfPageByItemId);
  const openItems = useUIStore((state) => state.openItems);
  const [threadId, setThreadIdState] = useState<string | null>(initialThreadId);
  const [isLoading, setIsLoading] = useState(Boolean(initialThreadId));
  const [input, setInput] = useState("");
  const [attachments, setAttachments] = useState<ComposerAttachment[]>([]);
  const refreshThreadsRef = useRef<() => Promise<void>>(async () => {});
  const refreshTokenRef = useRef(0);

  useEffect(() => {
    setThreadIdState(initialThreadId);
  }, [initialThreadId]);

  const viewingItemIds = useMemo(() => {
    const ids = new Set<string>();
    if (openItems.primary) ids.add(openItems.primary);
    if (openItems.secondary) ids.add(openItems.secondary);
    return ids;
  }, [openItems.primary, openItems.secondary]);

  const selectedCardsContext = useMemo(() => {
    const selectedItems = items.filter((item) => selectedCardIds.includes(item.id));
    return formatSelectedCardsMetadata(
      selectedItems,
      items,
      activePdfPageByItemId,
      viewingItemIds,
    );
  }, [activePdfPageByItemId, items, selectedCardIds, viewingItemIds]);

  const systemPrompt = useMemo(
    () => formatWorkspaceContext(items, currentWorkspace?.name),
    [currentWorkspace?.name, items],
  );

  const dynamicStateRef = useRef({
    selectedModelId,
    memoryEnabled,
    activeFolderId,
    replySelections,
    selectedCardIds,
    selectedCardsContext,
    systemPrompt,
  });

  useEffect(() => {
    dynamicStateRef.current = {
      selectedModelId,
      memoryEnabled,
      activeFolderId,
      replySelections,
      selectedCardIds,
      selectedCardsContext,
      systemPrompt,
    };
  }, [
    activeFolderId,
    memoryEnabled,
    replySelections,
    selectedCardIds,
    selectedCardsContext,
    selectedModelId,
    systemPrompt,
  ]);

  const setThreadId = useCallback(
    (nextThreadId: string | null) => {
      setThreadIdState(nextThreadId);
      updateUrlThread(pathname, new URLSearchParams(searchParams.toString()), router, nextThreadId);
    },
    [pathname, router, searchParams],
  );

  const ensureThreadRef = useRef<() => Promise<string>>(async () => {
    throw new Error("Chat runtime not initialized");
  });

  const { state, messagesRef, statusRef, errorRef, sync } = useRuntimeChatState([]);

  const handleChatError = useCallback((error: Error) => {
    console.error("[Chat Error]", error);

    const extendedError = error as Error & {
      responseBody?: string;
      data?: { error?: { message?: string } };
    };
    const errorMessage = error.message?.toLowerCase() || "";
    const responseBody = extendedError.responseBody?.toLowerCase() || "";
    const errorData = extendedError.data?.error?.message?.toLowerCase() || "";
    const combinedMessage = `${errorMessage} ${responseBody} ${errorData}`.toLowerCase();

    if (
      combinedMessage.includes("timeout") ||
      combinedMessage.includes("504") ||
      combinedMessage.includes("gateway")
    ) {
      toast.error("Request timed out", {
        description: "The AI is taking too long to respond. Please try again.",
      });
    } else if (
      combinedMessage.includes("network") ||
      combinedMessage.includes("fetch") ||
      combinedMessage.includes("failed to fetch")
    ) {
      toast.error("Connection error", {
        description: "Unable to reach the server. Please check your connection.",
      });
    } else if (
      combinedMessage.includes("500") ||
      combinedMessage.includes("internal server")
    ) {
      toast.error("Server error", {
        description: "Something went wrong on our end. Please try again.",
      });
    } else if (
      combinedMessage.includes("429") ||
      combinedMessage.includes("rate limit")
    ) {
      toast.error("Rate limited", {
        description: "Too many requests. Please wait a moment and try again.",
      });
    } else if (
      combinedMessage.includes("401") ||
      combinedMessage.includes("unauthorized")
    ) {
      toast.error("Authentication error", {
        description: "Your session may have expired. Please refresh the page.",
      });
    } else if (
      combinedMessage.includes("api key not valid") ||
      combinedMessage.includes("api_key_invalid") ||
      combinedMessage.includes("api key not defined") ||
      combinedMessage.includes("api key is not set") ||
      (combinedMessage.includes("api key") &&
        (combinedMessage.includes("not valid") || combinedMessage.includes("invalid")))
    ) {
      toast.error("API key not valid", {
        description:
          "Please check your GOOGLE_GENERATIVE_AI_API_KEY in your environment variables.",
      });
    } else {
      toast.error("Something went wrong", {
        description: error.message || "An unexpected error occurred. Please try again.",
      });
    }
  }, []);

  const chatRef = useRef<RuntimeChat | null>(null);

  if (!chatRef.current) {
    chatRef.current = new RuntimeChat({
      state,
      transport: new DefaultChatTransport<ChatMessage>({
        api: "/api/chat-v2",
        prepareSendMessagesRequest: async (options) => {
          const resolvedThreadId = await ensureThreadRef.current();
          return createPrepareSendMessagesRequest(() => ({
            id: resolvedThreadId,
            workspaceId,
            modelId: dynamicStateRef.current.selectedModelId,
            memoryEnabled: dynamicStateRef.current.memoryEnabled,
            activeFolderId: dynamicStateRef.current.activeFolderId,
            selectedCardsContext: dynamicStateRef.current.selectedCardsContext,
            selectedCardIds: dynamicStateRef.current.selectedCardIds,
            replySelections: dynamicStateRef.current.replySelections,
            system: dynamicStateRef.current.systemPrompt,
          }))( {
            ...options,
            id: resolvedThreadId,
          });
        },
      }),
      onError: handleChatError,
      onFinish: async () => {
        await refreshThreadsRef.current();
      },
    });
  }

  const chat = chatRef.current;

  const refreshMessages = useCallback(async () => {
    const token = ++refreshTokenRef.current;
    const loadingThreadId = threadId;

    if (!loadingThreadId) {
      chat.messages = [];
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    try {
      const loadedMessages = await loadThreadMessages(loadingThreadId);
      if (
        token !== refreshTokenRef.current ||
        loadingThreadId !== threadId ||
        statusRef.current === "streaming" ||
        statusRef.current === "submitted"
      ) {
        return;
      }
      chat.messages = loadedMessages;
    } finally {
      if (token === refreshTokenRef.current) {
        setIsLoading(false);
      }
    }
  }, [chat, threadId, statusRef]);

  const refreshMessagesIfSafe = useCallback(async () => {
    if (statusRef.current === "streaming" || statusRef.current === "submitted") {
      return;
    }
    await refreshMessages();
  }, [refreshMessages, statusRef]);

  useEffect(() => {
    void refreshMessages();
  }, [refreshMessages]);

  useEffect(() => {
    if (!isLoading) {
      onReady?.();
    }
  }, [isLoading, onReady]);

  ensureThreadRef.current = async () => {
    if (threadId) return threadId;

    const response = await fetch("/api/threads", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ workspaceId }),
    });

    if (!response.ok) {
      throw new Error(await response.text());
    }

    const data = (await response.json()) as { id: string };
    setThreadId(data.id);
    return data.id;
  };

  const refreshThreads = useCallback(async () => {
    await fetch(`/api/threads?workspaceId=${workspaceId}`, { cache: "no-store" });
  }, [workspaceId]);

  useEffect(() => {
    refreshThreadsRef.current = refreshThreads;
  }, [refreshThreads]);

  const sendMessage = useCallback<ChatRuntimeContextValue["sendMessage"]>(
    async (message, options) => {
      await chat.sendMessage(message, options);
      clearReplySelections();
      setInput("");
      setAttachments([]);
    },
    [chat, clearReplySelections],
  );

  const focusComposer = useCallback(() => {
    composerRef.current?.focus();
  }, []);

  const value = useMemo<ChatRuntimeContextValue>(
    () => ({
      workspaceId,
      items,
      threadId,
      setThreadId,
      messages: messagesRef.current,
      setMessages: (messages) => {
        chat.messages = messages;
      },
      sendMessage,
      regenerate: chat.regenerate,
      stop: chat.stop,
      status: statusRef.current,
      error: errorRef.current,
      isLoading,
      refreshMessages,
      refreshMessagesIfSafe,
      refreshThreads,
      input,
      setInput,
      attachments,
      setAttachments,
      composerRef,
      focusComposer,
    }),
    [
      attachments,
      chat,
      errorRef,
      focusComposer,
      input,
      isLoading,
      items,
      messagesRef,
      refreshMessages,
      refreshMessagesIfSafe,
      refreshThreads,
      sendMessage,
      setThreadId,
      statusRef,
      threadId,
      workspaceId,
    ],
  );

  useEffect(() => {
    sync();
  }, [attachments, input, sync, threadId]);

  return <ChatRuntimeContext.Provider value={value}>{children}</ChatRuntimeContext.Provider>;
}

export function useChatRuntime() {
  const context = useContext(ChatRuntimeContext);
  if (!context) {
    throw new Error("useChatRuntime must be used inside ChatRuntimeProvider");
  }
  return context;
}
