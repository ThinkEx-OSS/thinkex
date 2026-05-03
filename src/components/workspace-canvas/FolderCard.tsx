"use client";

import { useDroppable } from "@dnd-kit/react";
import { memo, useState, useCallback, useEffect, useMemo } from "react";
import { type ColorResult } from "react-color";
import { cn } from "@/lib/utils";
import type { Item } from "@/lib/workspace-state/types";
import {
  getCardColorCSS,
  getCardAccentColor,
  type CardColor,
} from "@/lib/workspace-state/colors";
import { useTheme } from "next-themes";
import { useUIStore } from "@/lib/stores/ui-store";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { toast } from "sonner";
import {
  WorkspaceCardContextMenuItems,
  WorkspaceCardControls,
} from "./WorkspaceCardActions";
import { FolderDeleteDialog, SharedCardDialogs } from "./CardDialogs";
import { useCardActionState } from "./useCardActionState";

interface FolderCardProps {
  item: Item;
  itemCount: number;
  allItems: Item[];
  workspaceName: string;
  workspaceIcon?: string | null;
  workspaceColor?: string | null;
  onOpenFolder: (folderId: string) => void;
  onUpdateItem: (itemId: string, updates: Partial<Item>) => void;
  onDeleteItem: (itemId: string) => void;
  onDeleteFolderWithContents?: (folderId: string) => void;
  onMoveItem?: (itemId: string, folderId: string | null) => void;
  itemDropTargetId?: string;
}

function FolderCardComponent({
  item,
  itemCount,
  allItems,
  workspaceName,
  workspaceIcon,
  workspaceColor,
  onOpenFolder,
  onUpdateItem,
  onDeleteItem,
  onDeleteFolderWithContents,
  onMoveItem,
  itemDropTargetId,
}: FolderCardProps) {
  const {
    isColorPickerOpen,
    setIsColorPickerOpen,
    showDeleteDialog,
    setShowDeleteDialog,
    showMoveDialog,
    setShowMoveDialog,
    showRenameDialog,
    setShowRenameDialog,
    openColorPicker,
    openDeleteDialog,
    openMoveDialog,
    openRenameDialog,
  } = useCardActionState();
  const [deleteOption, setDeleteOption] = useState<"keep" | "delete" | null>(
    null,
  );

  const isSelected = useUIStore((state) => state.selectedCardIds.has(item.id));
  const onToggleSelection = useUIStore((state) => state.toggleCardSelection);
  const { resolvedTheme } = useTheme();

  const folderColor = item.color || "#6366F1";

  const pointerOnlyCollision = useMemo(
    () =>
      ({
        dragOperation,
        droppable,
      }: {
        dragOperation: {
          source?: { id?: string | number } | null;
          position: { current: { x: number; y: number } | null };
        };
        droppable: {
          id: string | number;
          shape?: {
            containsPoint: (point: { x: number; y: number }) => boolean;
            center: { x: number; y: number };
          } | null;
        };
      }) => {
        if (dragOperation.source?.id === item.id) return null;
        const pointer = dragOperation.position.current;
        if (!pointer || !droppable.shape) return null;
        if (!droppable.shape.containsPoint(pointer)) return null;
        const cx = droppable.shape.center.x - pointer.x;
        const cy = droppable.shape.center.y - pointer.y;
        return {
          id: droppable.id,
          value: 1 / Math.sqrt(cx * cx + cy * cy),
          type: 2,
          priority: 3,
        };
      },
    [item.id],
  );

  const { ref: dropTargetRef, isDropTarget: isItemDropTarget } = useDroppable({
    id: itemDropTargetId ?? `folder-drop:${item.id}`,
    accept: ["item", "folder"],
    collisionPriority: 4,
    collisionDetector: pointerOnlyCollision,
    data: {
      kind: "folder-card-drop-target",
      folderId: item.id,
    },
  });

  useEffect(() => {
    if (!showDeleteDialog) {
      setDeleteOption(null);
    }
  }, [showDeleteDialog]);

  const isInteractiveTarget = useCallback((target: HTMLElement) => {
    return Boolean(
      target.closest("button") ||
        target.closest("input") ||
        target.closest("textarea") ||
        target.closest("select") ||
        target.closest("a") ||
        target.closest("label") ||
        target.closest('[role="menuitem"]') ||
        target.closest('[data-slot="dropdown-menu-content"]') ||
        target.closest('[data-slot="dropdown-menu-trigger"]') ||
        target.closest('[data-slot="popover-content"]') ||
        target.closest('[data-slot="popover"]') ||
        target.closest('[data-slot="dialog-content"]') ||
        target.closest('[data-slot="dialog-close"]') ||
        target.closest('[data-slot="dialog-overlay"]'),
    );
  }, []);

  const handleClick = useCallback(
    (e: React.MouseEvent) => {
      const target = e.target as HTMLElement;
      if (isInteractiveTarget(target)) {
        return;
      }

      const selection = window.getSelection();
      if (selection && selection.toString().length > 0) {
        return;
      }

      if (e.shiftKey) {
        e.stopPropagation();
        onToggleSelection(item.id);
        return;
      }

      onOpenFolder(item.id);
    },
    [isInteractiveTarget, item.id, onOpenFolder, onToggleSelection],
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLElement>) => {
      if (e.key !== "Enter" && e.key !== " ") {
        return;
      }

      const target = e.target as HTMLElement;
      if (isInteractiveTarget(target)) {
        return;
      }

      e.preventDefault();

      if (e.shiftKey) {
        onToggleSelection(item.id);
        return;
      }

      onOpenFolder(item.id);
    },
    [isInteractiveTarget, item.id, onOpenFolder, onToggleSelection],
  );

  const handleColorChange = useCallback(
    (color: ColorResult) => {
      onUpdateItem(item.id, { color: color.hex as CardColor });
      setIsColorPickerOpen(false);
    },
    [item.id, onUpdateItem, setIsColorPickerOpen],
  );

  const handleRename = useCallback(
    (newName: string) => {
      onUpdateItem(item.id, { name: newName });
      toast.success("Folder renamed");
    },
    [item.id, onUpdateItem],
  );

  const handleDelete = useCallback(() => {
    if (deleteOption === "delete" && onDeleteFolderWithContents) {
      onDeleteFolderWithContents(item.id);
    } else {
      onDeleteItem(item.id);
    }
    setShowDeleteDialog(false);
    setDeleteOption(null);
  }, [
    deleteOption,
    item.id,
    onDeleteFolderWithContents,
    onDeleteItem,
    setShowDeleteDialog,
  ]);

  const bodyBgColor = getCardColorCSS(folderColor, 0.25);
  const tabBgColor = getCardColorCSS(folderColor, 0.35);
  const borderColor = isSelected
    ? "rgba(255, 255, 255, 0.8)"
    : getCardAccentColor(folderColor, 0.5);
  const folderTitle = item.name || "Folder";
  const selectedOutlineWidth = isSelected ? "3px" : "1px";
  const selectedFolderGlow = isSelected
    ? resolvedTheme === "dark"
      ? "0 0 10px rgba(255, 255, 255, 0.2)"
      : "0 0 2px rgba(0, 0, 0, 0.7), 0 0 6px rgba(0, 0, 0, 0.35)"
    : undefined;

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <div
          ref={dropTargetRef as (element: HTMLDivElement | null) => void}
          className="group flex size-full min-h-0 flex-col rounded-md transition-[box-shadow,transform] duration-150"
          onClick={handleClick}
          onKeyDown={handleKeyDown}
          role="button"
          tabIndex={0}
        >
          <div
            id={`item-${item.id}`}
            className="relative min-h-0 flex-1 cursor-pointer overflow-hidden transition-all duration-200"
          >
            <div
              className="absolute left-0 top-0 h-[10%] w-[35%] rounded-t-md border border-b-0"
              style={{
                backgroundColor: tabBgColor,
                borderColor,
                borderTopWidth: selectedOutlineWidth,
                borderLeftWidth: selectedOutlineWidth,
                borderRightWidth: selectedOutlineWidth,
                borderBottomWidth: 0,
                boxShadow: selectedFolderGlow,
                transition: "border-color 150ms ease-out",
              }}
            />

            <div
              className="absolute bottom-0 left-0 right-0 top-[10%] rounded-md rounded-tl-none border"
              style={{
                backgroundColor: bodyBgColor,
                borderColor,
                borderWidth: selectedOutlineWidth,
                boxShadow: selectedFolderGlow,
                transition: "border-color 150ms ease-out",
              }}
            />

            <div
              className={cn(
                "pointer-events-none absolute bottom-0 left-0 right-0 top-[10%] rounded-md rounded-tl-none transition-colors duration-200",
                isItemDropTarget ? "opacity-0" : "bg-white/0 group-hover:bg-white/5",
              )}
            />

            {isItemDropTarget ? (
              <div className="pointer-events-none absolute inset-0 z-10 rounded-md ring-1 ring-inset ring-blue-500/45 bg-blue-500/12 dark:ring-blue-400/55 dark:bg-blue-400/15" />
            ) : null}
          </div>

          <div className="flex min-w-0 items-start gap-2 px-1 pt-2">
            <div
              className="min-w-0 flex-1 truncate text-sm font-medium leading-snug text-foreground underline-offset-2 hover:underline"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                openRenameDialog();
              }}
            >
              {folderTitle}
            </div>
            <WorkspaceCardControls
              isSelected={isSelected}
              canMove={Boolean(onMoveItem)}
              selectionLabel="folder"
              settingsLabel="Folder settings"
              onToggleSelection={() => onToggleSelection(item.id)}
              onOpenRename={openRenameDialog}
              onOpenMove={openMoveDialog}
              onOpenColorPicker={openColorPicker}
              onDelete={openDeleteDialog}
            />
          </div>

          <SharedCardDialogs
            item={item}
            allItems={allItems}
            workspaceName={workspaceName}
            workspaceIcon={workspaceIcon}
            workspaceColor={workspaceColor}
            isColorPickerOpen={isColorPickerOpen}
            onColorPickerOpenChange={setIsColorPickerOpen}
            showMoveDialog={showMoveDialog}
            onMoveDialogChange={setShowMoveDialog}
            showRenameDialog={showRenameDialog}
            onRenameDialogChange={setShowRenameDialog}
            onColorChange={handleColorChange}
            onRename={handleRename}
            onMove={
              onMoveItem
                ? (folderId) => {
                    onMoveItem(item.id, folderId);
                    toast.success("Folder moved");
                  }
                : undefined
            }
            colorDialogTitle="Choose Folder Color"
          />
          <FolderDeleteDialog
            open={showDeleteDialog}
            onOpenChange={setShowDeleteDialog}
            itemName={item.name}
            itemCount={itemCount}
            canDeleteContents={Boolean(onDeleteFolderWithContents)}
            deleteOption={deleteOption}
            onDeleteOptionChange={setDeleteOption}
            onConfirm={handleDelete}
            onCancel={() => setDeleteOption(null)}
          />
        </div>
      </ContextMenuTrigger>

      <ContextMenuContent className="w-48">
        <WorkspaceCardContextMenuItems
          canMove={Boolean(onMoveItem)}
          onOpenRename={openRenameDialog}
          onOpenMove={openMoveDialog}
          onOpenColorPicker={openColorPicker}
          onDelete={openDeleteDialog}
        />
      </ContextMenuContent>
    </ContextMenu>
  );
}

export const FolderCard = memo(FolderCardComponent);
