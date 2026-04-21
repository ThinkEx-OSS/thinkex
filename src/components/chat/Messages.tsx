"use client";

import {
  memo,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { VList, type VListHandle } from "virtua";

import { AssistantMessage } from "@/components/chat/AssistantMessage";
import { useChatContext } from "@/components/chat/ChatProvider";
import { PendingAssistantLoader } from "@/components/chat/AssistantLoader";
import { UserMessage } from "@/components/chat/UserMessage";
import {
  chatDebug,
  chatWarn,
  summarizeRoster,
} from "@/lib/chat/debug";
import type { ChatMessage } from "@/lib/chat/types";

/** Breathing room above the pinned user message when a new turn starts. */
const TOP_OFFSET = 32;

/**
 * Virtualized message list with pin-to-top autoscroll. Assumes the thread
 * has at least one message — `<ThreadBody>` routes loading/empty states to
 * their own trees so this component can assume a stable DOM on mount.
 *
 * Chatbot scroll pattern (ChatGPT / Claude.ai / Virtua example):
 *
 * 1. Measure the most recent user message's rendered height (`lastUserSize`)
 *    and the viewport height (`reservedMinHeight`).
 *
 * 2. The last row carries a spacer sized to fill the viewport below the
 *    pinned user message: `reservedTail = viewportH − lastUserH`. Scroll
 *    content therefore ends exactly at viewport-bottom when the user row is
 *    aligned to the top — no overshoot, no undershoot.
 *
 * 3. On every new turn (status: ready → submitted) we call
 *    `scrollToIndex(lastMessageIndex, { align: "start" })` which pins the
 *    just-sent user message flush to the top of the viewport.
 *
 * 4. As the assistant streams, its row grows past the spacer naturally —
 *    `min-height` is a floor, not a ceiling.
 *
 * 5. After the turn ends, the spacer persists on the (now) last assistant
 *    row. The next turn repeats the cycle.
 */
const MessagesImpl = () => {
  const { messages, status } = useChatContext();
  const isStreaming = status === "streaming" || status === "submitted";

  // [chat-debug] Log a roster snapshot whenever the message list changes
  // (length OR identity), so we can confirm what useChat is handing the
  // renderer. Critically, surface assistants with `partCount=0` as warnings
  // — that's the symptom of the "empty assistants on reload" bug.
  useEffect(() => {
    const roster = summarizeRoster(messages as unknown[]);
    chatDebug("Messages render", { status, ...roster });
    if (roster.emptyAssistants.length > 0) {
      chatWarn("Messages render: assistant rows have empty parts", {
        status,
        emptyAssistants: roster.emptyAssistants,
      });
    }
  }, [messages, status]);

  const lastAssistantIndex = useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].role === "assistant") return i;
    }
    return -1;
  }, [messages]);

  const lastUserIndex = useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].role === "user") return i;
    }
    return -1;
  }, [messages]);

  // Between `sendMessage` and the first streamed chunk, useChat has not yet
  // materialized an assistant message. We still want a "Thinking…" slot at
  // the bottom holding the spacer, so emit a synthetic trailing row.
  const showPendingLoader =
    isStreaming &&
    messages.length > 0 &&
    messages[messages.length - 1].role === "user";

  // Measure the scroll viewport so we know how tall the spacer should be.
  // Kept in sync via a ResizeObserver so the reservation adapts when the
  // panel is maximized/minimized.
  const containerRef = useRef<HTMLDivElement>(null);
  const [reservedMinHeight, setReservedMinHeight] = useState(0);
  useLayoutEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    setReservedMinHeight(el.clientHeight);
    const ro = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      setReservedMinHeight(entry.contentRect.height);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Track the height of the most-recent user message so we can size the
  // trailing spacer correctly. The UserRow calls `onMeasure` when it's the
  // pin target (i.e. the last user message in the list).
  const [lastUserSize, setLastUserSize] = useState(0);
  // Reset when the pin target changes so we don't carry stale measurements
  // from the previous turn while the new row is mounting.
  useEffect(() => {
    setLastUserSize(0);
  }, [lastUserIndex]);

  const reservedTail = Math.max(0, reservedMinHeight - lastUserSize);

  const vlistRef = useRef<VListHandle>(null);

  // Pin the newest message just below the top of the viewport on every new
  // turn — fire exactly once per `ready → submitted` transition. `status`
  // going back to `ready` rearms for the next turn.
  const prevStatusRef = useRef(status);
  useLayoutEffect(() => {
    const prev = prevStatusRef.current;
    prevStatusRef.current = status;
    const turnStarted =
      prev === "ready" && (status === "submitted" || status === "streaming");
    if (!turnStarted) return;
    const lastMessageIndex = messages.length - 1;
    if (lastMessageIndex < 0) return;
    const handle = vlistRef.current;
    if (!handle) return;
    requestAnimationFrame(() => {
      handle.scrollToIndex(lastMessageIndex, {
        smooth: true,
        align: "start",
        offset: -TOP_OFFSET,  // Negative offset = scroll LESS → leaves TOP_OFFSET px of space above the pinned message
      });
    });
  }, [status, messages.length]);

  // Whichever row ends up at the tail gets the spacer. When the pending
  // loader is present it's the tail; otherwise the last real message is.
  const lastMessageIndex = messages.length - 1;
  const spacerTarget: "loader" | "message" = showPendingLoader
    ? "loader"
    : "message";

  const rows: ReactNode[] = [];
  messages.forEach((message, idx) => {
    const isLastMessage = idx === lastMessageIndex;
    const isLastAssistant =
      message.role === "assistant" && idx === lastAssistantIndex;
    const minHeight =
      spacerTarget === "message" && isLastMessage ? reservedTail : undefined;

    if (message.role === "user") {
      rows.push(
        <UserRow
          key={message.id}
          message={message}
          isAssistantStreaming={isStreaming}
          minHeight={minHeight}
          onMeasure={idx === lastUserIndex ? setLastUserSize : undefined}
        />,
      );
      return;
    }

    if (message.role === "assistant") {
      rows.push(
        <AssistantRow
          key={message.id}
          message={message}
          isLastAssistant={isLastAssistant}
          isStreaming={isStreaming && isLastAssistant}
          minHeight={minHeight}
        />,
      );
      return;
    }
  });

  if (showPendingLoader) {
    rows.push(
      <PendingLoaderRow
        key="__pending_loader__"
        minHeight={reservedTail}
      />,
    );
  }

  return (
    <div ref={containerRef} className="h-full">
      <VList
        ref={vlistRef}
        style={{ height: "100%" }}
        className="overflow-x-hidden px-3 sm:px-6"
      >
        {rows}
      </VList>
    </div>
  );
};

export const Messages = memo(MessagesImpl);

/* -------------------------------------------------------------------------- */
/*                             Row wrappers                                    */
/* -------------------------------------------------------------------------- */

interface RowWrapperProps {
  children: ReactNode;
  minHeight?: number;
  measureRef?: React.Ref<HTMLDivElement>;
}

function RowWrapper({ children, minHeight, measureRef }: RowWrapperProps) {
  const style = useMemo(
    () => (minHeight != null ? { minHeight } : undefined),
    [minHeight],
  );

  // Full-width, unconstrained wrapper. The inner message components already
  // apply `mx-auto max-w-[var(--thread-max-width)]`, so adding a second
  // max-width here would double-shrink the column.
  return (
    <div
      ref={measureRef}
      className="w-full [--thread-max-width:46rem]"
      style={style}
    >
      {children}
    </div>
  );
}

interface UserRowProps {
  message: ChatMessage;
  isAssistantStreaming: boolean;
  minHeight?: number;
  /**
   * Called with the row's current rendered height. Only provided for the
   * pin-target user row so we know how much tail space to reserve.
   */
  onMeasure?: (height: number) => void;
}

const UserRow = memo(function UserRow({
  message,
  isAssistantStreaming,
  minHeight,
  onMeasure,
}: UserRowProps) {
  const rowRef = useRef<HTMLDivElement | null>(null);

  // Attach a ResizeObserver when `onMeasure` is provided. Reports the row's
  // real height back to <Messages> so reservedTail is accurate.
  useLayoutEffect(() => {
    if (!onMeasure) return;
    const el = rowRef.current;
    if (!el) return;
    onMeasure(el.getBoundingClientRect().height);
    const ro = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      onMeasure(entry.contentRect.height);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [onMeasure]);

  const setMeasureRef = useCallback((node: HTMLDivElement | null) => {
    rowRef.current = node;
  }, []);

  return (
    <RowWrapper
      minHeight={minHeight}
      measureRef={onMeasure ? setMeasureRef : undefined}
    >
      <div className="group/message contents">
        <UserMessage
          message={message}
          isAssistantStreaming={isAssistantStreaming}
        />
      </div>
    </RowWrapper>
  );
});

interface AssistantRowProps {
  message: ChatMessage;
  isLastAssistant: boolean;
  isStreaming: boolean;
  minHeight?: number;
}

const AssistantRow = memo(function AssistantRow({
  message,
  isLastAssistant,
  isStreaming,
  minHeight,
}: AssistantRowProps) {
  return (
    <RowWrapper minHeight={minHeight}>
      <div className="group/message contents">
        <AssistantMessage
          message={message}
          isLastAssistant={isLastAssistant}
          isStreaming={isStreaming}
        />
      </div>
    </RowWrapper>
  );
});

interface PendingLoaderRowProps {
  minHeight: number;
}

const PendingLoaderRow = memo(function PendingLoaderRow({
  minHeight,
}: PendingLoaderRowProps) {
  const style = useMemo(() => ({ minHeight }), [minHeight]);
  return (
    <div className="w-full [--thread-max-width:46rem]" style={style}>
      <div className="mx-auto w-full max-w-[var(--thread-max-width)] px-2">
        <div className="pb-4">
          <PendingAssistantLoader />
        </div>
      </div>
    </div>
  );
});
