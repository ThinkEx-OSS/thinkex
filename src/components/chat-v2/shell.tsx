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
    <div className="flex h-dvh w-full flex-col overflow-hidden bg-background">
      <header className="border-b border-border/50 bg-background/90 px-4 py-3 backdrop-blur md:px-6">
        <div className="mx-auto flex w-full max-w-4xl items-center justify-between">
          <div>
            <div className="font-semibold text-sm text-foreground">ThinkEx</div>
            <div className="text-muted-foreground text-xs">Chat v2</div>
          </div>
        </div>
      </header>

      <Messages chatId={chatId} isLoading={isLoading} isReadonly={isReadonly} messages={messages} status={status} />

      <div className="border-t border-border/50 bg-background/95 px-2 py-3 backdrop-blur md:px-4 md:py-4">
        {!isReadonly && (
          <MultimodalInput
            input={input}
            isReadonly={isReadonly}
            sendMessage={sendMessage}
            setInput={setInput}
            status={status}
            stop={stop}
          />
        )}
      </div>
    </div>
  );
}
