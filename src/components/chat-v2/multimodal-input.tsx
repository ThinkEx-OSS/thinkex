"use client";

import type { Dispatch, SetStateAction } from "react";
import { useCallback, useEffect, useRef } from "react";
import { ArrowUpIcon, SquareIcon } from "lucide-react";
import type { UseChatHelpers } from "@ai-sdk/react";
import {
  PromptInput,
  PromptInputActions,
  PromptInputFooter,
  PromptInputSubmit,
  PromptInputTextarea,
} from "@/components/ai-elements-v2/prompt-input";
import { Button } from "@/components/ui/button";
import type { ChatMessage } from "@/lib/chat-v2/types";

export function MultimodalInput({
  input,
  setInput,
  status,
  stop,
  sendMessage,
  isReadonly,
}: {
  input: string;
  setInput: Dispatch<SetStateAction<string>>;
  status: UseChatHelpers<ChatMessage>["status"];
  stop: () => void;
  sendMessage: UseChatHelpers<ChatMessage>["sendMessage"];
  isReadonly: boolean;
}) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const trimmedInput = input.trim();
  const isStreaming = status === "submitted" || status === "streaming";

  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) {
      return;
    }

    textarea.style.height = "0px";
    textarea.style.height = `${Math.min(textarea.scrollHeight, 240)}px`;
  }, [input]);

  const submit = useCallback(() => {
    if (!trimmedInput || isStreaming || isReadonly) {
      return;
    }

    sendMessage({
      role: "user",
      parts: [{ type: "text", text: trimmedInput }],
    });
    setInput("");
  },
    [trimmedInput, isStreaming, isReadonly, sendMessage, setInput],
  );

  return (
    <PromptInput
      className="mx-auto w-full max-w-4xl"
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
    >
      <PromptInputTextarea
        autoComplete="off"
        autoFocus
        disabled={isReadonly}
        onChange={(event) => setInput(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter" && !event.shiftKey) {
            event.preventDefault();
            submit();
          }
        }}
        placeholder="Send a message..."
        ref={textareaRef}
        rows={1}
        value={input}
      />

      <PromptInputFooter>
        <div className="text-muted-foreground text-xs">ThinkEx</div>
        <PromptInputActions>
          {isStreaming ? (
            <Button onClick={stop} size="icon" type="button" variant="outline">
              <SquareIcon className="size-4 fill-current" />
            </Button>
          ) : (
            <PromptInputSubmit disabled={!trimmedInput || isReadonly}>
              <ArrowUpIcon className="size-4" />
            </PromptInputSubmit>
          )}
        </PromptInputActions>
      </PromptInputFooter>
    </PromptInput>
  );
}
