"use client";

import type { ColorResult } from "react-color";
import { SwatchesPicker } from "react-color";
import type { Item } from "@/lib/workspace-state/types";
import { SWATCHES_COLOR_GROUPS } from "@/lib/workspace-state/colors";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import MoveToDialog from "@/components/modals/MoveToDialog";
import RenameDialog from "@/components/modals/RenameDialog";
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

interface WorkspaceCardDialogsProps {
  item: Item;
  allItems: Item[];
  workspaceName: string;
  workspaceIcon?: string | null;
  workspaceColor?: string | null;
  isColorPickerOpen: boolean;
  onColorPickerOpenChange: (open: boolean) => void;
  showDeleteDialog: boolean;
  onDeleteDialogChange: (open: boolean) => void;
  showMoveDialog: boolean;
  onMoveDialogChange: (open: boolean) => void;
  showRenameDialog: boolean;
  onRenameDialogChange: (open: boolean) => void;
  onColorChange: (color: ColorResult) => void;
  onDeleteConfirm: () => void;
  onRename: (newName: string) => void;
  onMove?: (folderId: string | null) => void;
  itemCount?: number;
  deleteOption?: "keep" | "delete" | null;
  onDeleteOptionChange?: (option: "keep" | "delete" | null) => void;
  canDeleteWithContents?: boolean;
}

function DeleteDialogBody({
  item,
  itemCount,
  deleteOption,
  onDeleteOptionChange,
  canDeleteWithContents,
}: {
  item: Item;
  itemCount?: number;
  deleteOption?: "keep" | "delete" | null;
  onDeleteOptionChange?: (option: "keep" | "delete" | null) => void;
  canDeleteWithContents?: boolean;
}) {
  if (item.type === "folder" && canDeleteWithContents && (itemCount ?? 0) > 0) {
    return (
      <AlertDialogDescription asChild>
        <div className="space-y-4">
          <div>
            Choose what happens to the {itemCount}{" "}
            {itemCount === 1 ? "item" : "items"} in &quot;{item.name}&quot;:
          </div>
          <div className="space-y-3 pt-2">
            <label className="flex items-start space-x-3 cursor-pointer group">
              <input
                type="radio"
                name="deleteOption"
                value="keep"
                checked={deleteOption === "keep"}
                onChange={() => onDeleteOptionChange?.("keep")}
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
            <label className="flex items-start space-x-3 group cursor-pointer">
              <input
                type="radio"
                name="deleteOption"
                value="delete"
                checked={deleteOption === "delete"}
                onChange={() => onDeleteOptionChange?.("delete")}
                className="mt-1 h-4 w-4 text-destructive focus:ring-destructive border-gray-300"
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
    );
  }

  if (
    item.type === "folder" &&
    !canDeleteWithContents &&
    (itemCount ?? 0) > 0
  ) {
    return (
      <AlertDialogDescription>
        Are you sure you want to delete &quot;{item.name}&quot;? Items in this
        folder will be moved out, but not deleted.
      </AlertDialogDescription>
    );
  }

  const label =
    item.type === "folder"
      ? "Folder"
      : item.type === "flashcard"
        ? "Flashcard"
        : "Card";

  return (
    <AlertDialogDescription>
      Are you sure you want to delete &quot;{item.name || `this ${label.toLowerCase()}`}
      &quot;?{" "}
      {item.type === "folder"
        ? "This action cannot be undone right now."
        : "You can restore from version history if needed."}
    </AlertDialogDescription>
  );
}

export function WorkspaceCardDialogs({
  item,
  allItems,
  workspaceName,
  workspaceIcon,
  workspaceColor,
  isColorPickerOpen,
  onColorPickerOpenChange,
  showDeleteDialog,
  onDeleteDialogChange,
  showMoveDialog,
  onMoveDialogChange,
  showRenameDialog,
  onRenameDialogChange,
  onColorChange,
  onDeleteConfirm,
  onRename,
  onMove,
  itemCount,
  deleteOption,
  onDeleteOptionChange,
  canDeleteWithContents,
}: WorkspaceCardDialogsProps) {
  const isFolder = item.type === "folder";
  const deleteTitle = isFolder ? "Delete Folder" : item.type === "flashcard" ? "Delete Flashcard" : "Delete Card";
  const needsRadioSelection =
    isFolder && canDeleteWithContents && (itemCount ?? 0) > 0;

  return (
    <>
      <Dialog open={isColorPickerOpen} onOpenChange={onColorPickerOpenChange}>
        <DialogContent
          className="w-auto max-w-fit p-6"
          onClick={(event) => event.stopPropagation()}
          onMouseDown={(event) => event.stopPropagation()}
        >
          <DialogHeader>
            <DialogTitle>Choose a Color</DialogTitle>
          </DialogHeader>
          <div
            className="flex justify-center color-picker-wrapper"
            onClick={(event) => event.stopPropagation()}
            onMouseDown={(event) => event.stopPropagation()}
          >
            <SwatchesPicker
              color={item.color || "#3B82F6"}
              colors={SWATCHES_COLOR_GROUPS}
              onChangeComplete={onColorChange}
            />
          </div>
        </DialogContent>
      </Dialog>

      <AlertDialog open={showDeleteDialog} onOpenChange={onDeleteDialogChange}>
        <AlertDialogContent
          onClick={(e) => e.stopPropagation()}
          onMouseDown={(e) => e.stopPropagation()}
        >
          <AlertDialogHeader>
            <AlertDialogTitle>{deleteTitle}</AlertDialogTitle>
            <DeleteDialogBody
              item={item}
              itemCount={itemCount}
              deleteOption={deleteOption}
              onDeleteOptionChange={onDeleteOptionChange}
              canDeleteWithContents={canDeleteWithContents}
            />
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel
              onClick={(e) => {
                e.stopPropagation();
                onDeleteOptionChange?.(null);
              }}
              onMouseDown={(e) => e.stopPropagation()}
            >
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.stopPropagation();
                onDeleteConfirm();
              }}
              onMouseDown={(e) => e.stopPropagation()}
              disabled={needsRadioSelection && deleteOption === null}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <RenameDialog
        open={showRenameDialog}
        onOpenChange={onRenameDialogChange}
        currentName={item.name || "Untitled"}
        itemType={item.type}
        onRename={onRename}
      />

      {onMove && (
        <MoveToDialog
          open={showMoveDialog}
          onOpenChange={onMoveDialogChange}
          item={item}
          allItems={allItems}
          workspaceName={workspaceName}
          workspaceIcon={workspaceIcon}
          workspaceColor={workspaceColor}
          onMove={onMove}
        />
      )}
    </>
  );
}
