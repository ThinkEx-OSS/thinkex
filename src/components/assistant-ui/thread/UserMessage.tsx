"use client";

import { ChevronDown, ChevronUp } from "lucide-react";
import { useMemo, useState, type FC } from "react";
import { UserMessageAttachments } from "@/components/assistant-ui/attachment";
import { File as FileComponent } from "@/components/assistant-ui/file";
import { MessageContextBadges } from "@/components/chat/MessageContextBadges";
import { ChatMessage, useChatMessage } from "@/lib/chat/runtime";
import { BranchPicker } from "./BranchPicker";
import {
  USER_MESSAGE_MAX_CHARS,
  UserMessageText,
  UserMessageTruncateContext,
} from "./UserMessageTruncateContext";
import { UserActionBar } from "./UserActionBar";

export const UserMessage: FC = () => {
  const [expanded, setExpanded] = useState(false);
  const message = useChatMessage();

  const textLength = useMemo(
    () =>
      message.content
        .filter(
          (part): part is { type: "text"; text: string } =>
            part.type === "text",
        )
        .reduce((sum, part) => sum + (part.text?.length ?? 0), 0),
    [message.content],
  );

  const showExpand = textLength > USER_MESSAGE_MAX_CHARS;

  const truncateCtxValue = useMemo(
    () => ({
      maxChars: USER_MESSAGE_MAX_CHARS,
      expanded,
      showExpand,
    }),
    [expanded, showExpand],
  );

  return (
    <ChatMessage.Root asChild>
      <div
        className="aui-user-message-root mx-auto grid w-full max-w-[var(--thread-max-width)] animate-breathe-in auto-rows-auto grid-cols-[minmax(72px,1fr)_auto] gap-y-2 px-2 pt-4 pb-1 last:mb-5 [&:where(>*)]:col-start-2"
        data-role="user"
      >
        <UserMessageAttachments />

        <div className="aui-user-message-content-wrapper relative col-start-2 min-w-0">
          <MessageContextBadges />
          <UserMessageTruncateContext.Provider value={truncateCtxValue}>
            <div className="aui-user-message-content relative rounded-lg bg-muted px-3 py-2 break-words text-foreground text-sm">
              <ChatMessage.Parts
                components={{
                  Text: UserMessageText,
                  File: FileComponent,
                }}
              />
              {showExpand && (
                <div className="flex justify-end pt-1.5 mt-1.5">
                  <button
                    type="button"
                    onClick={() => setExpanded((e) => !e)}
                    className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
                    aria-label={expanded ? "Show less" : "Show more"}
                  >
                    {expanded ? (
                      <ChevronUp className="size-3.5" />
                    ) : (
                      <ChevronDown className="size-3.5" />
                    )}
                    {expanded ? "Show less" : "Show more"}
                  </button>
                </div>
              )}
            </div>
          </UserMessageTruncateContext.Provider>
        </div>

        <div className="aui-user-message-footer ml-2 flex justify-end col-start-2 relative min-h-[20px]">
          <div className="absolute right-0">
            <UserActionBar />
          </div>
        </div>

        <BranchPicker className="aui-user-branch-picker col-span-full col-start-1 row-start-3 -mr-1 justify-end" />
      </div>
    </ChatMessage.Root>
  );
};
