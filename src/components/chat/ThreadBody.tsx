"use client";

import type { ReactNode } from "react";

import { useChatContext } from "@/components/chat/ChatProvider";
import { Messages } from "@/components/chat/Messages";
import { ThreadLoadingSkeleton } from "@/components/chat/ThreadLoadingSkeleton";
import { THREAD_TOP_INSET } from "@/components/chat/thread-layout";

interface ThreadBodyProps {
  /** Rendered when the thread is empty and history has finished loading. */
  empty: ReactNode;
}

/**
 * Routes between the three thread states — loading, empty, populated —
 * so `<Messages>` only has to care about the virtualized list. Isolating
 * each state in its own tree also means refs and effects inside
 * `<Messages>` can rely on their DOM being present on first mount.
 */
export function ThreadBody({ empty }: ThreadBodyProps) {
  const { messages, isHistoryLoading } = useChatContext();

  if (messages.length === 0 && isHistoryLoading) {
    return (
      <div
        className="h-full w-full overflow-x-hidden overflow-y-auto px-3 sm:px-6"
        style={{ paddingTop: THREAD_TOP_INSET }}
      >
        <ThreadLoadingSkeleton />
      </div>
    );
  }

  if (messages.length === 0) {
    return (
      <div
        className="flex h-full w-full flex-col items-center overflow-x-hidden overflow-y-auto px-3 sm:px-6"
        style={{ paddingTop: THREAD_TOP_INSET }}
      >
        <div className="flex w-full max-w-[var(--thread-max-width,46rem)] flex-1 flex-col [--thread-max-width:46rem]">
          {empty}
        </div>
      </div>
    );
  }

  return <Messages />;
}
