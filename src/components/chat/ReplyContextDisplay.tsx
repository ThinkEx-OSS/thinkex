"use client";

import { useState, memo } from "react";
import { X, ChevronDown, ChevronUp } from "lucide-react";
import { BsArrowReturnRight } from "react-icons/bs";
import { useUIStore } from "@/lib/stores/ui-store";

/**
 * Displays reply selections as individual chips above the chat input.
 * Shows each selection separately, similar to CardContextDisplay.
 */
function ReplyContextDisplayImpl() {
  // Get reply selections from store
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
          <div
            key={`reply-${index}`}
            className="relative group flex items-center gap-1.5 px-2 py-0.5 rounded-lg border border-blue-500/30 bg-blue-500/10 hover:bg-blue-500/20 transition-colors flex-shrink-0"
          >
            {/* Remove Button Container */}
            <div className="w-4 h-4 flex-shrink-0 flex items-center justify-center">
              {/* Blue arrow icon - visible by default, hidden on hover */}
              <BsArrowReturnRight className="w-3 h-3 text-blue-500 transition-opacity duration-200 group-hover:opacity-0" />
              {/* X icon - hidden by default, visible on hover */}
              <button
                type="button"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  removeReplySelection(index);
                }}
                className="p-0.5 rounded transition-colors opacity-0 group-hover:opacity-100 flex items-center justify-center absolute hover:text-red-500"
                title="Remove this reply"
              >
                <X className="w-3 h-3" />
              </button>
            </div>

            {/* Selection Text */}
            <span className="text-xs max-w-[200px] truncate text-blue-700 dark:text-blue-300">
              {truncateText(selection.text)}
            </span>
          </div>
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

// Memoize component - re-renders will be controlled by Zustand store updates
// The component will re-render when replySelections changes, which is expected
export const ReplyContextDisplay = memo(ReplyContextDisplayImpl);

