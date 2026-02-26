"use client";

import { useState, useMemo, useCallback } from "react";
import {
  ChevronRight,
  Folder as FolderIcon,
  FileText,
  File,
  Play,
  Brain,
  ImageIcon,
  Mic,
} from "lucide-react";
import { PiCardsThreeBold } from "react-icons/pi";
import { cn } from "@/lib/utils";
import type { Item, CardType } from "@/lib/workspace-state/types";
import { getChildFolders, searchItemsByName } from "@/lib/workspace-state/search";
import { Collapsible, CollapsibleContent } from "@/components/ui/collapsible";

export function getCardTypeIcon(type: CardType) {
  switch (type) {
    case "note":
      return <FileText className="size-3.5 text-blue-400" />;
    case "pdf":
      return <File className="size-3.5 text-red-400" />;
    case "flashcard":
      return <PiCardsThreeBold className="size-3.5 text-purple-400 rotate-180" />;
    case "quiz":
      return <Brain className="size-3.5 text-green-400" />;
    case "youtube":
      return <Play className="size-3.5 text-red-500" />;
    case "folder":
      return <FolderIcon className="size-3.5 text-amber-500" />;
    case "image":
      return <ImageIcon className="size-3.5 text-emerald-500" />;
    case "audio":
      return <Mic className="size-3.5 text-orange-400" />;
    default:
      return <FileText className="size-3.5 text-muted-foreground" />;
  }
}

interface FolderTreeItemProps {
  folder: Item;
  allItems: Item[];
  query: string;
  onSelect: (item: Item) => void;
  selectedIds: Set<string>;
  expandedFolders: Set<string>;
  onToggleExpand: (folderId: string) => void;
  level: number;
  highlightedIndex?: number;
  currentIndex?: { value: number };
  onItemIndex?: (idx: number, item: Item) => void;
  selectedIndicator?: (isSelected: boolean) => React.ReactNode;
}

function FolderTreeItem({
  folder,
  allItems,
  query,
  onSelect,
  selectedIds,
  expandedFolders,
  onToggleExpand,
  level,
  highlightedIndex,
  currentIndex,
  onItemIndex,
  selectedIndicator,
}: FolderTreeItemProps) {
  const [isHovered, setIsHovered] = useState(false);
  const isExpanded = expandedFolders.has(folder.id);

  const childFolders = useMemo(() => getChildFolders(folder.id, allItems), [folder.id, allItems]);

  const directItems = useMemo(() => {
    const list = allItems.filter((i) => i.type !== "folder" && i.folderId === folder.id);
    return query.trim() ? searchItemsByName(list, query) : list;
  }, [folder.id, allItems, query]);

  const hasChildren = childFolders.length > 0 || directItems.length > 0;
  const baseIndent = 8 + level * 16;
  const itemIndent = baseIndent + 20;
  const isSelected = selectedIds.has(folder.id);
  const hasKeyboard = currentIndex !== undefined;

  const handleToggleClick = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      onToggleExpand(folder.id);
    },
    [folder.id, onToggleExpand]
  );

  return (
    <Collapsible open={isExpanded} onOpenChange={() => onToggleExpand(folder.id)}>
      <div
        className={cn(
          "flex items-center gap-2 px-2 py-1.5 rounded-md transition-colors group min-w-0 overflow-hidden",
          "hover:bg-accent"
        )}
        style={{ paddingLeft: `${baseIndent}px` }}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
      >
        <button
          type="button"
          onClick={handleToggleClick}
          className="w-4 h-4 flex items-center justify-center flex-shrink-0 hover:bg-accent/50 rounded cursor-pointer"
        >
          {isExpanded || isHovered ? (
            <ChevronRight
              className={cn(
                "size-3.5 text-muted-foreground transition-transform",
                isExpanded && "rotate-90"
              )}
            />
          ) : (
            <FolderIcon
              className="size-3.5 flex-shrink-0"
              style={{ color: folder.color || "#F59E0B" }}
            />
          )}
        </button>

        <div
          className="flex-1 flex items-center gap-2 cursor-pointer min-w-0 overflow-hidden"
          onClick={() => onSelect(folder)}
        >
          {isSelected && selectedIndicator
            ? selectedIndicator(true)
            : isSelected && (
                <div className="w-4 h-4 rounded-full bg-white border-2 border-white flex-shrink-0" />
              )}
          <span className="flex-1 min-w-0 text-sm truncate block overflow-hidden">{folder.name}</span>
        </div>
      </div>

      {hasChildren && (
        <CollapsibleContent>
          {childFolders.map((childFolder) => (
            <FolderTreeItem
              key={childFolder.id}
              folder={childFolder}
              allItems={allItems}
              query={query}
              onSelect={onSelect}
              selectedIds={selectedIds}
              expandedFolders={expandedFolders}
              onToggleExpand={onToggleExpand}
              level={level + 1}
              highlightedIndex={highlightedIndex}
              currentIndex={currentIndex}
              onItemIndex={onItemIndex}
              selectedIndicator={selectedIndicator}
            />
          ))}
          {directItems.map((item) => {
            const itemIndex = hasKeyboard ? currentIndex.value++ : -1;
            if (hasKeyboard && onItemIndex) onItemIndex(itemIndex, item);
            const isHighlighted = hasKeyboard && itemIndex === highlightedIndex;
            const isItemSelected = selectedIds.has(item.id);
            return (
              <div
                key={item.id}
                className={cn(
                  "flex items-center gap-2 px-2 py-1.5 rounded-md cursor-pointer transition-colors min-w-0 overflow-hidden",
                  isHighlighted && "bg-accent",
                  !isHighlighted && "hover:bg-accent/50"
                )}
                style={{ paddingLeft: `${itemIndent}px` }}
                onClick={() => onSelect(item)}
              >
                {isItemSelected && selectedIndicator
                  ? selectedIndicator(true)
                  : isItemSelected ? (
                      <div className="w-4 h-4 rounded-full bg-white border-2 border-white flex-shrink-0" />
                    ) : (
                      getCardTypeIcon(item.type)
                    )}
                <span className="flex-1 min-w-0 text-sm truncate block overflow-hidden">
                  {item.name || "Untitled"}
                </span>
              </div>
            );
          })}
        </CollapsibleContent>
      )}
    </Collapsible>
  );
}

export interface WorkspaceItemPickerProps {
  items: Item[];
  query: string;
  selectedIds: Set<string>;
  onSelect: (item: Item) => void;
  expandedFolders: Set<string>;
  onToggleExpand: (folderId: string) => void;
  highlightedIndex?: number;
  currentIndex?: { value: number };
  onItemIndex?: (idx: number, item: Item) => void;
  selectedIndicator?: (isSelected: boolean) => React.ReactNode;
}

export function WorkspaceItemPicker({
  items,
  query,
  selectedIds,
  onSelect,
  expandedFolders,
  onToggleExpand,
  highlightedIndex,
  currentIndex,
  onItemIndex,
  selectedIndicator,
}: WorkspaceItemPickerProps) {
  const rootFolders = useMemo(() => getChildFolders(null, items), [items]);

  const rootItems = useMemo(() => {
    const list = items.filter((i) => i.type !== "folder" && !i.folderId);
    return query.trim() ? searchItemsByName(list, query) : list;
  }, [items, query]);

  const hasKeyboard = currentIndex !== undefined;

  const hasVisibleItems =
    rootItems.length > 0 ||
    rootFolders.some((folder) => {
      const childItems = items.filter((i) => i.type !== "folder" && i.folderId === folder.id);
      return query.trim() ? searchItemsByName(childItems, query).length > 0 : childItems.length > 0;
    });

  return (
    <div className="min-w-0 w-full overflow-hidden">
      {rootItems.map((item) => {
        const itemIndex = hasKeyboard ? currentIndex.value++ : -1;
        if (hasKeyboard && onItemIndex) onItemIndex(itemIndex, item);
        const isHighlighted = hasKeyboard && itemIndex === highlightedIndex;
        const isSelected = selectedIds.has(item.id);
        return (
          <div
            key={item.id}
            className={cn(
              "flex items-center gap-2 px-2 py-1.5 rounded-md cursor-pointer transition-colors min-w-0 overflow-hidden",
              isHighlighted && "bg-accent",
              !isHighlighted && "hover:bg-accent/50"
            )}
            style={{ paddingLeft: "8px" }}
            onClick={() => onSelect(item)}
          >
            {isSelected && selectedIndicator
              ? selectedIndicator(true)
              : isSelected ? (
                  <div className="w-4 h-4 rounded-full bg-white border-2 border-white flex-shrink-0" />
                ) : (
                  getCardTypeIcon(item.type)
                )}
            <span className="flex-1 min-w-0 text-sm truncate block overflow-hidden">
              {item.name || "Untitled"}
            </span>
          </div>
        );
      })}

      {rootFolders.map((folder) => (
        <FolderTreeItem
          key={folder.id}
          folder={folder}
          allItems={items}
          query={query}
          onSelect={onSelect}
          selectedIds={selectedIds}
          expandedFolders={expandedFolders}
          onToggleExpand={onToggleExpand}
          level={0}
          highlightedIndex={highlightedIndex}
          currentIndex={currentIndex}
          onItemIndex={onItemIndex}
          selectedIndicator={selectedIndicator}
        />
      ))}

      {!hasVisibleItems && (
        <div className="py-4 text-center text-xs text-muted-foreground">
          No items found
        </div>
      )}
    </div>
  );
}
