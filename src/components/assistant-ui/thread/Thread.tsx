"use client";

import { useRef, type FC } from "react";
import { ChatIf, ChatThread } from "@/lib/chat/runtime";
import type { Item } from "@/lib/workspace-state/types";
import { PromptInputShell } from "./PromptInputShell";
import { ThreadLoadingSkeleton } from "./ThreadLoadingSkeleton";
import { ThreadWelcome } from "./ThreadWelcome";
import { VirtualizedMessages } from "./VirtualizedMessages";

interface ThreadProps {
  items?: Item[];
}

export const Thread: FC<ThreadProps> = ({ items = [] }) => {
  const viewportRef = useRef<HTMLDivElement>(null);

  return (
    <ChatThread.Root
      className="aui-root aui-thread-root @container flex h-full flex-col bg-sidebar"
      style={{
        ["--thread-max-width" as string]: "50rem",
      }}
    >
      <ChatThread.Viewport
        ref={viewportRef}
        turnAnchor="top"
        autoScroll={false}
        className="aui-thread-viewport relative flex min-h-0 flex-1 flex-col overflow-x-auto overflow-y-scroll px-4"
      >
        <ChatIf condition={({ thread }) => thread.isLoading}>
          <ThreadLoadingSkeleton />
        </ChatIf>
        <ChatIf condition={({ thread }) => thread.isEmpty && !thread.isLoading}>
          <ThreadWelcome items={items} />
        </ChatIf>

        <VirtualizedMessages scrollRef={viewportRef} />
      </ChatThread.Viewport>

      <div className="aui-thread-composer-wrapper mx-auto flex w-full max-w-[var(--thread-max-width)] flex-shrink-0 flex-col gap-4 overflow-visible rounded-t-3xl bg-sidebar px-4 pb-3 md:pb-4">
        <PromptInputShell items={items} />
      </div>
    </ChatThread.Root>
  );
};
