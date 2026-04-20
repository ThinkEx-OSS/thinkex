"use client";

import type { FC, RefObject } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { ChatThread, useThreadMessageCount } from "@/lib/chat/runtime";
import { MESSAGE_COMPONENTS } from "./message-components";

interface VirtualizedMessagesProps {
  scrollRef: RefObject<HTMLDivElement | null>;
}

export const VirtualizedMessages: FC<VirtualizedMessagesProps> = ({
  scrollRef,
}) => {
  const messageCount = useThreadMessageCount();

  const virtualizer = useVirtualizer({
    count: messageCount,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => 350,
    overscan: 5,
  });

  if (messageCount === 0) return null;

  return (
    <div
      style={{
        height: `${virtualizer.getTotalSize()}px`,
        width: "100%",
        position: "relative",
      }}
    >
      {virtualizer.getVirtualItems().map((virtualRow) => (
        <div
          key={virtualRow.key}
          data-index={virtualRow.index}
          ref={virtualizer.measureElement}
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            width: "100%",
            transform: `translateY(${virtualRow.start}px)`,
          }}
        >
          <ChatThread.MessageByIndex
            index={virtualRow.index}
            components={MESSAGE_COMPONENTS}
          />
        </div>
      ))}
    </div>
  );
};
