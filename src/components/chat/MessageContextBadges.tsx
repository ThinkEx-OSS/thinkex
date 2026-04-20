"use client";

import { memo } from "react";
import { useCurrentChatMessage } from "@/lib/chat/runtime";
import { BsArrowReturnRight } from "react-icons/bs";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { ReplySelection } from "@/lib/stores/ui-store";
import { ReplySelectionRichText } from "@/components/chat/ReplySelectionRichText";

type MessageCustomMetadata = {
  replySelections?: ReplySelection[];
};

/**
 * Renders persisted “Ask AI” text context from message.metadata.custom
 * when viewing user messages in history.
 */
function MessageContextBadgesImpl() {
  const message = useCurrentChatMessage();
  if (!message || message.role !== "user") return null;

  const custom = (message.metadata as { custom?: MessageCustomMetadata } | undefined)?.custom;
  if (!custom) return null;

  const { replySelections } = custom;
  const hasAny = replySelections && replySelections.length > 0;
  if (!hasAny) return null;

  return (
    <div className="mb-2 flex flex-wrap gap-1.5">
      {replySelections?.map((sel, i) => (
        <Tooltip key={i}>
          <TooltipTrigger asChild>
            <div className="inline-flex items-center gap-1.5 rounded-md border border-blue-600/25 bg-blue-600/10 px-2 py-0.5 cursor-default">
              <BsArrowReturnRight className="h-3.5 w-3.5 shrink-0 text-blue-600 dark:text-blue-400" />
              <span className="text-xs max-w-[200px] min-w-0 line-clamp-1 text-blue-800 dark:text-blue-200 [&_.katex]:text-[0.85em] [&_.katex-display]:inline [&_.katex-display]:m-0 [&_.katex-display>.katex]:inline">
                <ReplySelectionRichText text={sel.text} />
              </span>
            </div>
          </TooltipTrigger>
          <TooltipContent
            side="top"
            className="max-w-sm whitespace-pre-wrap break-words [&_.katex]:text-[0.9em]"
          >
            <ReplySelectionRichText text={sel.text} />
          </TooltipContent>
        </Tooltip>
      ))}
    </div>
  );
}

export const MessageContextBadges = memo(MessageContextBadgesImpl);
