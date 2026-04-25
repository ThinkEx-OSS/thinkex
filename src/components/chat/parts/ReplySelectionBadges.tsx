"use client";

import { memo } from "react";
import { BsArrowReturnRight } from "react-icons/bs";

import { ReplySelectionRichText } from "@/components/chat/ReplySelectionRichText";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import type { ChatMessage } from "@/lib/chat/types";

interface ReplySelectionBadgesProps {
  message: ChatMessage;
}

/**
 * Renders persisted "Ask AI" reply selections from
 * `message.metadata.custom.replySelections` for user messages. This is the
 * prop-based replacement for the AUI-runtime version under
 * `components/chat/MessageContextBadges`.
 */
function ReplySelectionBadgesImpl({ message }: ReplySelectionBadgesProps) {
  if (message.role !== "user") return null;

  const replySelections = message.metadata?.custom?.replySelections;
  if (!replySelections || replySelections.length === 0) return null;

  return (
    <div className="mb-2 flex flex-wrap gap-1.5">
      {replySelections.map((sel, i) => (
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

export const ReplySelectionBadges = memo(ReplySelectionBadgesImpl);
