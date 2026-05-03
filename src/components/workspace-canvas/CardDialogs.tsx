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
import { cn } from "@/lib/utils";

interface SharedCardDialogsProps {
  item: Item;
  allItems: Item[];
  workspaceName: string;
  workspaceIcon?: string | null;
  workspaceColor?: string | null;
  isColorPickerOpen: boolean;
  onColorPickerOpenChange: (open: boolean) => void;
  showMoveDialog: boolean;
  onMoveDialogChange: (open: boolean) => void;
  showRenameDialog: boolean;
  onRenameDialogChange: (open: boolean) => void;
  onColorChange: (color: ColorResult) => void;
  onRename: (newName: string) => void;
  onMove?: (folderId: string | null) => void;
  colorDialogTitle?: string;
}

export function SharedCardDialogs({
  item,
  allItems,
  workspaceName,
  workspaceIcon,
  workspaceColor,
  isColorPickerOpen,
  onColorPickerOpenChange,
  showMoveDialog,
  onMoveDialogChange,
  showRenameDialog,
  onRenameDialogChange,
  onColorChange,
  onRename,
  onMove,
  colorDialogTitle = "Choose a Color",
}: SharedCardDialogsProps) {
  return (
    <>
      <Dialog open={isColorPickerOpen} onOpenChange={onColorPickerOpenChange}>
        <DialogContent
          className="w-auto max-w-fit p-6"
          onClick={(event) => event.stopPropagation()}
          onMouseDown={(event) => event.stopPropagation()}
        >
          <DialogHeader>
            <DialogTitle>{colorDialogTitle}</DialogTitle>
          </DialogHeader>
          <div
            role="presentation"
            className="flex justify-center color-picker-wrapper"
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

      <RenameDialog
        open={showRenameDialog}
        onOpenChange={onRenameDialogChange}
        currentName={item.name || "Untitled"}
        itemType={item.type}
        onRename={onRename}
      />

      {onMove ? (
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
      ) : null}
    </>
  );
}

interface SimpleDeleteDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  confirmLabel?: string;
  onConfirm: () => void;
}

export function SimpleDeleteDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel = "Delete",
  onConfirm,
}: SimpleDeleteDialogProps) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={onConfirm}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            {confirmLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

interface FolderDeleteDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  itemName: string;
  itemCount: number;
  canDeleteContents: boolean;
  deleteOption: "keep" | "delete" | null;
  onDeleteOptionChange: (value: "keep" | "delete") => void;
  onConfirm: () => void;
  onCancel: () => void;
}

export function FolderDeleteDialog({
  open,
  onOpenChange,
  itemName,
  itemCount,
  canDeleteContents,
  deleteOption,
  onDeleteOptionChange,
  onConfirm,
  onCancel,
}: FolderDeleteDialogProps) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
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
                {itemCount === 1 ? "item" : "items"} in &quot;{itemName}
                &quot;:
              </div>
              <div className="space-y-3 pt-2">
                <label
                  aria-label="Keep items"
                  className="group flex cursor-pointer items-start space-x-3"
                >
                  <input
                    type="radio"
                    name="deleteOption"
                    value="keep"
                    checked={deleteOption === "keep"}
                    onChange={() => onDeleteOptionChange("keep")}
                    className="mt-1 h-4 w-4 border-gray-300 text-primary focus:ring-primary"
                    onClick={(e) => e.stopPropagation()}
                  />
                  <div className="flex-1">
                    <div className="text-sm font-medium">Keep items</div>
                    <div className="text-xs text-muted-foreground">
                      Move items out of folder before deleting
                    </div>
                  </div>
                </label>
                <label
                  aria-label="Delete items"
                  className={cn(
                    "group flex items-start space-x-3",
                    canDeleteContents
                      ? "cursor-pointer"
                      : "cursor-not-allowed opacity-50",
                  )}
                >
                  <input
                    type="radio"
                    name="deleteOption"
                    value="delete"
                    checked={deleteOption === "delete"}
                    onChange={() => onDeleteOptionChange("delete")}
                    disabled={!canDeleteContents}
                    className="mt-1 h-4 w-4 border-gray-300 text-destructive focus:ring-destructive disabled:opacity-50"
                    onClick={(e) => e.stopPropagation()}
                  />
                  <div className="flex-1">
                    <div className="text-sm font-medium text-destructive">
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
              onCancel();
            }}
            onMouseDown={(e) => e.stopPropagation()}
          >
            Cancel
          </AlertDialogCancel>
          <AlertDialogAction
            onClick={(e) => {
              e.stopPropagation();
              onConfirm();
            }}
            onMouseDown={(e) => e.stopPropagation()}
            disabled={deleteOption === null}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Delete
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
