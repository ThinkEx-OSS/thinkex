import type { UseChatHelpers } from "@ai-sdk/react";
import { useEffect, useState } from "react";
import type { ChatMessage } from "@/lib/chat-v2/types";
import { useScrollToBottom } from "./use-scroll-to-bottom";

export function useMessages({
  status,
}: {
  status: UseChatHelpers<ChatMessage>["status"];
}) {
  const {
    containerRef,
    endRef,
    isAtBottom,
    scrollToBottom,
    onViewportEnter,
    onViewportLeave,
    reset,
  } = useScrollToBottom();

  const [hasSentMessage, setHasSentMessage] = useState(false);

  useEffect(() => {
    if (status === "submitted") {
      setHasSentMessage(true);
    }
  }, [status]);

  return {
    containerRef,
    endRef,
    isAtBottom,
    scrollToBottom,
    onViewportEnter,
    onViewportLeave,
    hasSentMessage,
    reset,
  };
}
