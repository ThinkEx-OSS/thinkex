"use client";

import { memo, useState, useCallback, useEffect, useRef } from "react";
import { MoreVertical, Trash2, Palette, CheckCircle2, FolderInput, X, Pencil } from "lucide-react";
import ItemHeader from "@/components/workspace-canvas/ItemHeader";
import { cn } from "@/lib/utils";
import type { Item } from "@/lib/workspace-state/types";
import { getCardColorCSS, getCardAccentColor } from "@/lib/workspace-state/colors";
import { useTheme } from "next-themes";
import { toast } from "sonner";

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
import { WorkspaceCardDialogs } from "./WorkspaceCardDialogs";
import { useItemActionDialogs } from "@/hooks/workspace/use-item-action-dialogs";

interface FolderCardProps {
  item: Item; // Folder-type item
  itemCount: number;
  allItems: Item[]; // All items for the move dialog tree
  workspaceName: string;
  workspaceIcon?: string | null;
  workspaceColor?: string | null;
  onOpenFolder: (folderId: string) => void;
  onUpdateItem: (itemId: string, updates: Partial<Item>) => void;
  onDeleteItem: (itemId: string) => void;
  onDeleteFolderWithContents?: (folderId: string) => void; // Callback to delete folder and all items inside
  onMoveItem?: (itemId: string, folderId: string | null) => void; // Callback to move folder to another location
}

/**
 * FolderCard - A folder-shaped card that displays in the workspace grid
 * Now uses Item type with type: 'folder' instead of separate Folder type
 */
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
}: FolderCardProps) {
  const actions = useItemActionDialogs({
    item,
    itemCount,
    onDeleteItem,
    onDeleteFolderWithContents,
    onUpdateItem,
    onMoveItem: onMoveItem ? (id, folderId) => { onMoveItem(id, folderId); toast.success('Folder moved'); } : undefined,
  });

  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [isDragHover, setIsDragHover] = useState(false);
  const [selectedCount, setSelectedCount] = useState<number | null>(null);
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [shouldAutoFocus, setShouldAutoFocus] = useState(false);

  // Subscribe directly to this folder's selection state from the store
  const isSelected = useUIStore(
    (state) => state.selectedCardIds.has(item.id)
  );
  const   onToggleSelection = useUIStore((state) => state.toggleCardSelection);

  // Track drag movement to prevent opening folder after drag
  const mouseDownPosRef = useRef<{ x: number; y: number } | null>(null);
  const hasMovedRef = useRef<boolean>(false);
  const DRAG_THRESHOLD = 5; // pixels

  const folderColor = item.color || "#6366F1"; // Default to indigo

  // Auto-focus and scroll into view for newly created folders (name is "New Folder")
  useEffect(() => {
    if (item.name === "New Folder") {
      setShouldAutoFocus(true);
      // Scroll the folder card into view
      const element = document.getElementById(`item-${item.id}`);
      if (element) {
        setTimeout(() => {
          element.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }, 100);
      }
    }
  }, [item.id, item.name]);

  // Listen for drag hover events
  useEffect(() => {
    const handleDragHover = (e: Event) => {
      const customEvent = e as CustomEvent;
      const { folderId, isHovering, selectedCount: count } = customEvent.detail || {};
      if (folderId === item.id) {
        setIsDragHover(isHovering);
        setSelectedCount(count ?? null);
      } else {
        setIsDragHover(false);
        setSelectedCount(null);
      }
    };

    window.addEventListener('folder-drag-hover', handleDragHover);
    return () => {
      window.removeEventListener('folder-drag-hover', handleDragHover);
    };
  }, [item.id]);

  // Handle mouse down - track initial position for drag detection
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    // Don't track if clicking on interactive elements
    const target = e.target as HTMLElement;
    if (
      target.closest('button') ||
      target.closest('input') ||
      target.closest('textarea') ||
      target.closest('[role="menuitem"]')
    ) {
      return;
    }
    mouseDownPosRef.current = { x: e.clientX, y: e.clientY };
    hasMovedRef.current = false;
  }, []);

  // Handle mouse move - detect if user moved beyond threshold
  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!mouseDownPosRef.current || hasMovedRef.current) return;

    const deltaX = Math.abs(e.clientX - mouseDownPosRef.current.x);
    const deltaY = Math.abs(e.clientY - mouseDownPosRef.current.y);

    if (deltaX > DRAG_THRESHOLD || deltaY > DRAG_THRESHOLD) {
      hasMovedRef.current = true;
    }
  }, []);

  // Handle click - only open folder if it wasn't a drag
  const handleClick = useCallback((e: React.MouseEvent) => {
    // Don't open if clicking on interactive elements
    const target = e.target as HTMLElement;
    if (
      target.closest('button') ||
      target.closest('[data-slot="dropdown-menu-content"]') ||
      target.closest('[data-slot="dropdown-menu-trigger"]') ||
      target.closest('[data-slot="dialog-content"]') ||
      target.closest('[data-slot="dialog-close"]') ||
      target.closest('[data-slot="dialog-overlay"]')
    ) {
      return;
    }

    // Shift+click toggles folder selection
    if (e.shiftKey) {
      e.stopPropagation();
      onToggleSelection(item.id);
      return;
    }

    // Don't open if user was dragging or is editing title
    if (hasMovedRef.current || isEditingTitle) {
      hasMovedRef.current = false;
      mouseDownPosRef.current = null;
      return;
    }

    mouseDownPosRef.current = null;
    onOpenFolder(item.id);
  }, [item.id, onOpenFolder, onToggleSelection, isEditingTitle]);

  // Handlers for inline title editing (like WorkspaceCard)
  const handleNameChange = useCallback((v: string) => {
    onUpdateItem(item.id, { name: v });
  }, [item.id, onUpdateItem]);

  const handleNameCommit = useCallback((v: string) => {
    onUpdateItem(item.id, { name: v });
  }, [item.id, onUpdateItem]);

  const { resolvedTheme } = useTheme();

  // Calculate colors using the same utilities as WorkspaceCard
  const bodyBgColor = getCardColorCSS(folderColor, 0.25); // Body is more transparent
  const tabBgColor = getCardColorCSS(folderColor, 0.35); // Tab is slightly less transparent
  const borderColor = isSelected ? 'rgba(255, 255, 255, 0.8)' : getCardAccentColor(folderColor, 0.5);
  // Selection ring on outer wrapper (like normal cards) – avoids overflow-hidden clipping
  // Light mode: match resize-handle style with layered dark shadow for visibility
  const selectedRingStyle = isSelected
    ? {
        boxShadow: resolvedTheme === 'dark'
          ? '0 0 0 3px rgba(255, 255, 255, 0.8)'
          : '0 0 0 3px rgba(255, 255, 255, 0.8), 0 0 2px rgba(0, 0, 0, 0.9), 0 0 4px rgba(0, 0, 0, 0.8), 0 0 8px rgba(0, 0, 0, 0.6), 0 0 12px rgba(0, 0, 0, 0.4)',
      }
    : undefined;

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <div
          className={cn(
            "group size-full rounded-md transition-[box-shadow] duration-150",
            isDragHover && "border-4 border-blue-500 rounded-md scale-105 z-50"
          )}
          style={selectedRingStyle}
          data-folder-id={item.id}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onClick={handleClick}
        >
          <div
            id={`item-${item.id}`}
            className="relative size-full cursor-pointer group/folder transition-all duration-200 overflow-hidden"
          >
            {/* Folder tab - top left, more transparent than body */}
            <div
              className="absolute top-0 left-0 h-[10%] w-[35%] rounded-t-md border border-b-0"
              style={{
                backgroundColor: tabBgColor,
                borderColor: borderColor,
                borderTopWidth: '1px',
                borderLeftWidth: '1px',
                borderRightWidth: '1px',
                borderBottomWidth: 0,
                transition: 'border-color 150ms ease-out',
              }}
            />

            {/* Main folder body - starts where tab ends, less transparent */}
            <div
              className="absolute top-[10%] left-0 right-0 bottom-0 rounded-md rounded-tl-none border"
              style={{
                backgroundColor: bodyBgColor,
                borderColor: borderColor,
                borderWidth: '1px',
                transition: 'border-color 150ms ease-out',
              }}
            />

            {/* Selection Button */}
            <button
              type="button"
              aria-label={isSelected ? 'Deselect folder' : 'Select folder'}
              title={isSelected ? 'Deselect folder' : 'Select folder'}
              className={`absolute right-12 top-3 inline-flex h-8 w-8 items-center justify-center rounded-xl text-white/90 hover:text-white hover:scale-110 hover:shadow-lg transition-all duration-200 z-10 cursor-pointer ${isEditingTitle ? 'opacity-0 pointer-events-none' : 'opacity-0 group-hover/folder:opacity-100'}`}
              style={{
                backgroundColor: isSelected ? 'rgba(239, 68, 68, 0.3)' : 'rgba(255, 255, 255, 0.1)',
                backdropFilter: 'blur(8px)'
              }}
              onMouseDown={(e) => {
                e.stopPropagation();
                e.preventDefault();
              }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLButtonElement).style.backgroundColor = isSelected ? 'rgba(239, 68, 68, 0.5)' : 'rgba(0, 0, 0, 0.5)';
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLButtonElement).style.backgroundColor = isSelected ? 'rgba(239, 68, 68, 0.3)' : 'rgba(255, 255, 255, 0.1)';
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

            {/* Options Menu */}
            <DropdownMenu open={isDropdownOpen} onOpenChange={setIsDropdownOpen}>
              <DropdownMenuTrigger asChild className="cursor-pointer">
                <button
                  type="button"
                  aria-label="Folder settings"
                  title="Folder settings"
                  className={`absolute right-3 top-3 inline-flex h-8 w-8 items-center justify-center rounded-xl text-white/90 hover:text-white hover:scale-110 hover:shadow-lg transition-all duration-200 z-10 cursor-pointer ${isEditingTitle ? 'opacity-0 pointer-events-none' : (isDropdownOpen ? 'opacity-100' : 'opacity-0 group-hover/folder:opacity-100')}`}
                  style={{
                    backgroundColor: 'rgba(255, 255, 255, 0.1)',
                    backdropFilter: 'blur(8px)'
                  }}
                  onMouseDown={(e) => {
                    e.stopPropagation();
                    e.preventDefault();
                  }}
                  onMouseEnter={(e) => {
                    (e.currentTarget as HTMLButtonElement).style.backgroundColor = 'rgba(0, 0, 0, 0.5)';
                  }}
                  onMouseLeave={(e) => {
                    (e.currentTarget as HTMLButtonElement).style.backgroundColor = 'rgba(255, 255, 255, 0.1)';
                  }}
                  onClick={(e) => e.stopPropagation()}
                >
                  <MoreVertical className="h-4 w-4" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48" onClick={(e) => e.stopPropagation()}>
                <DropdownMenuItem
                  onClick={(e) => {
                    e.stopPropagation();
                    actions.requestRename();
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
                        actions.requestMove();
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
                    actions.requestColorPicker();
                  }}
                >
                  <Palette className="mr-2 h-4 w-4" />
                  Change Color
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={(e) => {
                    e.stopPropagation();
                    actions.requestDelete();
                  }}
                  className="text-destructive focus:text-destructive"
                >
                  <Trash2 className="mr-2 h-4 w-4" />
                  Delete Folder
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

            {/* Content container */}
            <div className="relative h-full flex flex-col p-4 pt-[14%]">

              {/* Editable title - like WorkspaceCard */}
              <div className="flex-1 flex flex-col justify-center overflow-visible min-h-0">
                <ItemHeader
                  id={item.id}
                  name={item.name}
                  subtitle=""
                  description=""
                  onNameChange={handleNameChange}
                  onNameCommit={(value) => {
                    handleNameCommit(value);
                    // Clear auto-focus after first commit
                    if (shouldAutoFocus) {
                      setShouldAutoFocus(false);
                    }
                  }}
                  onSubtitleChange={() => { }}
                  onTitleFocus={() => setIsEditingTitle(true)}
                  onTitleBlur={() => setIsEditingTitle(false)}
                  readOnly={false}
                  noMargin={true}
                  autoFocus={shouldAutoFocus}
                />
                {/* Item count as subtext */}
                <p className="text-sm text-muted-foreground mt-1">
                  {itemCount} {itemCount === 1 ? "item" : "items"}
                </p>
              </div>
            </div>

            {/* Hover overlay - covers the main body area */}
            <div className="absolute top-[10%] left-0 right-0 bottom-0 rounded-md rounded-tl-none bg-white/0 group-hover/folder:bg-white/5 transition-colors duration-200 pointer-events-none" />

            {/* Drag hover overlay - shows when item is dragged over folder */}
            {isDragHover && (
              <div className="absolute inset-0 bg-blue-500/30 rounded-md flex items-center justify-center z-50 pointer-events-none">
                <div className="bg-blue-600/90 text-white px-4 py-2 rounded-lg shadow-lg font-semibold text-sm animate-pulse">
                  Move items here ({(selectedCount ?? 1)} {(selectedCount ?? 1) === 1 ? 'item' : 'items'})
                </div>
              </div>
            )}
          </div>

          <WorkspaceCardDialogs
            item={item}
            allItems={allItems}
            workspaceName={workspaceName}
            workspaceIcon={workspaceIcon}
            workspaceColor={workspaceColor}
            isColorPickerOpen={actions.showColorPicker}
            onColorPickerOpenChange={actions.setShowColorPicker}
            showDeleteDialog={actions.showDeleteDialog}
            onDeleteDialogChange={actions.setShowDeleteDialog}
            showMoveDialog={actions.showMoveDialog}
            onMoveDialogChange={actions.setShowMoveDialog}
            showRenameDialog={actions.showRenameDialog}
            onRenameDialogChange={actions.setShowRenameDialog}
            onColorChange={actions.handleColorChange}
            onDeleteConfirm={actions.confirmDelete}
            onRename={(newName) => { actions.handleRename(newName); toast.success("Folder renamed"); }}
            onMove={onMoveItem ? actions.handleMove : undefined}
            itemCount={itemCount}
            deleteOption={actions.deleteOption}
            onDeleteOptionChange={actions.setDeleteOption}
            canDeleteWithContents={Boolean(onDeleteFolderWithContents)}
          />
        </div>
      </ContextMenuTrigger>

      {/* Right-Click Context Menu */}
      <ContextMenuContent className="w-48">
        <ContextMenuItem onSelect={() => actions.requestRename()}>
          <Pencil className="mr-2 h-4 w-4" />
          <span>Rename</span>
        </ContextMenuItem>
        {onMoveItem && (
          <>
            <ContextMenuItem onSelect={() => actions.requestMove()}>
              <FolderInput className="mr-2 h-4 w-4" />
              <span>Move to</span>
            </ContextMenuItem>
            <ContextMenuSeparator />
          </>
        )}
        <ContextMenuItem onSelect={() => actions.requestColorPicker()}>
          <Palette className="mr-2 h-4 w-4" />
          <span>Change Color</span>
        </ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem
          onSelect={() => actions.requestDelete()}
          className="text-destructive focus:text-destructive"
        >
          <Trash2 className="mr-2 h-4 w-4" />
          <span>Delete Folder</span>
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu >
  );
}

export const FolderCard = memo(FolderCardComponent);
