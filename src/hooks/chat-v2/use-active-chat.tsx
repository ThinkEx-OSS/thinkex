"use client";

import type { UseChatHelpers } from "@ai-sdk/react";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { usePathname } from "next/navigation";
import {
  createContext,
  type Dispatch,
  type ReactNode,
  type SetStateAction,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import useSWR from "swr";
import { toast } from "sonner";
import { useDataStream } from "@/components/chat-v2/data-stream-provider";
import type { ChatMessage } from "@/lib/chat-v2/types";
import { useUIStore } from "@/lib/stores/ui-store";
import { fetcher, fetchWithErrorHandlers } from "@/lib/chat-v2/utils";

type ActiveChatContextValue = {
  chatId: string;
  messages: ChatMessage[];
  setMessages: UseChatHelpers<ChatMessage>["setMessages"];
  sendMessage: UseChatHelpers<ChatMessage>["sendMessage"];
  status: UseChatHelpers<ChatMessage>["status"];
  stop: UseChatHelpers<ChatMessage>["stop"];
  input: string;
  setInput: Dispatch<SetStateAction<string>>;
  isReadonly: boolean;
  isLoading: boolean;
};

const ActiveChatContext = createContext<ActiveChatContextValue | null>(null);

function extractChatId(pathname: string): string | null {
  const match = pathname.match(/\/chat-v2\/([^/]+)/);
  return match ? match[1] : null;
}

export function ActiveChatProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { setDataStream } = useDataStream();
  const [input, setInput] = useState("");

  const chatIdFromUrl = extractChatId(pathname);
  const fallbackChatIdRef = useRef(crypto.randomUUID());
  const chatId = chatIdFromUrl ?? fallbackChatIdRef.current;

  const selectedModelId = useUIStore((s) => s.selectedModelId);
  const memoryEnabled = useUIStore((s) => s.memoryEnabled);
  const activeFolderId = useUIStore((s) => s.activeFolderId);

  const chatApiPayloadRef = useRef({ selectedModelId, memoryEnabled, activeFolderId });
  chatApiPayloadRef.current.selectedModelId = selectedModelId;
  chatApiPayloadRef.current.memoryEnabled = memoryEnabled;
  chatApiPayloadRef.current.activeFolderId = activeFolderId;

  const { data: chatData, isLoading } = useSWR<{ messages: ChatMessage[]; isReadonly: boolean }>(
    `${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}/api/chat-v2/messages?chatId=${chatId}`,
    fetcher,
    { revalidateOnFocus: false },
  );

  const initialMessages = useMemo<ChatMessage[]>(
    () => chatData?.messages ?? [],
    [chatData?.messages],
  );

  const { messages, setMessages, sendMessage, status, stop } = useChat<ChatMessage>({
    id: chatId,
    messages: initialMessages,
    generateId: () => crypto.randomUUID(),
    transport: new DefaultChatTransport({
      api: `${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}/api/chat-v2`,
      fetch: fetchWithErrorHandlers,
      prepareSendMessagesRequest(request) {
        const lastMessage = request.messages.at(-1);
        const payload = chatApiPayloadRef.current;

        return {
          body: {
            id: request.id,
            message: lastMessage,
            modelId: payload.selectedModelId,
            memoryEnabled: payload.memoryEnabled,
            activeFolderId: payload.activeFolderId ?? undefined,
          },
        };
      },
    }),
    onData: (dataPart) => {
      setDataStream((current) => [...current, dataPart]);
    },
    onError: (error) => {
      toast.error(error.message || "Oops, an error occurred!");
    },
  });

  useEffect(() => {
    setDataStream([]);
  }, [chatId, setDataStream]);

  useEffect(() => {
    setMessages(initialMessages);
  }, [initialMessages, setMessages]);

  const value = useMemo<ActiveChatContextValue>(
    () => ({
      chatId,
      messages,
      setMessages,
      sendMessage,
      status,
      stop,
      input,
      setInput,
      isReadonly: chatData?.isReadonly ?? false,
      isLoading,
    }),
    [chatId, messages, setMessages, sendMessage, status, stop, input, chatData?.isReadonly, isLoading],
  );

  return <ActiveChatContext.Provider value={value}>{children}</ActiveChatContext.Provider>;
}

export function useActiveChat() {
  const context = useContext(ActiveChatContext);

  if (!context) {
    throw new Error("useActiveChat must be used within an ActiveChatProvider");
  }

  return context;
}
