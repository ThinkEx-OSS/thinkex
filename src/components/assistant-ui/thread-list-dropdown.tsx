"use client";

import type { FC } from "react";
import { useState, useRef, useEffect } from "react";
import {
  AuiIf,
  ThreadListItemPrimitive,
  ThreadListPrimitive,
  useAui,
} from "@assistant-ui/react";
import { Trash2Icon, PencilIcon } from "lucide-react";
import { useThreadListItem } from "@assistant-ui/react";
import { PiNotePencilBold } from "react-icons/pi";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { TooltipIconButton } from "@/components/assistant-ui/tooltip-icon-button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
  DropdownMenuLabel,
} from "@/components/ui/dropdown-menu";

interface ThreadListDropdownProps {
  trigger: React.ReactNode;
}

export const ThreadListDropdown: FC<ThreadListDropdownProps> = ({ trigger }) => {
  const [open, setOpen] = useState(false);

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        {trigger}
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        className="w-80 bg-sidebar border-sidebar-border max-h-[500px] p-0 overflow-hidden"
      >
        <ThreadListPrimitive.Root className="aui-root aui-thread-list-root flex flex-col items-stretch">
          <ThreadListNew onSelect={() => setOpen(false)} />
          <DropdownMenuSeparator className="bg-sidebar-border m-0" />
          <div className="flex-1 overflow-y-auto max-h-[400px] p-1">
            <AuiIf condition={({ threads }) => threads.isLoading}>
              <ThreadListSkeleton />
            </AuiIf>
            <AuiIf condition={({ threads }) => !threads.isLoading}>
              <ThreadListPrimitive.Items components={{ ThreadListItem: () => <ThreadListItem onSelect={() => setOpen(false)} /> }} />
            </AuiIf>
          </div>
        </ThreadListPrimitive.Root>
      </DropdownMenuContent>
    </DropdownMenu>
  );
};

const ThreadListNew: FC<{ onSelect?: () => void }> = ({ onSelect }) => {
  return (
    <ThreadListPrimitive.New asChild>
      <Button
        className="aui-thread-list-new flex items-center justify-start gap-2 rounded-none px-4 py-3 text-start hover:bg-muted/50 transition-all duration-200 font-medium w-full"
        variant="ghost"
        onClick={onSelect}
      >
        <PiNotePencilBold className="h-4 w-4 text-primary" />
        New Chat
      </Button>
    </ThreadListPrimitive.New>
  );
};

const ThreadListSkeleton: FC = () => {
  return (
    <div className="flex flex-col gap-1">
      {Array.from({ length: 5 }, (_, i) => (
        <div
          key={i}
          role="status"
          aria-label="Loading threads"
          className="aui-thread-list-skeleton-wrapper flex items-center gap-2 rounded-md px-3 py-2"
        >
          <Skeleton className="aui-thread-list-skeleton h-[22px] flex-grow" />
        </div>
      ))}
    </div>
  );
};

const ThreadListItem: FC<{ onSelect?: () => void }> = ({ onSelect }) => {
  return (
    <ThreadListItemPrimitive.Root className="aui-thread-list-item group flex items-center gap-2 rounded-lg transition-all hover:bg-muted focus-visible:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none data-active:bg-muted">
      <ThreadListItemContent onSelect={onSelect} />
    </ThreadListItemPrimitive.Root>
  );
};

const ThreadListItemContent: FC<{ onSelect?: () => void }> = ({ onSelect }) => {
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const aui = useAui();

  // Get the current title and thread state - this is now inside the Root context
  // Using safe hook to handle race condition during thread switching (GitHub issue #2722)
  const threadListItem = useThreadListItem();
  const title = threadListItem?.title || "New Chat";
  const isThreadInitialized = !!threadListItem?.remoteId;

  // Update edit value when title changes (but not while editing)
  useEffect(() => {
    if (!isEditing) {
      setEditValue(title);
    }
  }, [title, isEditing]);

  // Focus input when entering edit mode
  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isEditing]);

  const handleStartEdit = () => {
    // Check if thread is initialized before allowing edit
    if (!isThreadInitialized) {
      toast.error("Thread is not yet initialized");
      return;
    }
    setIsEditing(true);
    setEditValue(title);
  };

  const handleSave = async () => {
    const trimmedValue = editValue.trim();

    // Check if thread is initialized before trying to rename
    if (!isThreadInitialized) {
      toast.error("Thread is not yet initialized");
      setEditValue(title);
      setIsEditing(false);
      return;
    }

    if (trimmedValue && trimmedValue !== title) {
      try {
        await aui?.threadListItem().rename(trimmedValue);
        toast.success("Title updated");
      } catch (error) {
        console.error("Failed to rename thread:", error);
        toast.error("Failed to update title");
        // Revert to original title on error
        setEditValue(title);
      }
    } else if (!trimmedValue) {
      // If empty, revert to original title
      setEditValue(title);
    }
    setIsEditing(false);
  };

  const handleCancel = () => {
    setEditValue(title);
    setIsEditing(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleSave();
    } else if (e.key === "Escape") {
      e.preventDefault();
      handleCancel();
    }
  };

  return (
    <>
      <div className="flex-grow flex items-center gap-2 px-3 py-2">
        {isEditing ? (
          <input
            ref={inputRef}
            type="text"
            value={editValue}
            onChange={(e) => setEditValue(e.target.value)}
            onBlur={handleSave}
            onKeyDown={handleKeyDown}
            className="aui-thread-list-item-title-edit text-sm w-full bg-background border border-border rounded px-2 py-1 focus:outline-none focus:ring-2 focus:ring-ring"
            onClick={(e) => e.stopPropagation()}
          />
        ) : (
          <>
            <ThreadListItemPrimitive.Trigger
              className="aui-thread-list-item-trigger flex-1 text-start cursor-pointer min-w-0"
              onClick={onSelect}
            >
              <ThreadListItemTitle onStartEdit={handleStartEdit} />
            </ThreadListItemPrimitive.Trigger>
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  className="edit-icon-button opacity-0 group-hover:opacity-100 transition-opacity p-0 hover:bg-muted rounded flex-shrink-0 cursor-pointer z-10 size-4"
                  onClick={(e) => {
                    e.stopPropagation();
                    e.preventDefault();
                    handleStartEdit();
                  }}
                  onMouseDown={(e) => {
                    e.stopPropagation();
                  }}
                  aria-label="Edit name"
                >
                  <PencilIcon className="h-4 w-4 text-foreground" />
                </button>
              </TooltipTrigger>
              <TooltipContent>Edit name</TooltipContent>
            </Tooltip>
          </>
        )}
      </div>
      <ThreadListItemArchive />
    </>
  );
};

const ThreadListItemTitle: FC<{
  onStartEdit: () => void;
}> = ({ onStartEdit }) => {
  const handleDoubleClick = (e: React.MouseEvent) => {
    // Stop the trigger from switching threads on double-click
    e.stopPropagation();
    onStartEdit();
  };

  return (
    <div
      className="aui-thread-list-item-title-wrapper min-w-0 flex-1"
      onDoubleClick={handleDoubleClick}
    >
      <span className="aui-thread-list-item-title text-sm break-words block">
        <ThreadListItemPrimitive.Title fallback="New Chat" />
      </span>
    </div>
  );
};

const ThreadListItemArchive: FC = () => {
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const archiveButtonRef = useRef<HTMLButtonElement>(null);

  const handleDeleteClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setShowDeleteDialog(true);
  };

  const handleDeleteConfirm = () => {
    // Trigger the archive action programmatically
    if (archiveButtonRef.current) {
      archiveButtonRef.current.click();
    }
    setShowDeleteDialog(false);
    toast.success("Chat deleted successfully");
  };

  return (
    <>
      <ThreadListItemPrimitive.Archive asChild>
        <button
          ref={archiveButtonRef}
          className="hidden"
          aria-hidden="true"
          tabIndex={-1}
        />
      </ThreadListItemPrimitive.Archive>
      <TooltipIconButton
        onClick={handleDeleteClick}
        className="aui-thread-list-item-archive mr-3 ml-auto size-4 p-0 text-foreground hover:text-destructive opacity-0 group-hover:opacity-100 transition-opacity"
        variant="ghost"
        tooltip="Delete chat"
        side="top"
      >
        <Trash2Icon />
      </TooltipIconButton>
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Chat</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this chat? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteConfirm}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};

