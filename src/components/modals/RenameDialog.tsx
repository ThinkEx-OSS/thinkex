"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import type { CardType } from "@/lib/workspace-state/types";

interface RenameDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  currentName: string;
  itemType: CardType | "folder";
  onRename: (newName: string) => void;
}

export default function RenameDialog({
  open,
  onOpenChange,
  currentName,
  itemType,
  onRename,
}: RenameDialogProps) {
  const [renameValue, setRenameValue] = useState(currentName || "Untitled");
  const renameInputRef = useRef<HTMLInputElement>(null);

  // Sync rename value when current name changes
  useEffect(() => {
    setRenameValue(currentName || "Untitled");
  }, [currentName]);

  // Auto-focus and select all text when dialog opens
  // Use setTimeout to ensure the element is fully rendered and focusable after dialog animation completes
  useEffect(() => {
    if (open) {
      // Wait for dialog animation (200ms) before focusing and selecting text
      const timeoutId = setTimeout(() => {
        if (renameInputRef.current) {
          renameInputRef.current.focus();
          renameInputRef.current.select();
        }
      }, 250);
      
      return () => clearTimeout(timeoutId);
    }
  }, [open]);

  const handleRename = useCallback(() => {
    if (renameValue.trim()) {
      onRename(renameValue.trim());
      onOpenChange(false);
    }
  }, [renameValue, onRename, onOpenChange]);

  const getItemTypeLabel = () => {
    switch (itemType) {
      case "pdf":
        return "PDF";
      case "flashcard":
        return "Flashcard";
      case "youtube":
        return "YouTube";
      case "folder":
        return "Folder";
      case "note":
      default:
        return "Note";
    }
  };

  const getPlaceholder = () => {
    if (itemType === "folder") {
      return "Folder name";
    }
    return "Item name";
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent onClick={(e) => e.stopPropagation()}>
        <DialogHeader>
          <DialogTitle>Rename {getItemTypeLabel()}</DialogTitle>
          <DialogDescription>
            Enter a new name for this {itemType === "folder" ? "folder" : "item"}.
          </DialogDescription>
        </DialogHeader>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleRename();
          }}
        >
          <div className="py-4">
            <Input
              ref={renameInputRef}
              autoFocus
              value={renameValue}
              onChange={(e) => setRenameValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Escape") {
                  onOpenChange(false);
                }
              }}
              placeholder={getPlaceholder()}
            />
          </div>
          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline">
                Cancel
              </Button>
            </DialogClose>
            <Button type="submit" disabled={!renameValue.trim()}>
              Rename
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
