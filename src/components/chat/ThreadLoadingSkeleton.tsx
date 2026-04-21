"use client";

import type { FC } from "react";

import { Skeleton } from "@/components/ui/skeleton";

/**
 * Placeholder shown while a thread's message history is being fetched after
 * switching chats. Prevents the ThreadWelcome flash that would otherwise
 * appear because `useChat.messages` is `[]` until `setMessages()` seeds from
 * the `useThreadMessagesQuery` response.
 *
 * Shape mimics a short conversation (user bubble → assistant paragraph →
 * user bubble → assistant paragraph) so the transition to real content feels
 * continuous.
 */
export const ThreadLoadingSkeleton: FC = () => {
  return (
    <div
      role="status"
      aria-label="Loading conversation"
      className="mx-auto flex w-full max-w-[var(--thread-max-width,46rem)] flex-col gap-10 px-2 pt-8 pb-6 [--thread-max-width:46rem]"
    >
      <SkeletonUser width="60%" />
      <SkeletonAssistant lines={3} />
      <SkeletonUser width="45%" />
      <SkeletonAssistant lines={4} />
    </div>
  );
};

function SkeletonUser({ width }: { width: string }) {
  return (
    <div className="flex justify-end">
      <Skeleton
        className="h-10 rounded-2xl rounded-br-sm"
        style={{ width }}
      />
    </div>
  );
}

function SkeletonAssistant({ lines }: { lines: number }) {
  return (
    <div className="flex flex-col gap-2">
      {Array.from({ length: lines }, (_, i) => (
        <Skeleton
          key={i}
          className="h-4"
          style={{
            width: i === lines - 1 ? `${40 + ((i * 13) % 30)}%` : "100%",
          }}
        />
      ))}
    </div>
  );
}
