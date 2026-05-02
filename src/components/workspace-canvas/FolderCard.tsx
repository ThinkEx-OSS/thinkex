"use client";

import { useDroppable } from "@dnd-kit/react";
import { memo, useState, useCallback, useEffect, type ReactNode } from "react";
import {
  MoreVertical,
  Trash2,
  Palette,
  CheckCircle2,
  FolderInput,
  X,
  Pencil,
} from "lucide-react";
import ItemHeader from "@/components/workspace-canvas/ItemHeader";
import { SwatchesPicker, ColorResult } from "react-color";
import { cn } from "@/lib/utils";
import type { Item } from "@/lib/workspace-state/types";
import {
  getCardColorCSS,
  getCardAccentColor,
  SWATCHES_COLOR_GROUPS,
  type CardColor,
} from "@/lib/workspace-state/colors";
import { useTheme } from "next-themes";

import { useUIStore } from "@/lib/stores/ui-store";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import MoveToDialog from "@/components/modals/MoveToDialog";
import RenameDialog from "@/components/modals/RenameDialog";
import { toast } from "sonner";

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
  dragHandle?: ReactNode;
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
  dragHandle,
  itemDropTargetId,
}: FolderCardProps) {
  const [showColorPicker, setShowColorPicker] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteOption, setDeleteOption] = useState<"keep" | "delete" | null>(
    null,
  );
  const [showMoveDialog, setShowMoveDialog] = useState(false);
  const [showRenameDialog, setShowRenameDialog] = useState(false);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [shouldAutoFocus, setShouldAutoFocus] = useState(false);

  const isSelected = useUIStore((state) => state.selectedCardIds.has(item.id));
  const onToggleSelection = useUIStore((state) => state.toggleCardSelection);

  const folderColor = item.color || "#6366F1";
  const { ref: dropTargetRef, isDropTarget: isItemDropTarget } = useDroppable({
    id: itemDropTargetId ?? `folder-drop:${item.id}`,
    accept: "item",
    collisionPriority: 1,
    data: {
      kind: "folder-card-drop-target",
      folderId: item.id,
    },
  });

  useEffect(() => {
    if (item.name === "New Folder") {
      setShouldAutoFocus(true);
      const element = document.getElementById(`item-${item.id}`);
      if (element) {
        setTimeout(() => {
          element.scrollIntoView({ behavior: "smooth", block: "center" });
        }, 100);
      }
    }
  }, [item.id, item.name]);

  const isInteractiveTarget = useCallback((target: HTMLElement) => {
    return Boolean(
      target.closest("button") ||
      target.closest("input") ||
      target.closest("textarea") ||
      target.closest("select") ||
      target.closest("a") ||
      target.closest("label") ||
      target.closest('[role="menuitem"]') ||
      target.closest('[contenteditable="true"]') ||
      target.closest('[data-slot="dropdown-menu-content"]') ||
      target.closest('[data-slot="dropdown-menu-trigger"]') ||
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

      if (isEditingTitle) {
        return;
      }

      onOpenFolder(item.id);
    },
    [
      isEditingTitle,
      isInteractiveTarget,
      item.id,
      onOpenFolder,
      onToggleSelection,
    ],
  );

  const handleColorChange = useCallback(
    (color: ColorResult) => {
      onUpdateItem(item.id, { color: color.hex as CardColor });
      setShowColorPicker(false);
    },
    [item.id, onUpdateItem],
  );

  const handleNameChange = useCallback(
    (v: string) => {
      onUpdateItem(item.id, { name: v });
    },
    [item.id, onUpdateItem],
  );

  const handleNameCommit = useCallback(
    (v: string) => {
      onUpdateItem(item.id, { name: v });
    },
    [item.id, onUpdateItem],
  );

  const handleDelete = useCallback(() => {
    if (deleteOption === "delete" && onDeleteFolderWithContents) {
      onDeleteFolderWithContents(item.id);
    } else {
      onDeleteItem(item.id);
    }
    setShowDeleteConfirm(false);
    setDeleteOption(null);
  }, [item.id, onDeleteItem, onDeleteFolderWithContents, deleteOption]);

  const handleRename = useCallback(
    (newName: string) => {
      onUpdateItem(item.id, { name: newName });
      toast.success("Folder renamed");
    },
    [item.id, onUpdateItem],
  );

  useEffect(() => {
    if (!showDeleteConfirm) {
      setDeleteOption(null);
    }
  }, [showDeleteConfirm]);

  const { resolvedTheme } = useTheme();

  const bodyBgColor = getCardColorCSS(folderColor, 0.25);
  const tabBgColor = getCardColorCSS(folderColor, 0.35);
  const borderColor = isSelected
    ? "rgba(255, 255, 255, 0.8)"
    : getCardAccentColor(folderColor, 0.5);
  const selectedRingStyle = isSelected
    ? {
        boxShadow:
          resolvedTheme === "dark"
            ? "0 0 0 3px rgba(255, 255, 255, 0.8)"
            : "0 0 0 3px rgba(255, 255, 255, 0.8), 0 0 2px rgba(0, 0, 0, 0.9), 0 0 4px rgba(0, 0, 0, 0.8), 0 0 8px rgba(0, 0, 0, 0.6), 0 0 12px rgba(0, 0, 0, 0.4)",
      }
    : undefined;

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <div
          ref={dropTargetRef as (element: HTMLDivElement | null) => void}
          className={cn(
            "group size-full rounded-md transition-[box-shadow,transform] duration-150",
            isItemDropTarget &&
              "ring-2 ring-primary/60 ring-offset-2 ring-offset-background",
          )}
          style={selectedRingStyle}
          onClick={handleClick}
        >
          <div
            id={`item-${item.id}`}
            className="relative size-full cursor-pointer group/folder transition-all duration-200 overflow-hidden"
          >
            <div
              className="absolute top-0 left-0 h-[10%] w-[35%] rounded-t-md border border-b-0"
              style={{
                backgroundColor: tabBgColor,
                borderColor,
                borderTopWidth: "1px",
                borderLeftWidth: "1px",
                borderRightWidth: "1px",
                borderBottomWidth: 0,
                transition: "border-color 150ms ease-out",
              }}
            />

            <div
              className="absolute top-[10%] left-0 right-0 bottom-0 rounded-md rounded-tl-none border"
              style={{
                backgroundColor: bodyBgColor,
                borderColor,
                borderWidth: "1px",
                transition: "border-color 150ms ease-out",
              }}
            />

            <button
              type="button"
              aria-label={isSelected ? "Deselect folder" : "Select folder"}
              title={isSelected ? "Deselect folder" : "Select folder"}
              className={`absolute right-12 top-3 inline-flex h-8 w-8 items-center justify-center rounded-xl text-white/90 hover:text-white hover:scale-110 hover:shadow-lg transition-all duration-200 z-10 cursor-pointer ${isEditingTitle ? "opacity-0 pointer-events-none" : "opacity-0 group-hover/folder:opacity-100"}`}
              style={{
                backgroundColor: isSelected
                  ? "rgba(239, 68, 68, 0.3)"
                  : "rgba(255, 255, 255, 0.1)",
                backdropFilter: "blur(8px)",
              }}
              onMouseDown={(e) => {
                e.stopPropagation();
                e.preventDefault();
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = isSelected
                  ? "rgba(239, 68, 68, 0.5)"
                  : "rgba(0, 0, 0, 0.5)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = isSelected
                  ? "rgba(239, 68, 68, 0.3)"
                  : "rgba(255, 255, 255, 0.1)";
              }}
              onClick={(e) => {
                e.stopPropagation();
                onToggleSelection(item.id);
              }}
            >
              {isSelected ? (
                <X className="h-4 w-4" />
              ) : (
                <CheckCircle2 className="h-4 w-4" />
              )}
            </button>

            <DropdownMenu
              open={isDropdownOpen}
              onOpenChange={setIsDropdownOpen}
            >
              <DropdownMenuTrigger asChild className="cursor-pointer">
                <button
                  type="button"
                  aria-label="Folder settings"
                  title="Folder settings"
                  className={`absolute right-3 top-3 inline-flex h-8 w-8 items-center justify-center rounded-xl text-white/90 hover:text-white hover:scale-110 hover:shadow-lg transition-all duration-200 z-10 cursor-pointer ${isEditingTitle ? "opacity-0 pointer-events-none" : isDropdownOpen ? "opacity-100" : "opacity-0 group-hover/folder:opacity-100"}`}
                  style={{
                    backgroundColor: "rgba(255, 255, 255, 0.1)",
                    backdropFilter: "blur(8px)",
                  }}
                  onMouseDown={(e) => {
                    e.stopPropagation();
                    e.preventDefault();
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.backgroundColor =
                      "rgba(0, 0, 0, 0.5)";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor =
                      "rgba(255, 255, 255, 0.1)";
                  }}
                  onClick={(e) => e.stopPropagation()}
                >
                  <MoreVertical className="h-4 w-4" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                align="end"
                className="w-48"
                onClick={(e) => e.stopPropagation()}
              >
                <DropdownMenuItem
                  onClick={(e) => {
                    e.stopPropagation();
                    setShowRenameDialog(true);
                  }}
                >
                  <Pencil className="mr-2 h-4 w-4" />
                  Rename
                </DropdownMenuItem>
                {onMoveItem && (
                  <>
                    <DropdownMenuItem
                      onClick={(e) => {
                        e.stopPropagation();
                        setShowMoveDialog(true);
                      }}
                    >
                      <FolderInput className="mr-2 h-4 w-4" />
                      Move to
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                  </>
                )}
                <DropdownMenuItem
                  onClick={(e) => {
                    e.stopPropagation();
                    setShowColorPicker(true);
                  }}
                >
                  <Palette className="mr-2 h-4 w-4" />
                  Change Color
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={(e) => {
                    e.stopPropagation();
                    setShowDeleteConfirm(true);
                  }}
                  className="text-destructive focus:text-destructive"
                >
                  <Trash2 className="mr-2 h-4 w-4" />
                  Delete Folder
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

            <div className="relative h-full flex flex-col p-4 pt-[14%]">
              <div className="flex-1 flex flex-col justify-center overflow-visible min-h-0">
                <ItemHeader
                  id={item.id}
                  name={item.name}
                  subtitle=""
                  description=""
                  onNameChange={handleNameChange}
                  onNameCommit={(value) => {
                    handleNameCommit(value);
                    if (shouldAutoFocus) {
                      setShouldAutoFocus(false);
                    }
                  }}
                  onSubtitleChange={() => {}}
                  onTitleFocus={() => setIsEditingTitle(true)}
                  onTitleBlur={() => setIsEditingTitle(false)}
                  readOnly={false}
                  noMargin={true}
                  autoFocus={shouldAutoFocus}
                />
                <p className="text-sm text-muted-foreground mt-1">
                  {itemCount} {itemCount === 1 ? "item" : "items"}
                </p>
              </div>
            </div>

            <div
              className={cn(
                "absolute top-[10%] left-0 right-0 bottom-0 rounded-md rounded-tl-none bg-white/0 transition-colors duration-200 pointer-events-none",
                isItemDropTarget
                  ? "bg-primary/12"
                  : "group-hover/folder:bg-white/5",
              )}
            />

            {isItemDropTarget ? (
              <div className="pointer-events-none absolute inset-x-4 bottom-4 z-20 flex items-center justify-center gap-2 rounded-full bg-background/90 px-3 py-1.5 text-xs font-medium text-foreground shadow-lg backdrop-blur-sm">
                <FolderInput className="h-3.5 w-3.5 text-primary" />
                <span>Move into folder</span>
              </div>
            ) : null}

            {dragHandle}
          </div>

          <Dialog open={showColorPicker} onOpenChange={setShowColorPicker}>
            <DialogContent
              className="w-auto max-w-fit p-6"
              onClick={(e) => e.stopPropagation()}
              onMouseDown={(e) => e.stopPropagation()}
            >
              <DialogHeader>
                <DialogTitle>Choose Folder Color</DialogTitle>
              </DialogHeader>
              <div
                className="flex justify-center color-picker-wrapper"
                onClick={(e) => e.stopPropagation()}
                onMouseDown={(e) => e.stopPropagation()}
              >
                <SwatchesPicker
                  color={folderColor}
                  onChange={handleColorChange}
                  colors={SWATCHES_COLOR_GROUPS}
                />
              </div>
            </DialogContent>
          </Dialog>

          <AlertDialog
            open={showDeleteConfirm}
            onOpenChange={setShowDeleteConfirm}
          >
            <AlertDialogContent
              onClick={(e) => e.stopPropagation()}
              onMouseDown={(e) => e.stopPropagation()}
            >
              <AlertDialogHeader>
                <AlertDialogTitle>Delete Folder</AlertDialogTitle>
                <AlertDialogDescription asChild>
                  <div className="space-y-4">
                    <div>
                      Choose what happens to the {itemCount}{" "}
                      {itemCount === 1 ? "item" : "items"} in &quot;{item.name}
                      &quot;:
                    </div>
                    <div className="space-y-3 pt-2">
                      <label className="flex items-start space-x-3 cursor-pointer group">
                        <input
                          type="radio"
                          name="deleteOption"
                          value="keep"
                          checked={deleteOption === "keep"}
                          onChange={() => setDeleteOption("keep")}
                          className="mt-1 h-4 w-4 text-primary focus:ring-primary border-gray-300"
                          onClick={(e) => e.stopPropagation()}
                        />
                        <div className="flex-1">
                          <div className="font-medium text-sm">Keep items</div>
                          <div className="text-xs text-muted-foreground">
                            Move items out of folder before deleting
                          </div>
                        </div>
                      </label>
                      <label
                        className={`flex items-start space-x-3 group ${onDeleteFolderWithContents ? "cursor-pointer" : "cursor-not-allowed opacity-50"}`}
                      >
                        <input
                          type="radio"
                          name="deleteOption"
                          value="delete"
                          checked={deleteOption === "delete"}
                          onChange={() => setDeleteOption("delete")}
                          disabled={!onDeleteFolderWithContents}
                          className="mt-1 h-4 w-4 text-destructive focus:ring-destructive border-gray-300 disabled:opacity-50"
                          onClick={(e) => e.stopPropagation()}
                        />
                        <div className="flex-1">
                          <div className="font-medium text-sm text-destructive">
                            Delete items
                          </div>
                          <div className="text-xs text-muted-foreground">
                            Delete folder and all {itemCount}{" "}
                            {itemCount === 1 ? "item" : "items"} inside
                          </div>
                        </div>
                      </label>
                    </div>
                  </div>
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel
                  onClick={(e) => {
                    e.stopPropagation();
                    setDeleteOption(null);
                  }}
                  onMouseDown={(e) => e.stopPropagation()}
                >
                  Cancel
                </AlertDialogCancel>
                <AlertDialogAction
                  onClick={(e) => {
                    e.stopPropagation();
                    handleDelete();
                  }}
                  onMouseDown={(e) => e.stopPropagation()}
                  disabled={deleteOption === null}
                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Delete
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>

          <RenameDialog
            open={showRenameDialog}
            onOpenChange={setShowRenameDialog}
            currentName={item.name}
            itemType="folder"
            onRename={handleRename}
          />

          {onMoveItem && (
            <MoveToDialog
              open={showMoveDialog}
              onOpenChange={setShowMoveDialog}
              item={item}
              allItems={allItems}
              workspaceName={workspaceName}
              workspaceIcon={workspaceIcon}
              workspaceColor={workspaceColor}
              onMove={(folderId) => {
                onMoveItem(item.id, folderId);
                toast.success("Folder moved");
              }}
            />
          )}
        </div>
      </ContextMenuTrigger>

      <ContextMenuContent className="w-48">
        <ContextMenuItem onSelect={() => setShowRenameDialog(true)}>
          <Pencil className="mr-2 h-4 w-4" />
          <span>Rename</span>
        </ContextMenuItem>
        {onMoveItem && (
          <>
            <ContextMenuItem onSelect={() => setShowMoveDialog(true)}>
              <FolderInput className="mr-2 h-4 w-4" />
              <span>Move to</span>
            </ContextMenuItem>
            <ContextMenuSeparator />
          </>
        )}
        <ContextMenuItem onSelect={() => setShowColorPicker(true)}>
          <Palette className="mr-2 h-4 w-4" />
          <span>Change Color</span>
        </ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem
          onSelect={() => setShowDeleteConfirm(true)}
          className="text-destructive focus:text-destructive"
        >
          <Trash2 className="mr-2 h-4 w-4" />
          <span>Delete Folder</span>
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
}

export const FolderCard = memo(FolderCardComponent);
