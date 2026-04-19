"use client";

import { useEffect, useRef } from "react";
import { useActiveChat } from "@/hooks/chat-v2/use-active-chat";
import { Messages } from "./messages";
import { MultimodalInput } from "./multimodal-input";

export function ChatShell() {
  const { chatId, messages, sendMessage, status, stop, input, setInput, isReadonly, isLoading } =
    useActiveChat();

  const stopRef = useRef(stop);
  stopRef.current = stop;

  const prevChatIdRef = useRef(chatId);
  useEffect(() => {
    if (prevChatIdRef.current !== chatId) {
      prevChatIdRef.current = chatId;
      stopRef.current();
      setInput("");
    }
  }, [chatId, setInput]);

  return (
    <div
      className="flex h-dvh w-full flex-col overflow-hidden bg-background"
      style={{ ["--thread-max-width" as string]: "50rem" }}
    >
      <Messages
        chatId={chatId}
        isLoading={isLoading}
        isReadonly={isReadonly}
        messages={messages}
        status={status}
      />

      {!isReadonly && (
        <div className="mx-auto flex w-full max-w-[var(--thread-max-width)] flex-shrink-0 flex-col gap-4 overflow-visible rounded-t-3xl bg-sidebar px-4 pb-3 md:pb-4">
          <MultimodalInput
            input={input}
            isReadonly={isReadonly}
            sendMessage={sendMessage}
            setInput={setInput}
            status={status}
            stop={stop}
          />
        </div>
      )}
    </div>
  );
}
