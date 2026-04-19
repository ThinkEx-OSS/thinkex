"use client";

import type { ChatMessage } from "@/lib/chat-v2/types";
import { sanitizeText } from "@/lib/chat-v2/utils";
import {
  Message,
  MessageContent,
} from "@/components/ai-elements-v2/message";
import { Shimmer } from "@/components/ai-elements-v2/shimmer";
import { StreamdownMarkdown } from "@/components/ui/streamdown-markdown";
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
      <div className={cn(isUser ? "flex flex-col items-end gap-2" : "flex w-full flex-col gap-2")}>
        {isAssistant ? (
          <div className="flex min-w-0 flex-1 flex-col gap-2">
            {isThinking ? (
              <div className="flex items-center text-sm leading-6">
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
                      <StreamdownMarkdown>{sanitizeText(part.text)}</StreamdownMarkdown>
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
                  className="w-fit max-w-[85%] overflow-hidden break-words rounded-lg bg-muted px-3 py-2 text-sm text-foreground"
                  data-testid="message-content"
                  key={`user-${message.id}-${index}`}
                >
                  <StreamdownMarkdown>{sanitizeText(part.text)}</StreamdownMarkdown>
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
      <div className="flex items-center">
        <div className="flex items-center text-sm leading-6">
          <Shimmer className="font-medium" duration={1}>
            Thinking...
          </Shimmer>
        </div>
      </div>
    </div>
  );
}
