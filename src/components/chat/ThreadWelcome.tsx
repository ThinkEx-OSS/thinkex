"use client";

import type { FC } from "react";

import { ThreadSuggestions } from "@/components/chat/ThreadSuggestions";
import { ThinkExLogo } from "@/components/ui/thinkex-logo";
import type { Item } from "@/lib/workspace-state/types";

interface ThreadWelcomeProps {
  items: Item[];
}

/**
 * Empty-state content for a brand-new thread: the ThinkEx logo centered in
 * the remaining space with suggestion pills pinned to the bottom.
 *
 * Layout: root is a full-height flex column. The logo row uses `flex-1` to
 * swallow extra vertical space, which pushes ThreadSuggestions to the bottom.
 */
export const ThreadWelcome: FC<ThreadWelcomeProps> = ({ items }) => {
  return (
    <div className="mx-auto flex w-full max-w-[var(--thread-max-width)] flex-1 flex-col">
      <div className="flex flex-1 items-center justify-center">
        <ThinkExLogo size={48} priority />
      </div>
      <ThreadSuggestions items={items} />
    </div>
  );
};
