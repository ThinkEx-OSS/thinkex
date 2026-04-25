"use client";

import { CheckIcon, CopyIcon, RefreshCwIcon } from "lucide-react";
import {
  memo,
  useCallback,
  useMemo,
  useRef,
  useState,
  type FC,
} from "react";

import { AssistantLoader } from "@/components/chat/AssistantLoader";
import { useChatContext } from "@/components/chat/ChatProvider";
import { MessagePart } from "@/components/chat/parts/MessagePart";
import { TooltipIconButton } from "@/components/chat/tooltip-icon-button";
import type { ChatMessage } from "@/lib/chat/types";

interface AssistantMessageProps {
  message: ChatMessage;
  isLastAssistant: boolean;
  isStreaming: boolean;
}

const AssistantMessageImpl: FC<AssistantMessageProps> = ({
  message,
  isLastAssistant,
  isStreaming,
}) => {
  const { regenerate, status } = useChatContext();
  const [copied, setCopied] = useState(false);
  const copyTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const textContent = useMemo(() => {
    return message.parts
      .filter(
        (p): p is { type: "text"; text: string } =>
          p.type === "text" &&
          typeof (p as { text?: string }).text === "string",
      )
      .map((p) => p.text)
      .join("\n\n");
  }, [message.parts]);

  const handleCopy = useCallback(() => {
    if (!textContent) return;
    navigator.clipboard.writeText(textContent);
    setCopied(true);
    if (copyTimeoutRef.current) clearTimeout(copyTimeoutRef.current);
    copyTimeoutRef.current = setTimeout(() => setCopied(false), 2000);
  }, [textContent]);

  const isRunning = status === "streaming" || status === "submitted";

  return (
    <div
      className="group/message relative mx-auto w-full max-w-[var(--thread-max-width)] pb-4"
      data-role="assistant"
    >
      {/*
        `data-assistant-content` is the selector the Ask AI selection
        toolbar (`AssistantThreadSelection`) uses to restrict selections to
        assistant-body text only. Don't drop it without updating that
        selector too.
      */}
      <div
        data-assistant-content
        className="mx-2 leading-7 break-words text-foreground"
      >
        <AssistantLoader
          message={message}
          isLastAssistant={isLastAssistant}
          isStreaming={isStreaming}
        />
        {message.parts.map((part, i) => (
          <MessagePart
            key={`${message.id}-${i}`}
            part={part}
            partIndex={i}
            totalParts={message.parts.length}
            message={message}
            isStreaming={isStreaming}
            messageKey={`${message.id}-${i}`}
          />
        ))}
      </div>

      {!isStreaming && (
        <div
          className={`mt-2 ml-2 flex gap-0.5 text-muted-foreground transition-opacity ${
            isLastAssistant
              ? "opacity-100"
              : "opacity-0 group-hover/message:opacity-100"
          }`}
        >
          <TooltipIconButton tooltip="Copy" onClick={handleCopy}>
            {copied ? <CheckIcon /> : <CopyIcon />}
          </TooltipIconButton>
          {isLastAssistant && (
            <TooltipIconButton
              tooltip="Refresh"
              disabled={isRunning}
              onClick={() => void regenerate({ messageId: message.id })}
            >
              <RefreshCwIcon />
            </TooltipIconButton>
          )}
        </div>
      )}
    </div>
  );
};

export const AssistantMessage = memo(AssistantMessageImpl);
