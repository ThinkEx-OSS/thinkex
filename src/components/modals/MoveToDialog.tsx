"use client";

import { useState, useMemo, useCallback, useEffect } from "react";
import { ChevronRight, Folder as FolderIcon, FolderOpen, Check, FileText, File, Play } from "lucide-react";
import { PiCardsThreeFill } from "react-icons/pi";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent } from "@/components/ui/collapsible";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import type { Item, CardType } from "@/lib/workspace-state/types";
import { getChildFolders, isDescendantOf } from "@/lib/workspace-state/search";
import { IconRenderer } from "@/hooks/use-icon-picker";

/**
 * Get icon for card type (non-folder items)
 */
function getCardTypeIcon(type: CardType) {
  switch (type) {
    case "note":
      return <FileText className="size-3.5 text-blue-400" />;
    case "pdf":
      return <File className="size-3.5 text-red-400" />;
    case "flashcard":
      return <PiCardsThreeFill className="size-3.5 text-purple-400" />;
    case "youtube":
      return <Play className="size-3.5 text-red-500" />;
    default:
      return <FileText className="size-3.5 text-muted-foreground" />;
  }
}

interface MoveToDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  item?: Item; // Single item (for backward compatibility)
  items?: Item[]; // Multiple items (for bulk moves)
  allItems: Item[];
  workspaceName: string;
  workspaceIcon?: string | null;
  workspaceColor?: string | null;
  onMove: (folderId: string | null) => void; // For single item
  onMoveMultiple?: (itemIds: string[], folderId: string | null) => void; // For multiple items
}

interface FolderTreeItemProps {
  folder: Item;
  allItems: Item[];
  selectedFolderId: string | null;
  onSelect: (folderId: string | null) => void;
  disabledFolderIds: Set<string>;
  expandedFolders: Set<string>;
  onToggleExpand: (folderId: string) => void;
  level: number;
}

/**
 * Recursive folder tree item for the move dialog
 */
function FolderTreeItem({
  folder,
  allItems,
  selectedFolderId,
  onSelect,
  disabledFolderIds,
  expandedFolders,
  onToggleExpand,
  level,
}: FolderTreeItemProps) {
  const isExpanded = expandedFolders.has(folder.id);
  const isSelected = selectedFolderId === folder.id;
  const isDisabled = disabledFolderIds.has(folder.id);

  // Get child folders
  const childFolders = useMemo(() => {
    return getChildFolders(folder.id, allItems);
  }, [folder.id, allItems]);

  // Get direct items (non-folders) in this folder
  const directItems = useMemo(() => {
    return allItems.filter(i =>
      i.type !== 'folder' && i.folderId === folder.id
    );
  }, [folder.id, allItems]);

  const hasChildren = childFolders.length > 0 || directItems.length > 0;

  const handleChevronClick = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      onToggleExpand(folder.id);
    },
    [folder.id, onToggleExpand]
  );

  const handleSelect = useCallback(() => {
    if (!isDisabled) {
      onSelect(folder.id);
    }
  }, [folder.id, isDisabled, onSelect]);

  return (
    <Collapsible open={isExpanded} onOpenChange={() => onToggleExpand(folder.id)}>
      <div
        className={cn(
          "flex items-center gap-1 px-2 py-1.5 rounded-md cursor-pointer transition-colors w-full overflow-hidden",
          isSelected && "bg-primary/20 border border-primary/40",
          !isSelected && !isDisabled && "hover:bg-accent",
          isDisabled && "opacity-50 cursor-not-allowed"
        )}
        style={{ paddingLeft: `${level * 16 + 8}px` }}
        onClick={handleSelect}
      >
        {/* Expand/Collapse chevron */}
        <button
          type="button"
          onClick={handleChevronClick}
          className={cn(
            "p-0.5 rounded hover:bg-accent/50 transition-colors shrink-0",
            !hasChildren && "invisible"
          )}
        >
          <ChevronRight
            className={cn(
              "size-4 text-muted-foreground transition-transform",
              isExpanded && "rotate-90"
            )}
          />
        </button>

        {/* Folder icon */}
        {isExpanded ? (
          <FolderOpen
            className="size-4 flex-shrink-0"
            style={{ color: folder.color || "#F59E0B" }}
          />
        ) : (
          <FolderIcon
            className="size-4 flex-shrink-0"
            style={{ color: folder.color || "#F59E0B" }}
          />
        )}

        {/* Folder name */}
        <div className="flex-1 min-w-0">
          <span className="block text-sm truncate pr-2">{folder.name}</span>
        </div>

        {/* Selection indicator */}
        {isSelected && <Check className="size-4 text-primary flex-shrink-0" />}
      </div>

      {/* Child folders and items */}
      {hasChildren && (
        <CollapsibleContent>
          {/* Child folders (selectable) */}
          {childFolders.map((childFolder) => (
            <FolderTreeItem
              key={childFolder.id}
              folder={childFolder}
              allItems={allItems}
              selectedFolderId={selectedFolderId}
              onSelect={onSelect}
              disabledFolderIds={disabledFolderIds}
              expandedFolders={expandedFolders}
              onToggleExpand={onToggleExpand}
              level={level + 1}
            />
          ))}
          {/* Direct items (non-folders, not selectable) */}
          {directItems.map((item) => (
            <div
              key={item.id}
              className={cn(
                "flex items-center gap-2 px-2 py-1.5 rounded-md opacity-60 w-full overflow-hidden",
                "cursor-not-allowed"
              )}
              style={{ paddingLeft: `${(level + 1) * 16 + 8}px` }}
            >
              {getCardTypeIcon(item.type)}
              <div className="flex-1 min-w-0">
                <span className="block text-sm truncate text-muted-foreground pr-2">
                  {item.name || "Untitled"}
                </span>
              </div>
            </div>
          ))}
        </CollapsibleContent>
      )}
    </Collapsible>
  );
}

/**
 * Dialog for moving items/folders to a different location
 * Supports both single item and bulk moves
 */
export default function MoveToDialog({
  open,
  onOpenChange,
  item,
  items,
  allItems,
  workspaceName,
  workspaceIcon,
  workspaceColor,
  onMove,
  onMoveMultiple,
}: MoveToDialogProps) {
  // Determine if this is a bulk move
  const isBulkMove = items !== undefined && items.length > 0;
  const itemsToMove = isBulkMove ? items : (item ? [item] : []);

  // Get the initial folder ID - for bulk moves, use the first item's folderId if all are the same
  const initialFolderId = useMemo((): string | null => {
    if (itemsToMove.length === 0) return null;
    if (isBulkMove && itemsToMove.length > 0) {
      const firstFolderId = itemsToMove[0].folderId ?? null;
      // Check if all items have the same folderId
      const allSameFolder = itemsToMove.every(i => (i.folderId ?? null) === firstFolderId);
      return allSameFolder ? firstFolderId : null;
    }
    return itemsToMove[0]?.folderId ?? null;
  }, [isBulkMove, itemsToMove]);

  // null means "Workspace Root" (no folder)
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(
    initialFolderId
  );
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set());

  // Reset selected folder when dialog opens or items change
  useEffect(() => {
    if (open) {
      setSelectedFolderId(initialFolderId);
      setExpandedFolders(new Set());
    }
  }, [open, initialFolderId]);

  // Get root-level folders
  const rootFolders = useMemo(() => {
    return getChildFolders(null, allItems);
  }, [allItems]);

  // Get root-level items (non-folders not in any folder)
  const rootItems = useMemo(() => {
    return allItems.filter(item =>
      item.type !== 'folder' && !item.folderId
    );
  }, [allItems]);

  // Calculate disabled folders (can't move a folder into itself or its descendants)
  const disabledFolderIds = useMemo(() => {
    const disabled = new Set<string>();

    // For bulk moves, check all items
    itemsToMove.forEach((itemToCheck) => {
      if (itemToCheck.type === "folder") {
        // Can't move a folder into itself
        disabled.add(itemToCheck.id);

        // Can't move a folder into any of its descendants
        allItems.forEach((potentialDescendant) => {
          if (
            potentialDescendant.type === "folder" &&
            isDescendantOf(potentialDescendant.id, itemToCheck.id, allItems)
          ) {
            disabled.add(potentialDescendant.id);
          }
        });
      }
    });

    return disabled;
  }, [itemsToMove, allItems]);

  const handleToggleExpand = useCallback((folderId: string) => {
    setExpandedFolders((prev) => {
      const next = new Set(prev);
      if (next.has(folderId)) {
        next.delete(folderId);
      } else {
        next.add(folderId);
      }
      return next;
    });
  }, []);

  const handleSelectRoot = useCallback(() => {
    setSelectedFolderId(null);
  }, []);

  const handleMove = useCallback(() => {
    if (isBulkMove && onMoveMultiple) {
      const itemIds = itemsToMove.map(i => i.id);
      onMoveMultiple(itemIds, selectedFolderId);
    } else if (!isBulkMove) {
      // Single item move - use onMove callback
      onMove(selectedFolderId);
    }
    onOpenChange(false);
  }, [isBulkMove, itemsToMove, selectedFolderId, onMove, onMoveMultiple, onOpenChange]);

  // Check if the selection has changed from the original location
  const hasChanged = useMemo(() => {
    if (isBulkMove) {
      // For bulk moves, check if any item's folderId differs from selected destination
      return itemsToMove.some(i => (i.folderId ?? null) !== selectedFolderId);
    } else if (item) {
      return selectedFolderId !== (item.folderId ?? null);
    }
    return false;
  }, [isBulkMove, itemsToMove, item, selectedFolderId]);

  // Determine dialog title and description
  const dialogTitle = useMemo(() => {
    if (isBulkMove) {
      const count = itemsToMove.length;
      return `Move ${count} ${count === 1 ? 'item' : 'items'}`;
    } else if (item) {
      return "Move item";
    }
    return "Move item";
  }, [isBulkMove, itemsToMove, item]);

  const dialogDescription = useMemo(() => {
    if (isBulkMove) {
      return "Select a destination folder for the selected items.";
    } else if (item) {
      const itemTypeLabel = item.type === "folder" ? "folder" : "item";
      return `Select a destination folder for this ${itemTypeLabel}.`;
    }
    return "Select a destination folder.";
  }, [isBulkMove, itemsToMove, item]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md" onClick={(e) => e.stopPropagation()}>
        <DialogHeader className="min-w-0">
          <DialogTitle className="truncate pr-12">{dialogTitle}</DialogTitle>
          <DialogDescription>
            {dialogDescription}
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="max-h-[300px] pr-4 w-full min-w-0">
          <div className="space-y-1">
            {/* Workspace Root option */}
            <div
              className={cn(
                "flex items-center gap-2 px-2 py-1.5 rounded-md cursor-pointer transition-colors w-full overflow-hidden",
                selectedFolderId === null && "bg-primary/20 border border-primary/40",
                selectedFolderId !== null && "hover:bg-accent"
              )}
              onClick={handleSelectRoot}
            >
              <IconRenderer
                icon={workspaceIcon}
                className="size-4 flex-shrink-0"
                style={{
                  color: workspaceColor || undefined,
                }}
              />
              <div className="flex-1 min-w-0">
                <span className="block text-sm font-medium truncate pr-2">{workspaceName}</span>
              </div>
              {selectedFolderId === null && (
                <Check className="size-4 text-primary flex-shrink-0" />
              )}
            </div>

            {/* Folder tree */}
            {rootFolders.map((folder) => (
              <FolderTreeItem
                key={folder.id}
                folder={folder}
                allItems={allItems}
                selectedFolderId={selectedFolderId}
                onSelect={setSelectedFolderId}
                disabledFolderIds={disabledFolderIds}
                expandedFolders={expandedFolders}
                onToggleExpand={handleToggleExpand}
                level={0}
              />
            ))}

            {/* Root-level items (non-folders, not selectable) */}
            {rootItems.map((item) => (
              <div
                key={item.id}
                className={cn(
                  "flex items-center gap-2 px-2 py-1.5 rounded-md opacity-60 w-full overflow-hidden",
                  "cursor-not-allowed"
                )}
                style={{ paddingLeft: "8px" }}
              >
                {getCardTypeIcon(item.type)}
                <div className="flex-1 min-w-0">
                  <span className="block text-sm truncate text-muted-foreground pr-2">
                    {item.name || "Untitled"}
                  </span>
                </div>
              </div>
            ))}

            {/* Empty state */}
            {rootFolders.length === 0 && rootItems.length === 0 && (
              <div className="text-center py-8 text-muted-foreground">
                <FolderIcon className="size-12 mx-auto mb-2 opacity-50" />
                <p className="text-sm">No folders in this workspace</p>
                <p className="text-xs mt-1">Create a folder to organize your items</p>
              </div>
            )}
          </div>
        </ScrollArea>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleMove} disabled={!hasChanged}>
            Move
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

