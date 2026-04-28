"use client";

import {
  useCallback,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type RefObject,
} from "react";
import type { VListHandle } from "virtua";

import { THREAD_SCROLL_PIN_OFFSET } from "@/components/chat/thread-layout";
import {
  isRunningThreadStatus,
  type ActiveChatStatus,
} from "@/lib/chat/thread-runtime-state";
import type { ChatMessage } from "@/lib/chat/types";

type ThreadViewportAction = "snap-to-bottom" | "pin-last-user";

interface ResolveThreadViewportActionOptions {
  phase: "thread-open" | "status-change";
  previousStatus: ActiveChatStatus | null;
  status: ActiveChatStatus;
  tailRole: ChatMessage["role"] | null;
}

export function resolveThreadViewportAction({
  phase,
  previousStatus,
  status,
  tailRole,
}: ResolveThreadViewportActionOptions): ThreadViewportAction | null {
  const userTailWhileRunning =
    tailRole === "user" && isRunningThreadStatus(status);

  if (phase === "thread-open") {
    return userTailWhileRunning ? "pin-last-user" : "snap-to-bottom";
  }

  const turnStarted =
    previousStatus === "ready" && isRunningThreadStatus(status);

  return turnStarted ? "pin-last-user" : null;
}

interface UseThreadViewportControllerOptions {
  messages: ChatMessage[];
  status: ActiveChatStatus;
  lastUserMessageId: string | null;
}

interface UseThreadViewportControllerResult {
  viewportRef: RefObject<HTMLDivElement | null>;
  listRef: RefObject<VListHandle | null>;
  reservedTail: number;
  measurePinnedUser: (messageId: string, height: number) => void;
}

export function useThreadViewportController({
  messages,
  status,
  lastUserMessageId,
}: UseThreadViewportControllerOptions): UseThreadViewportControllerResult {
  const viewportRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<VListHandle>(null);
  const previousStatusRef = useRef<ActiveChatStatus | null>(null);

  const [viewportHeight, setViewportHeight] = useState(0);
  useLayoutEffect(() => {
    const element = viewportRef.current;
    if (!element) return;

    setViewportHeight(element.clientHeight);
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      setViewportHeight(entry.contentRect.height);
    });

    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const [lastMeasuredUser, setLastMeasuredUser] = useState<{
    messageId: string | null;
    height: number;
  }>({
    messageId: null,
    height: 0,
  });

  const measurePinnedUser = useCallback((messageId: string, height: number) => {
    setLastMeasuredUser((previous) => {
      if (previous.messageId === messageId && previous.height === height) {
        return previous;
      }
      return { messageId, height };
    });
  }, []);

  const lastUserHeight =
    lastMeasuredUser.messageId === lastUserMessageId
      ? lastMeasuredUser.height
      : 0;

  const reservedTail = useMemo(
    () => Math.max(0, viewportHeight - lastUserHeight),
    [lastUserHeight, viewportHeight],
  );

  useLayoutEffect(() => {
    const previousStatus = previousStatusRef.current;
    const lastMessageIndex = messages.length - 1;
    const list = listRef.current;
    if (lastMessageIndex < 0 || !list) return;
    if (previousStatus == null && viewportHeight === 0) return;

    const action = resolveThreadViewportAction({
      phase: previousStatus == null ? "thread-open" : "status-change",
      previousStatus,
      status,
      tailRole: messages[lastMessageIndex]?.role ?? null,
    });

    previousStatusRef.current = status;

    if (!action) return;

    const runScroll = () => {
      if (action === "pin-last-user") {
        list.scrollToIndex(lastMessageIndex, {
          smooth: true,
          align: "start",
          offset: -THREAD_SCROLL_PIN_OFFSET,
        });
        return;
      }

      list.scrollToIndex(lastMessageIndex, { align: "end" });
    };

    let innerFrameId: number | null = null;
    const outerFrameId = requestAnimationFrame(() => {
      if (previousStatus == null) {
        innerFrameId = requestAnimationFrame(runScroll);
        return;
      }
      runScroll();
    });

    return () => {
      cancelAnimationFrame(outerFrameId);
      if (innerFrameId !== null) {
        cancelAnimationFrame(innerFrameId);
      }
    };
  }, [messages, status, viewportHeight]);

  return {
    viewportRef,
    listRef,
    reservedTail,
    measurePinnedUser,
  };
}
