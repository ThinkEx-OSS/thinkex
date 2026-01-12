"use client";

import { useState, useMemo, memo } from "react";

import { X, ChevronDown, ChevronUp } from "lucide-react";
import { MdFormatColorText } from "react-icons/md";
import { useUIStore, selectSelectedCardIdsArray, selectBlockNoteSelection } from "@/lib/stores/ui-store";
import { useShallow } from "zustand/react/shallow";
import type { Item } from "@/lib/workspace-state/types";

interface CardContextDisplayProps {
  items: Item[];
}

/**
 * Displays selected cards as context chips above the chat input.
 * Shows cards in a collapsible view - single line by default, expandable to show all.
 */
function CardContextDisplayImpl({ items }: CardContextDisplayProps) {
  // Use array selector with shallow comparison to prevent unnecessary re-renders and SSR issues
  const selectedCardIdsArray = useUIStore(
    useShallow(selectSelectedCardIdsArray)
  );
  const selectedCardIds = useMemo(() => new Set(selectedCardIdsArray), [selectedCardIdsArray]);
  const toggleCardSelection = useUIStore((state) => state.toggleCardSelection);
  const clearBlockNoteSelection = useUIStore((state) => state.clearBlockNoteSelection);
  const blockNoteSelection = useUIStore(selectBlockNoteSelection);

  const [isExpanded, setIsExpanded] = useState(false);

  // Filter to only selected items - memoized to prevent recalculation
  const selectedItems = useMemo(
    () => items.filter((item) => selectedCardIds.has(item.id)),
    [items, selectedCardIds]
  );


  // Show expand button if there are more than 3 items total (selection + cards)
  const totalItems = (blockNoteSelection ? 1 : 0) + selectedItems.length;
  const showExpandButton = totalItems > 3;

  // Truncate text preview for display
  const getTextPreview = (text: string, maxLength: number = 40): string => {
    if (text.length <= maxLength) return text;
    return text.substring(0, maxLength) + "...";
  };

  return (
    <div className="flex items-center gap-1.5 px-3 py-1 overflow-visible">
      {/* Items Container */}
      <div
        className={`flex gap-1.5 flex-1 items-center ${isExpanded ? "flex-wrap" : "flex-nowrap overflow-hidden"
          } ${!showExpandButton ? "pr-7" : ""}`}
      >
        {/* BlockNote Selection - Always shown first */}
        {blockNoteSelection && (
          <div
            className="relative group flex items-center gap-1.5 px-2 py-0.5 rounded-md border border-primary/30 bg-primary/10 hover:bg-primary/20 transition-colors flex-shrink-0"
            title={blockNoteSelection.text}
          >
            {/* Selection Indicator / Remove Button Container */}
            <div className="w-4 h-4 flex-shrink-0 flex items-center justify-center">
              {/* Text selection icon - visible by default, hidden on hover */}
              <MdFormatColorText className="w-4 h-4 text-primary/70 transition-opacity duration-200 group-hover:opacity-0" />
              {/* X icon - hidden by default, visible on hover */}
              <button
                type="button"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  clearBlockNoteSelection();
                }}
                className="p-0.5 rounded transition-colors opacity-0 group-hover:opacity-100 flex items-center justify-center absolute hover:text-red-500"
                title="Remove from context"
              >
                <X className="w-3 h-3" />
              </button>
            </div>

            {/* Text Preview */}
            <span className="text-xs text-primary/90 leading-tight max-w-[120px] truncate">
              {getTextPreview(blockNoteSelection.text)}
            </span>
          </div>
        )}

        {/* Selected Cards */}
        {selectedItems.map((item) => (
          <div
            key={item.id}
            className="relative group flex items-center gap-1.5 px-2 py-0.5 rounded-md border border-border bg-sidebar-accent hover:bg-accent transition-colors flex-shrink-0"
          >
            {/* Color Indicator / Remove Button Container */}
            <div className="w-2 h-2 flex-shrink-0 flex items-center justify-center">
              {/* Color circle - visible by default, hidden on hover */}
              {item.color && (
                <div
                  className="w-2 h-2 rounded-full transition-opacity duration-200 group-hover:opacity-0"
                  style={{ backgroundColor: item.color }}
                />
              )}
              {/* X icon - hidden by default, visible on hover */}
              <button
                type="button"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  toggleCardSelection(item.id);
                }}
                className="p-0.5 rounded transition-colors opacity-0 group-hover:opacity-100 flex items-center justify-center absolute hover:text-red-500"
                title="Remove from context"
              >
                <X className="w-3 h-3" />
              </button>
            </div>

            {/* Card Title */}
            <span className="text-xs max-w-[80px] truncate">
              {item.name || "Untitled"}
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

// Memoize to prevent unnecessary re-renders when props haven't changed
export const CardContextDisplay = memo(CardContextDisplayImpl, (prevProps, nextProps) => {
  // Compare items array length and IDs to avoid re-renders when items haven't actually changed
  if (prevProps.items.length !== nextProps.items.length) return false;

  // Create maps of items by ID for efficient lookup
  const prevItemsMap = new Map(prevProps.items.map(item => [item.id, item]));
  const nextItemsMap = new Map(nextProps.items.map(item => [item.id, item]));

  // Check if all IDs match
  if (prevItemsMap.size !== nextItemsMap.size) return false;
  for (const id of prevItemsMap.keys()) {
    if (!nextItemsMap.has(id)) return false;
  }

  // Check if any item's name or color has changed (these are displayed in the chips)
  for (const [id, prevItem] of prevItemsMap) {
    const nextItem = nextItemsMap.get(id);
    if (!nextItem) return false; // Shouldn't happen due to ID check above, but be safe
    
    // Compare name and color since these are displayed in the chips
    if (prevItem.name !== nextItem.name || prevItem.color !== nextItem.color) {
      return false; // Properties changed, allow re-render
    }
  }

  return true; // Items are the same, skip re-render
});
