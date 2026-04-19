"use client";

import { useEffect, useRef, useState, type FC } from "react";
import { PencilIcon, Trash2Icon } from "lucide-react";
import { PiNotePencilBold } from "react-icons/pi";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
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
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { TooltipIconButton } from "@/components/chat-v2/ui/tooltip-icon-button";
import {
  useCreateThread,
  useDeleteThread,
  useRenameThread,
  useThreadList,
} from "@/components/chat-v2/runtime/use-thread-list";
import { useUIStore } from "@/lib/stores/ui-store";
import { useWorkspaceStore } from "@/lib/stores/workspace-store";

interface ThreadListDropdownProps {
  trigger: React.ReactNode;
}

export const ThreadListDropdown: FC<ThreadListDropdownProps> = ({ trigger }) => {
  const workspaceId = useWorkspaceStore((state) => state.currentWorkspaceId);
  const activeThreadId = useUIStore((state) => state.activeChatThreadId);
  const setActiveChatThreadId = useUIStore((state) => state.setActiveChatThreadId);
  const threadList = useThreadList(workspaceId);
  const createThread = useCreateThread(workspaceId ?? "");
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!threadList.data?.length) return;
    if (activeThreadId && threadList.data.some((thread) => thread.remoteId === activeThreadId)) {
      return;
    }
    setActiveChatThreadId(threadList.data[0]!.remoteId);
  }, [activeThreadId, setActiveChatThreadId, threadList.data]);

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>{trigger}</DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        className="w-80 bg-sidebar border-sidebar-border max-h-[500px] p-0 overflow-hidden"
      >
        <Button
          className="flex items-center justify-start gap-2 rounded-none px-4 py-3 text-start hover:bg-muted/50 font-medium w-full"
          variant="ghost"
          onClick={async () => {
            if (!workspaceId) return;
            const result = await createThread.mutateAsync();
            setActiveChatThreadId(result.remoteId);
            setOpen(false);
          }}
        >
          <PiNotePencilBold className="h-4 w-4 text-primary" />
          New Chat
        </Button>
        <DropdownMenuSeparator className="bg-sidebar-border m-0" />
        <div className="flex-1 overflow-y-auto max-h-[400px] p-1">
          {threadList.isLoading ? <ThreadListSkeleton /> : null}
          {!threadList.isLoading && !threadList.data?.length ? (
            <div className="px-3 py-4 text-sm text-muted-foreground">No chats yet</div>
          ) : null}
          {!threadList.isLoading
            ? threadList.data?.map((thread) => (
                <ThreadListItem
                  key={thread.remoteId}
                  thread={thread}
                  active={thread.remoteId === activeThreadId}
                  workspaceId={workspaceId}
                  onSelect={() => {
                    setActiveChatThreadId(thread.remoteId);
                    setOpen(false);
                  }}
                />
              ))
            : null}
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
};

const ThreadListSkeleton: FC = () => (
  <div className="flex flex-col gap-1">
    {Array.from({ length: 5 }, (_, i) => (
      <div key={i} role="status" aria-label="Loading threads" className="flex items-center gap-2 rounded-md px-3 py-2">
        <Skeleton className="h-[22px] flex-grow" />
      </div>
    ))}
  </div>
);

const ThreadListItem: FC<{
  thread: { remoteId: string; title?: string };
  active: boolean;
  workspaceId: string | null;
  onSelect: () => void;
}> = ({ thread, active, workspaceId, onSelect }) => {
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState(thread.title || "New Chat");
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const deleteThread = useDeleteThread(workspaceId ?? "");
  const renameThread = useRenameThread(workspaceId ?? "");
  const setActiveChatThreadId = useUIStore((state) => state.setActiveChatThreadId);

  useEffect(() => {
    if (!isEditing) {
      setEditValue(thread.title || "New Chat");
    }
  }, [isEditing, thread.title]);

  useEffect(() => {
    if (isEditing) {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [isEditing]);

  return (
    <div
      className={active ? "group flex items-center gap-2 rounded-lg bg-muted" : "group flex items-center gap-2 rounded-lg hover:bg-muted"}
    >
      <div className="flex flex-grow items-center gap-2 px-3 py-2">
        {isEditing ? (
          <input
            ref={inputRef}
            type="text"
            value={editValue}
            onChange={(event) => setEditValue(event.target.value)}
            onBlur={async () => {
              const title = editValue.trim();
              if (title && workspaceId) {
                await renameThread.mutateAsync({ threadId: thread.remoteId, title });
              }
              setIsEditing(false);
            }}
            onKeyDown={async (event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                inputRef.current?.blur();
              }
              if (event.key === "Escape") {
                event.preventDefault();
                setIsEditing(false);
              }
            }}
            className="text-sm w-full bg-background border border-border rounded px-2 py-1 focus:outline-none focus:ring-2 focus:ring-ring"
            onClick={(event) => event.stopPropagation()}
          />
        ) : (
          <button type="button" className="flex-1 min-w-0 text-left" onClick={onSelect}>
            <DropdownMenuLabel className="p-0 font-normal">
              <span className="block truncate text-sm">{thread.title || "New Chat"}</span>
            </DropdownMenuLabel>
          </button>
        )}

        <TooltipIconButton
          tooltip="Edit name"
          className="mr-0 size-4 p-0 opacity-0 group-hover:opacity-100"
          onClick={() => setIsEditing(true)}
        >
          <PencilIcon className="h-4 w-4 text-foreground" />
        </TooltipIconButton>
        <TooltipIconButton
          tooltip="Delete chat"
          className="mr-0 size-4 p-0 opacity-0 group-hover:opacity-100 hover:text-destructive"
          onClick={() => setShowDeleteDialog(true)}
        >
          <Trash2Icon />
        </TooltipIconButton>
      </div>

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
              onClick={async () => {
                await deleteThread.mutateAsync({ threadId: thread.remoteId });
                setActiveChatThreadId(null);
                toast.success("Chat deleted successfully");
              }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};
