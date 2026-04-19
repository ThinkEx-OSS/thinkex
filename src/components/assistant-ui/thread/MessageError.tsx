"use client";

import type { FC } from "react";
import { ChatError, ChatMessage } from "@/lib/chat/runtime";

export const MessageError: FC = () => {
  return (
    <ChatMessage.Error>
      <ChatError.Root className="aui-message-error-root mt-2 rounded-md border border-destructive bg-destructive/10 p-3 text-sm text-destructive dark:bg-destructive/5 dark:text-red-200">
        <ChatError.Message className="aui-message-error-message line-clamp-2" />
      </ChatError.Root>
    </ChatMessage.Error>
  );
};
