"use client";

import type { FC } from "react";
import { ThinkExLogo } from "@/components/ui/thinkex-logo";
import type { Item } from "@/lib/workspace-state/types";
import { ThreadSuggestions } from "./ThreadSuggestions";

interface ThreadWelcomeProps {
  items: Item[];
}

export const ThreadWelcome: FC<ThreadWelcomeProps> = ({ items }) => {
  return (
    <div className="aui-thread-welcome-root mx-auto my-auto flex w-full max-w-[var(--thread-max-width)] flex-grow flex-col">
      <div className="aui-thread-welcome-center flex w-full flex-grow flex-col items-center justify-center">
        <div className="aui-thread-welcome-message flex size-full flex-col items-center justify-center px-8">
          <div className="aui-thread-welcome-message-motion-0 mb-1 flex justify-center">
            <div className="relative flex h-12 w-12 items-center justify-center">
              <ThinkExLogo size={48} priority />
            </div>
          </div>
        </div>
      </div>
      <ThreadSuggestions items={items} />
    </div>
  );
};
