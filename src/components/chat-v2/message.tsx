"use client";

import { BotIcon } from "lucide-react";
import type { ChatMessage } from "@/lib/chat-v2/types";
import { sanitizeText } from "@/lib/chat-v2/utils";
import {
  Message,
  MessageContent,
  MessageResponse,
} from "@/components/ai-elements-v2/message";
import { Shimmer } from "@/components/ai-elements-v2/shimmer";
import { cn } from "@/lib/utils";
import { MessageActions } from "./message-actions";
import { MessageReasoning } from "./message-reasoning";

export function PreviewMessage({
  message,
  isLoading,
}: {
  message: ChatMessage;
  isLoading: boolean;
}) {
  const isUser = message.role === "user";
  const isAssistant = message.role === "assistant";

  const mergedReasoning =
    message.parts?.reduce(
      (acc, part) => {
        if (part.type === "reasoning" && part.text?.trim().length > 0) {
          return {
            text: acc.text ? `${acc.text}\n\n${part.text}` : part.text,
            isStreaming: acc.isStreaming || ("state" in part ? part.state === "streaming" : false),
            rendered: false,
          };
        }
        return acc;
      },
      { text: "", isStreaming: false, rendered: false },
    ) ?? { text: "", isStreaming: false, rendered: false };

  const hasAnyContent = message.parts?.some(
    (part) =>
      (part.type === "text" && part.text?.trim().length > 0) ||
      (part.type === "reasoning" && "text" in part && part.text?.trim().length > 0),
  );

  const isThinking = isAssistant && isLoading && !hasAnyContent;

  return (
    <div
      className={cn(
        "group/message w-full",
        !isAssistant && "animate-[fade-up_0.25s_cubic-bezier(0.22,1,0.36,1)]",
      )}
      data-role={message.role}
      data-testid={`message-${message.role}`}
    >
      <div className={cn(isUser ? "flex flex-col items-end gap-2" : "flex items-start gap-3")}>
        {isAssistant && (
          <div className="flex h-[calc(13px*1.65)] shrink-0 items-center">
            <div className="flex size-7 items-center justify-center rounded-lg bg-muted/60 text-muted-foreground ring-1 ring-border/50">
              <BotIcon className="size-4" />
            </div>
          </div>
        )}

        {isAssistant ? (
          <div className="flex min-w-0 flex-1 flex-col gap-2">
            {isThinking ? (
              <div className="flex h-[calc(13px*1.65)] items-center text-[13px] leading-[1.65]">
                <Shimmer className="font-medium" duration={1}>
                  Thinking...
                </Shimmer>
              </div>
            ) : (
              <>
                {message.parts?.map((part, index) => {
                  const key = `message-${message.id}-part-${index}`;

                  if (part.type === "reasoning") {
                    if (!mergedReasoning.rendered && mergedReasoning.text) {
                      mergedReasoning.rendered = true;
                      return (
                        <MessageReasoning
                          isLoading={isLoading || mergedReasoning.isStreaming}
                          key={key}
                          reasoning={mergedReasoning.text}
                        />
                      );
                    }
                    return null;
                  }

                  if (part.type !== "text") {
                    return null;
                  }

                  return (
                    <MessageContent className="text-[13px] leading-[1.65]" data-testid="message-content" key={key}>
                      <MessageResponse>{sanitizeText(part.text)}</MessageResponse>
                    </MessageContent>
                  );
                })}
                <MessageActions isLoading={isLoading} message={message} />
              </>
            )}
          </div>
        ) : (
          <Message from={message.role}>
            {message.parts?.map((part, index) => {
              if (part.type !== "text") {
                return null;
              }

              return (
                <MessageContent
                  className="w-fit max-w-[min(80%,56ch)] overflow-hidden break-words rounded-2xl rounded-br-lg border border-border/30 bg-gradient-to-br from-secondary to-muted px-3.5 py-2 text-[13px] leading-[1.65] shadow-[var(--shadow-card)]"
                  data-testid="message-content"
                  key={`user-${message.id}-${index}`}
                >
                  <MessageResponse>{sanitizeText(part.text)}</MessageResponse>
                </MessageContent>
              );
            })}
          </Message>
        )}
      </div>
    </div>
  );
}

export function ThinkingMessage() {
  return (
    <div className="group/message w-full" data-role="assistant" data-testid="message-assistant-loading">
      <div className="flex items-start gap-3">
        <div className="flex h-[calc(13px*1.65)] shrink-0 items-center">
          <div className="flex size-7 items-center justify-center rounded-lg bg-muted/60 text-muted-foreground ring-1 ring-border/50">
            <BotIcon className="size-4" />
          </div>
        </div>

        <div className="flex h-[calc(13px*1.65)] items-center text-[13px] leading-[1.65]">
          <Shimmer className="font-medium" duration={1}>
            Thinking...
          </Shimmer>
        </div>
      </div>
    </div>
  );
}
