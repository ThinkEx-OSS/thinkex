"use client";

import { useState, memo } from "react";
import { X, ChevronDown, ChevronUp } from "lucide-react";
import { BsArrowReturnRight } from "react-icons/bs";
import { useUIStore } from "@/lib/stores/ui-store";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

/**
 * Displays “Ask AI” text selections as chips above the chat input.
 */
function ReplyContextDisplayImpl() {
  const replySelections = useUIStore((state) => state.replySelections);
  const removeReplySelection = useUIStore((state) => state.removeReplySelection);
  const [isExpanded, setIsExpanded] = useState(false);

  const hasReplies = replySelections.length > 0;

  // Show expand button if there are more than 3 selections (likely to overflow)
  const showExpandButton = replySelections.length > 3;

  // Helper function to truncate text for display
  const truncateText = (text: string, maxLength: number = 30) => {
    if (text.length <= maxLength) return text;
    return text.substring(0, maxLength).trim() + "...";
  };

  if (!hasReplies) return null;

  return (
    <div className="flex items-center gap-1.5 py-1 overflow-hidden">
      {/* Selections Container */}
      <div
        className={`flex gap-1.5 flex-1 ${
          isExpanded ? "flex-wrap" : "flex-nowrap overflow-hidden"
        } ${!showExpandButton ? "pr-7" : ""}`}
      >
        {replySelections.map((selection, index) => (
          <Tooltip key={`ask-ai-context-${index}`}>
            <TooltipTrigger asChild>
              <div
                className="relative group flex items-center gap-1.5 px-2 py-0.5 rounded-md border border-blue-600/25 bg-blue-600/10 hover:bg-blue-600/15 transition-colors flex-shrink-0 cursor-default"
              >
                <div className="w-4 h-4 flex-shrink-0 flex items-center justify-center">
                  <BsArrowReturnRight className="w-3 h-3 text-blue-600 transition-opacity duration-200 group-hover:opacity-0 dark:text-blue-400" />
                  <button
                    type="button"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      removeReplySelection(index);
                    }}
                    className="p-0.5 rounded transition-colors opacity-0 group-hover:opacity-100 flex items-center justify-center absolute hover:text-red-500"
                    title="Remove from context"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>

                {/* Selection Text */}
                <span className="text-xs max-w-[200px] truncate text-blue-800 dark:text-blue-200">
                  {truncateText(selection.text)}
                </span>
              </div>
            </TooltipTrigger>
            <TooltipContent side="top" className="max-w-sm whitespace-pre-wrap break-words">
              {selection.text}
            </TooltipContent>
          </Tooltip>
        ))}
      </div>

      {/* Expand/Collapse Button */}
      {showExpandButton && (
        <button
          type="button"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            setIsExpanded(!isExpanded);
          }}
          className="p-0 text-muted-foreground hover:text-foreground hover:bg-accent rounded transition-colors flex-shrink-0 flex items-center justify-center h-full"
          title={isExpanded ? "Show less" : "Show all"}
        >
          {isExpanded ? (
            <ChevronUp className="w-3.5 h-3.5" />
          ) : (
            <ChevronDown className="w-3.5 h-3.5" />
          )}
        </button>
      )}
    </div>
  );
}

export const ReplyContextDisplay = memo(ReplyContextDisplayImpl);

