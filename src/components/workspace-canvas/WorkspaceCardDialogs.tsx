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
}: WorkspaceCardDialogsProps) {
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
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Card</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete &quot;
              {item.name || "this card"}&quot;? You can restore from version
              history if needed.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={onDeleteConfirm}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
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
