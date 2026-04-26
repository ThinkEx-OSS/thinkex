"use client";

import { PencilIcon, Trash2Icon } from "lucide-react";
import { PiNotePencilBold } from "react-icons/pi";
import {
  type FC,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { toast } from "sonner";

import { useChatContext } from "@/components/chat/ChatProvider";
import {
  useChatRuntimesContext,
  useThreadStatus,
} from "@/components/chat/ChatRuntimes";
import { TooltipIconButton } from "@/components/chat/tooltip-icon-button";
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
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  type ThreadListItem,
  useDeleteThread,
  useRenameThread,
  useThreadsQuery,
} from "@/lib/chat/queries";
import { useWorkspaceStore } from "@/lib/stores/workspace-store";

interface ThreadListDropdownProps {
  trigger: React.ReactNode;
}

export const ThreadListDropdown: FC<ThreadListDropdownProps> = ({
  trigger,
}) => {
  const [open, setOpen] = useState(false);
  const { workspaceId, threadId, selectThread, startNewThread } = useChatContext();

  const { data: threads, isLoading } = useThreadsQuery(workspaceId);

  const visibleThreads = (threads ?? []).filter(
    (t) => t.status !== "archived",
  );

  const handleSelect = useCallback(
    (id: string) => {
      selectThread(id);
      setOpen(false);
    },
    [selectThread],
  );

  const handleNew = useCallback(() => {
    startNewThread();
    setOpen(false);
  }, [startNewThread]);

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>{trigger}</DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        className="w-80 bg-sidebar border-sidebar-border max-h-[500px] p-0 overflow-hidden"
        onCloseAutoFocus={(event) => event.preventDefault()}
      >
        <Button
          className="flex items-center justify-start gap-2 rounded-none px-4 py-3 text-start hover:bg-muted/50 transition-all duration-200 font-medium w-full"
          variant="ghost"
          onClick={handleNew}
        >
          <PiNotePencilBold className="h-4 w-4 text-primary" />
          New Chat
        </Button>
        <DropdownMenuSeparator className="bg-sidebar-border m-0" />
        <div className="flex-1 overflow-y-auto max-h-[400px] p-1">
          {isLoading ? (
            <ThreadListSkeleton />
          ) : visibleThreads.length === 0 ? (
            <div className="px-3 py-6 text-center text-sm text-muted-foreground">
              No conversations yet.
            </div>
          ) : (
            visibleThreads.map((thread) => (
              <ThreadListItemRow
                key={thread.id}
                thread={thread}
                workspaceId={workspaceId}
                isActive={thread.id === threadId}
                onSelect={handleSelect}
                onDeletedActiveThread={handleNew}
              />
            ))
          )}
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
};

const ThreadListSkeleton: FC = () => (
  <div className="flex flex-col gap-1">
    {Array.from({ length: 5 }, (_, i) => (
      <div
        key={i}
        role="status"
        aria-label="Loading threads"
        className="flex items-center gap-2 rounded-md px-3 py-2"
      >
        <Skeleton className="h-[22px] flex-grow" />
      </div>
    ))}
  </div>
);

interface ThreadListItemRowProps {
  thread: ThreadListItem;
  workspaceId: string;
  isActive: boolean;
  onSelect: (id: string) => void;
  onDeletedActiveThread: () => void;
}

const ThreadListItemRow: FC<ThreadListItemRowProps> = ({
  thread,
  workspaceId,
  isActive,
  onSelect,
  onDeletedActiveThread,
}) => {
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState(thread.title ?? "New Chat");
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const renameMutation = useRenameThread(workspaceId);
  const deleteMutation = useDeleteThread(workspaceId);
  const clearCurrentThreadId = useWorkspaceStore(
    (s) => s.clearCurrentThreadId,
  );
  const { disposeRuntime } = useChatRuntimesContext();
  const status = useThreadStatus(thread.id);
  const isGenerating = status === "submitted" || status === "streaming";

  useEffect(() => {
    if (!isEditing) setEditValue(thread.title ?? "New Chat");
  }, [thread.title, isEditing]);

  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isEditing]);

  const title = thread.title?.trim() || "New Chat";

  const handleStartEdit = (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    setIsEditing(true);
  };

  const handleSave = async () => {
    const trimmed = editValue.trim();
    if (!trimmed || trimmed === title) {
      setEditValue(title);
      setIsEditing(false);
      return;
    }
    try {
      await renameMutation.mutateAsync({ threadId: thread.id, title: trimmed });
      toast.success("Title updated");
    } catch (err) {
      console.error("Failed to rename thread:", err);
      toast.error("Failed to update title");
      setEditValue(title);
    } finally {
      setIsEditing(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      void handleSave();
    } else if (e.key === "Escape") {
      e.preventDefault();
      setEditValue(title);
      setIsEditing(false);
    }
  };

  const handleDelete = (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    setShowDeleteDialog(true);
  };

  const handleDeleteConfirm = async () => {
    setShowDeleteDialog(false);
    disposeRuntime(thread.id);
    try {
      await deleteMutation.mutateAsync(thread.id);
      clearCurrentThreadId(workspaceId, thread.id);
      if (isActive) {
        onDeletedActiveThread();
      }
      toast.success("Chat deleted");
    } catch (err) {
      console.error("Failed to delete thread:", err);
      toast.error("Failed to delete chat");
    }
  };

  return (
    <>
      <div
        className={`group flex items-center gap-2 rounded-lg transition-all hover:bg-muted ${
          isActive ? "bg-muted" : ""
        }`}
      >
        <div className="flex-grow flex items-center gap-2 px-3 py-2 min-w-0">
          {isEditing ? (
            <input
              ref={inputRef}
              type="text"
              value={editValue}
              onChange={(e) => setEditValue(e.target.value)}
              onBlur={() => void handleSave()}
              onKeyDown={handleKeyDown}
              className="text-sm w-full bg-background border border-border rounded px-2 py-1 focus:outline-none focus:ring-2 focus:ring-ring"
              onClick={(e) => e.stopPropagation()}
            />
          ) : (
            <>
              <button
                type="button"
                className="flex-1 text-start cursor-pointer min-w-0"
                onClick={() => onSelect(thread.id)}
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 min-w-0">
                    {isGenerating ? (
                      <span
                        aria-label="Generating"
                        className="inline-block size-2 shrink-0 rounded-full bg-primary animate-pulse"
                      />
                    ) : null}
                    <span className="text-sm break-words block truncate">
                      {title}
                    </span>
                  </div>
                </div>
              </button>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    className="opacity-0 group-hover:opacity-100 transition-opacity p-0 hover:bg-muted rounded flex-shrink-0 cursor-pointer z-10 size-4"
                    onClick={handleStartEdit}
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
        <TooltipIconButton
          onClick={handleDelete}
          className="mr-3 ml-auto size-4 p-0 text-foreground hover:text-destructive opacity-0 group-hover:opacity-100 transition-opacity"
          variant="ghost"
          tooltip="Delete chat"
          side="top"
        >
          <Trash2Icon />
        </TooltipIconButton>
      </div>
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Chat</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this chat? This action cannot be
              undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => void handleDeleteConfirm()}
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
