import { useState, useCallback, useEffect } from "react";
import type { ColorResult } from "react-color";
import type { Item } from "@/lib/workspace-state/types";
import type { CardColor } from "@/lib/workspace-state/colors";

export interface UseItemActionDialogsOptions {
  item: Item;
  itemCount?: number;
  onDeleteItem: (id: string) => void;
  onDeleteFolderWithContents?: (id: string) => void;
  onUpdateItem: (id: string, updates: Partial<Item>) => void;
  onMoveItem?: (id: string, folderId: string | null) => void;
}

export interface ItemActionDialogsState {
  showDeleteDialog: boolean;
  setShowDeleteDialog: (open: boolean) => void;
  showRenameDialog: boolean;
  setShowRenameDialog: (open: boolean) => void;
  showMoveDialog: boolean;
  setShowMoveDialog: (open: boolean) => void;
  showColorPicker: boolean;
  setShowColorPicker: (open: boolean) => void;

  deleteOption: "keep" | "delete" | null;
  setDeleteOption: (opt: "keep" | "delete" | null) => void;

  requestDelete: () => void;
  requestRename: () => void;
  requestMove: () => void;
  requestColorPicker: () => void;

  confirmDelete: () => void;
  handleRename: (newName: string) => void;
  handleColorChange: (color: ColorResult) => void;
  handleMove: (folderId: string | null) => void;
}

export function useItemActionDialogs({
  item,
  itemCount,
  onDeleteItem,
  onDeleteFolderWithContents,
  onUpdateItem,
  onMoveItem,
}: UseItemActionDialogsOptions): ItemActionDialogsState {
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [showRenameDialog, setShowRenameDialog] = useState(false);
  const [showMoveDialog, setShowMoveDialog] = useState(false);
  const [showColorPicker, setShowColorPicker] = useState(false);
  const [deleteOption, setDeleteOption] = useState<"keep" | "delete" | null>(
    null,
  );

  useEffect(() => {
    if (!showDeleteDialog) {
      setDeleteOption(null);
    }
  }, [showDeleteDialog]);

  const requestDelete = useCallback(() => {
    if (item.type === "folder" && (itemCount ?? 0) === 0) {
      onDeleteItem(item.id);
    } else {
      setShowDeleteDialog(true);
    }
  }, [item.id, item.type, itemCount, onDeleteItem]);

  const requestRename = useCallback(() => {
    setShowRenameDialog(true);
  }, []);

  const requestMove = useCallback(() => {
    setShowMoveDialog(true);
  }, []);

  const requestColorPicker = useCallback(() => {
    setShowColorPicker(true);
  }, []);

  const confirmDelete = useCallback(() => {
    if (deleteOption === "delete" && onDeleteFolderWithContents) {
      onDeleteFolderWithContents(item.id);
    } else {
      onDeleteItem(item.id);
    }
    setShowDeleteDialog(false);
    setDeleteOption(null);
  }, [item.id, onDeleteItem, onDeleteFolderWithContents, deleteOption]);

  const handleRename = useCallback(
    (newName: string) => {
      onUpdateItem(item.id, { name: newName });
    },
    [item.id, onUpdateItem],
  );

  const handleColorChange = useCallback(
    (color: ColorResult) => {
      onUpdateItem(item.id, { color: color.hex as CardColor });
      setShowColorPicker(false);
    },
    [item.id, onUpdateItem],
  );

  const handleMove = useCallback(
    (folderId: string | null) => {
      if (onMoveItem) {
        onMoveItem(item.id, folderId);
      }
    },
    [item.id, onMoveItem],
  );

  return {
    showDeleteDialog,
    setShowDeleteDialog,
    showRenameDialog,
    setShowRenameDialog,
    showMoveDialog,
    setShowMoveDialog,
    showColorPicker,
    setShowColorPicker,
    deleteOption,
    setDeleteOption,
    requestDelete,
    requestRename,
    requestMove,
    requestColorPicker,
    confirmDelete,
    handleRename,
    handleColorChange,
    handleMove,
  };
}
