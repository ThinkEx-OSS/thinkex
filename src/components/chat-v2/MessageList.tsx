"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { VList, type VListHandle } from "virtua";
import type { ChatStatus } from "ai";
import type { ChatMessage } from "@/lib/chat-v2/types";
import { AssistantMessage } from "./AssistantMessage";
import { UserMessage } from "./UserMessage";

interface MessageListProps {
  threadId?: string | null;
  messages: ChatMessage[];
  status: ChatStatus;
  isLoading: boolean;
  onReloadThread: () => Promise<void>;
  onRegenerate: (messageId: string) => Promise<void>;
}

function LastUserMeasurer({
  children,
  onMeasure,
}: {
  children: ReactNode;
  onMeasure: (height: number) => void;
}) {
  const ref = useRef<HTMLDivElement | null>(null);

  useLayoutEffect(() => {
    if (!ref.current) return;

    const measure = () => {
      if (ref.current) {
        onMeasure(ref.current.getBoundingClientRect().height);
      }
    };

    measure();

    const resizeObserver = new ResizeObserver(measure);
    resizeObserver.observe(ref.current);

    return () => resizeObserver.disconnect();
  }, [onMeasure]);

  return <div ref={ref}>{children}</div>;
}

function ThinkingMessage() {
  return (
    <div className="mx-auto w-full max-w-[50rem] px-2 pb-4">
      <div className="chat-v2-assistant-message-content mx-2 flex items-center gap-2 leading-7 break-words text-muted-foreground">
        <div className="size-2 animate-pulse rounded-full bg-current" />
        <span className="text-sm">Thinking…</span>
      </div>
    </div>
  );
}

export function MessageList({ threadId, messages, status, isLoading, onReloadThread, onRegenerate }: MessageListProps) {
  const ref = useRef<VListHandle>(null);
  const [lastUserSize, setLastUserSize] = useState(0);
  const [blankSize, setBlankSize] = useState(0);
  const prevStatusRef = useRef(status);
  const handleMeasure = useCallback((height: number) => {
    setLastUserSize(height);
  }, []);

  useEffect(() => {
    const wasIdle = prevStatusRef.current === "ready" || prevStatusRef.current === "error";
    const isNowRunning = status === "submitted" || status === "streaming";
    if (wasIdle && isNowRunning && ref.current) {
      const handle = ref.current;
      setBlankSize(handle.viewportSize);
      const targetIndex = messages.length - 1;
      requestAnimationFrame(() => {
        handle.scrollToIndex(targetIndex, { smooth: true, align: "start" });
      });
    }
    if ((status === "ready" || status === "error") && prevStatusRef.current !== status) {
      setBlankSize(0);
    }
    prevStatusRef.current = status;
  }, [messages.length, status]);

  if (isLoading) {
    return <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">Loading chat…</div>;
  }

  if (messages.length === 0) {
    return <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">Start a conversation.</div>;
  }

  return (
    <div className="chat-v2-thread-viewport flex min-h-0 flex-1 overflow-hidden px-4">
      <VList ref={ref} style={{ flex: 1 }}>
        {messages.map((message, index) => {
          const isLast = index === messages.length - 1;
          const isSecondToLast = index === messages.length - 2;

          if (message.role === "assistant") {
            return (
              <AssistantMessage
                key={message.id}
                threadId={threadId}
                message={message}
                isStreaming={isLast && (status === "submitted" || status === "streaming")}
                blankSize={isLast ? Math.max(0, blankSize - lastUserSize) : undefined}
                onRefresh={onRegenerate}
                onReloadThread={onReloadThread}
              />
            );
          }

          if (isSecondToLast) {
            return (
              <LastUserMeasurer key={message.id} onMeasure={handleMeasure}>
                <UserMessage threadId={threadId} message={message} onReloadThread={onReloadThread} onRegenerate={onRegenerate} />
              </LastUserMeasurer>
            );
          }

          return (
            <div key={message.id}>
              <UserMessage threadId={threadId} message={message} onReloadThread={onReloadThread} onRegenerate={onRegenerate} />
            </div>
          );
        })}
        {status === "submitted" && messages.at(-1)?.role !== "assistant" ? (
          <ThinkingMessage key="thinking-message" />
        ) : null}
      </VList>
    </div>
  );
}
