"use client";

import { useState, useMemo, memo } from "react";

import { X, ChevronDown, ChevronUp, Eye } from "lucide-react";
import { useUIStore } from "@/lib/stores/ui-store";
import { useSelectedCardIds } from "@/hooks/ui/use-selected-card-ids";
import { useViewingItemIds } from "@/hooks/ui/use-viewing-item-ids";
import { cn } from "@/lib/utils";
import type { Item } from "@/lib/workspace-state/types";

interface CardContextDisplayProps {
  items: Item[];
}

/**
 * Displays selected cards as context chips above the chat input.
 * Shows cards in a collapsible view - single line by default, expandable to show all.
 */
function CardContextDisplayImpl({ items }: CardContextDisplayProps) {
  const { selectedCardIds } = useSelectedCardIds();
  const activePdfPageByItemId = useUIStore((state) => state.activePdfPageByItemId);
  const viewingItemIds = useViewingItemIds();
  const toggleCardSelection = useUIStore((state) => state.toggleCardSelection);

  const [isExpanded, setIsExpanded] = useState(false);

  const contextItemIds = useMemo(() => {
    const ids = new Set<string>(selectedCardIds);
    viewingItemIds.forEach((id) => ids.add(id));
    return ids;
  }, [selectedCardIds, viewingItemIds]);

  // Selected and/or open in a panel; viewing (open) items sort first
  const selectedItems = useMemo(() => {
    const filtered = items.filter((item) => contextItemIds.has(item.id));
    return [...filtered].sort((a, b) => {
      const aViewing = viewingItemIds.has(a.id) ? 1 : 0;
      const bViewing = viewingItemIds.has(b.id) ? 1 : 0;
      if (aViewing !== bViewing) return bViewing - aViewing; // viewing first
      return 0; // preserve original order within each group
    });
  }, [items, contextItemIds, viewingItemIds]);

  // Show expand button if there are more than 3 items total (selection + cards)
  const totalItems = selectedItems.length;
  const showExpandButton = totalItems > 3;

  return (
    <div className="flex items-center gap-1.5 py-1 overflow-visible">
      {/* Items Container */}
      <div
        className={`flex gap-1.5 flex-1 items-center ${isExpanded ? "flex-wrap" : "flex-nowrap overflow-hidden"
          } ${!showExpandButton ? "pr-7" : ""}`}
      >
        {/* Selected Cards */}
        {selectedItems.map((item) => {
          const isSelected = selectedCardIds.has(item.id);
          const isViewing = viewingItemIds.has(item.id);
          const showRemoveButton = isSelected;

          return (
          <div
            key={item.id}
            className="relative group flex items-center gap-1.5 px-2 py-0.5 rounded-md border border-border bg-sidebar-accent hover:bg-accent transition-colors flex-shrink-0"
          >
            {/* Color / Viewing indicator; X only for explicit selection (not viewing-only) */}
            <div className="w-3 h-3 flex-shrink-0 flex items-center justify-center relative">
              {isViewing ? (
                <span
                  title="Currently viewing"
                  className={cn(
                    "flex items-center justify-center",
                    showRemoveButton &&
                      "transition-opacity duration-200 group-hover:opacity-0",
                  )}
                >
                  <Eye className="w-3 h-3 text-muted-foreground" />
                </span>
              ) : (
                item.color && (
                  <div
                    className={cn(
                      "w-2 h-2 rounded-full transition-opacity duration-200",
                      showRemoveButton && "group-hover:opacity-0",
                    )}
                    style={{ backgroundColor: item.color }}
                  />
                )
              )}
              {showRemoveButton && (
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
              )}
            </div>

            {/* Card Title + Page number for PDFs */}
            <span className="text-xs max-w-[80px] truncate">
              {item.name || "Untitled"}
            </span>
            {item.type === "pdf" &&
              activePdfPageByItemId[item.id] != null &&
              activePdfPageByItemId[item.id] >= 1 && (
              <span className="text-xs text-muted-foreground flex-shrink-0">
                p.{activePdfPageByItemId[item.id]}
              </span>
            )}
          </div>
          );
        })}
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
    
    // Compare fields that affect chip rendering (incl. type for PDF page badge)
    if (
      prevItem.name !== nextItem.name ||
      prevItem.color !== nextItem.color ||
      prevItem.type !== nextItem.type
    ) {
      return false; // Properties changed, allow re-render
    }
  }

  return true; // Items are the same, skip re-render
});
