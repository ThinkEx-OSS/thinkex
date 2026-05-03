"use client";

import { useCallback, useMemo, useState } from "react";

export function useCardActionState() {
  const [isColorPickerOpen, setIsColorPickerOpen] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [showMoveDialog, setShowMoveDialog] = useState(false);
  const [showRenameDialog, setShowRenameDialog] = useState(false);
  const openColorPicker = useCallback(() => setIsColorPickerOpen(true), []);
  const openDeleteDialog = useCallback(() => setShowDeleteDialog(true), []);
  const openMoveDialog = useCallback(() => setShowMoveDialog(true), []);
  const openRenameDialog = useCallback(() => setShowRenameDialog(true), []);

  return useMemo(
    () => ({
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
    }),
    [
      isColorPickerOpen,
      openColorPicker,
      openDeleteDialog,
      openMoveDialog,
      openRenameDialog,
      showDeleteDialog,
      showMoveDialog,
      showRenameDialog,
    ],
  );
}
