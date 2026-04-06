import type { FC } from "react";

import { AuiIf, ThreadPrimitive } from "@assistant-ui/react";

import { ComposerHoverWrapper } from "@/components/assistant-ui/thread/composer";
import {
  AssistantMessage,
  EditComposer,
  UserMessage,
} from "@/components/assistant-ui/thread/messages";
import {
  EMPTY_THREAD_ITEMS,
  THREAD_MAX_WIDTH,
} from "@/components/assistant-ui/thread/shared";
import {
  ThreadLoadingSkeleton,
  ThreadWelcome,
} from "@/components/assistant-ui/thread/welcome";
import type { Item } from "@/lib/workspace-state/types";

interface ThreadProps {
  items?: Item[];
}

export const Thread: FC<ThreadProps> = ({ items = EMPTY_THREAD_ITEMS }) => {
  return (
    <ThreadPrimitive.Root
      className="aui-root aui-thread-root @container flex h-full flex-col bg-sidebar"
      style={{
        ["--thread-max-width" as string]: THREAD_MAX_WIDTH,
      }}
    >
      <ThreadPrimitive.Viewport
        turnAnchor="top"
        autoScroll={false}
        className="aui-thread-viewport relative flex min-h-0 flex-1 flex-col overflow-x-auto overflow-y-scroll px-4"
      >
        <AuiIf condition={({ thread }) => thread.isLoading}>
          <ThreadLoadingSkeleton />
        </AuiIf>

        <AuiIf condition={({ thread }) => thread.isEmpty && !thread.isLoading}>
          <ThreadWelcome items={items} />
        </AuiIf>

        <ThreadPrimitive.Messages>
          {({ message }) => {
            if (message.composer.isEditing) {
              return <EditComposer />;
            }

            if (message.role === "user") {
              return <UserMessage />;
            }

            return <AssistantMessage />;
          }}
        </ThreadPrimitive.Messages>
      </ThreadPrimitive.Viewport>

      <div className="aui-thread-composer-wrapper relative mx-auto flex w-full max-w-[var(--thread-max-width)] flex-shrink-0 flex-col overflow-visible bg-sidebar px-4 pb-3 md:pb-4">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 -top-8 h-8 bg-gradient-to-b from-transparent to-sidebar"
        />
        <ComposerHoverWrapper items={items} />
      </div>
    </ThreadPrimitive.Root>
  );
};
