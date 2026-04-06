"use client";

import {
  type FC,
  type ReactNode,
  useState,
  useRef,
  useEffect,
  type KeyboardEvent,
  type MouseEvent,
} from "react";
import {
  ThreadListItemPrimitive,
  ThreadListPrimitive,
  useAuiState,
  useThreadListItemRuntime,
  type ThreadListItemRuntime,
} from "@assistant-ui/react";
import { Trash2Icon, PencilIcon } from "lucide-react";
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
} from "@/components/ui/dropdown-menu";

const THREAD_LIST_SKELETON_KEYS = [
  "thread-list-skeleton-1",
  "thread-list-skeleton-2",
  "thread-list-skeleton-3",
  "thread-list-skeleton-4",
  "thread-list-skeleton-5",
] as const;

interface ThreadListDropdownProps {
  trigger: ReactNode;
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
          <ThreadListScrollArea onSelectThread={() => setOpen(false)} />
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
      {THREAD_LIST_SKELETON_KEYS.map((key) => (
        <div
          key={key}
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

const ThreadListScrollArea: FC<{ onSelectThread: () => void }> = ({
  onSelectThread,
}) => {
  const isLoading = useAuiState((s) => s.threads.isLoading);

  return (
    <div className="flex-1 overflow-y-auto max-h-[400px] p-1">
      {isLoading ? (
        <ThreadListSkeleton />
      ) : (
        <ThreadListPrimitive.Items>
          {({ threadListItem }) => (
            <ThreadListItem
              key={threadListItem.id}
              onSelect={onSelectThread}
            />
          )}
        </ThreadListPrimitive.Items>
      )}
    </div>
  );
};

const ThreadListItem: FC<{ onSelect?: () => void }> = ({ onSelect }) => {
  const threadListItemRuntime = useThreadListItemRuntime({ optional: true });
  const threadListItem = useAuiState((s) => s.threadListItem);
  const title = threadListItem?.title || "New Chat";
  const isReady = Boolean(threadListItem?.remoteId);

  return (
    <ThreadListItemPrimitive.Root className="aui-thread-list-item group flex items-center gap-2 rounded-lg transition-all hover:bg-muted focus-visible:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none data-active:bg-muted">
      <ThreadListItemContent
        onSelect={onSelect}
        runtime={threadListItemRuntime}
        title={title}
        isReady={isReady}
      />
      <ThreadListItemDelete runtime={threadListItemRuntime} />
    </ThreadListItemPrimitive.Root>
  );
};

const ThreadListItemContent: FC<{
  onSelect?: () => void;
  runtime: ThreadListItemRuntime | null;
  title: string;
  isReady: boolean;
}> = ({ onSelect, runtime: threadListItemRuntime, title, isReady }) => {

  /** Returns true if rename should abort (toast shown when not ready). */
  const blockIfNotReady = () => {
    if (isReady) return false;
    toast.error("Thread is not yet initialized");
    return true;
  };
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  // Focus input when entering edit mode
  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isEditing]);

  const handleStartEdit = () => {
    if (blockIfNotReady()) return;
    setIsEditing(true);
    setEditValue(title);
  };

  const handleSave = async () => {
    const trimmedValue = editValue.trim();

    if (blockIfNotReady()) {
      setIsEditing(false);
      return;
    }

    if (!threadListItemRuntime) {
      toast.error("Unable to access thread");
      setIsEditing(false);
      return;
    }

    if (trimmedValue && trimmedValue !== title) {
      try {
        await threadListItemRuntime.rename(trimmedValue);
        toast.success("Title updated");
      } catch (error) {
        console.error("Failed to rename thread:", error);
        toast.error("Failed to update title");
      }
    }
    setIsEditing(false);
  };

  const handleCancel = () => {
    setIsEditing(false);
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleSave();
    } else if (e.key === "Escape") {
      e.preventDefault();
      handleCancel();
    }
  };

  return (
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
            <span className="aui-thread-list-item-title text-sm break-words block min-w-0 flex-1">
              <ThreadListItemPrimitive.Title fallback="New Chat" />
            </span>
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
  );
};

const ThreadListItemDelete: FC<{
  runtime: ThreadListItemRuntime | null;
}> = ({ runtime: threadListItemRuntime }) => {
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const handleDeleteClick = (e: MouseEvent<HTMLButtonElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setShowDeleteDialog(true);
  };

  const handleDeleteConfirm = async () => {
    if (!threadListItemRuntime) {
      toast.error("Unable to access thread");
      return;
    }
    setIsDeleting(true);
    try {
      await threadListItemRuntime.delete();
      setShowDeleteDialog(false);
      toast.success("Chat deleted successfully");
    } catch (error) {
      console.error("Failed to delete chat:", error);
      toast.error("Failed to delete chat");
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <>
      <TooltipIconButton
        onClick={handleDeleteClick}
        className="aui-thread-list-item-delete mr-3 ml-auto size-4 p-0 text-foreground hover:text-destructive opacity-0 group-hover:opacity-100 transition-opacity"
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
            <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteConfirm}
              disabled={isDeleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isDeleting ? "Deleting..." : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};

