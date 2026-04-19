"use client";

import type { FC } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Archive,
  ArchiveRestore,
  ChevronDown,
  ChevronRight,
  MoreHorizontal,
  PencilIcon,
  Trash2Icon,
} from "lucide-react";
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
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  useArchiveThread,
  useCreateThread,
  useDeleteThread,
  useRenameThread,
  useThreadList,
  useUnarchiveThread,
} from "@/components/chat-v2/runtime/use-thread-list";
import { TooltipIconButton } from "@/components/chat-v2/ui/tooltip-icon-button";
import type { ThreadListItem as ChatThreadListItem } from "@/lib/chat/types";
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
  const [archivedOpen, setArchivedOpen] = useState(false);

  const regularThreads = useMemo(
    () => (threadList.data ?? []).filter((thread) => thread.status !== "archived"),
    [threadList.data],
  );
  const archivedThreads = useMemo(
    () => (threadList.data ?? []).filter((thread) => thread.status === "archived"),
    [threadList.data],
  );

  useEffect(() => {
    const allThreads = threadList.data ?? [];
    if (allThreads.length === 0) return;
    if (activeThreadId && allThreads.some((thread) => thread.remoteId === activeThreadId)) {
      return;
    }
    setActiveChatThreadId(regularThreads[0]?.remoteId ?? allThreads[0]!.remoteId);
  }, [activeThreadId, regularThreads, setActiveChatThreadId, threadList.data]);

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
          {!threadList.isLoading && regularThreads.length === 0 && archivedThreads.length === 0 ? (
            <div className="px-3 py-4 text-sm text-muted-foreground">No chats yet</div>
          ) : null}
          {!threadList.isLoading ? (
            <div className="space-y-1">
              {regularThreads.map((thread) => (
                <ThreadRow
                  key={thread.remoteId}
                  thread={thread}
                  active={thread.remoteId === activeThreadId}
                  workspaceId={workspaceId}
                  onSelect={() => {
                    setActiveChatThreadId(thread.remoteId);
                    setOpen(false);
                  }}
                />
              ))}

              {archivedThreads.length > 0 ? (
                <Collapsible open={archivedOpen} onOpenChange={setArchivedOpen}>
                  <CollapsibleTrigger asChild>
                    <button
                      type="button"
                      className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm text-muted-foreground hover:bg-muted/50 hover:text-foreground"
                    >
                      {archivedOpen ? (
                        <ChevronDown className="size-4" />
                      ) : (
                        <ChevronRight className="size-4" />
                      )}
                      <span className="font-medium">Archived</span>
                      <span className="text-xs text-muted-foreground/80">
                        {archivedThreads.length}
                      </span>
                    </button>
                  </CollapsibleTrigger>
                  <CollapsibleContent className="space-y-1 pt-1">
                    {archivedThreads.map((thread) => (
                      <ThreadRow
                        key={thread.remoteId}
                        thread={thread}
                        active={thread.remoteId === activeThreadId}
                        workspaceId={workspaceId}
                        onSelect={() => {
                          setActiveChatThreadId(thread.remoteId);
                          setOpen(false);
                        }}
                      />
                    ))}
                  </CollapsibleContent>
                </Collapsible>
              ) : null}
            </div>
          ) : null}
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

const ThreadRow: FC<{
  thread: ChatThreadListItem;
  active: boolean;
  workspaceId: string | null;
  onSelect: () => void;
}> = ({ thread, active, workspaceId, onSelect }) => {
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState(thread.title || "New Chat");
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const setActiveChatThreadId = useUIStore((state) => state.setActiveChatThreadId);
  const renameThread = useRenameThread(workspaceId ?? "");
  const archiveThread = useArchiveThread(workspaceId ?? "");
  const unarchiveThread = useUnarchiveThread(workspaceId ?? "");
  const deleteThread = useDeleteThread(workspaceId ?? "");

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

  const handleArchiveToggle = async () => {
    if (!workspaceId) return;

    if (thread.status === "archived") {
      await unarchiveThread.mutateAsync({ threadId: thread.remoteId });
      setActiveChatThreadId(thread.remoteId);
      toast.success("Chat restored");
      return;
    }

    await archiveThread.mutateAsync({ threadId: thread.remoteId });
    if (active) {
      setActiveChatThreadId(null);
    }
    toast.success("Chat archived");
  };

  return (
    <div
      className={active ? "group flex items-center gap-2 rounded-lg bg-muted" : "group flex items-center gap-2 rounded-lg hover:bg-muted"}
    >
      <div className="flex flex-grow items-center gap-2 px-3 py-2 min-w-0">
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

        {!isEditing ? (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <TooltipIconButton
                tooltip="Thread actions"
                className="mr-0 size-4 p-0 opacity-0 group-hover:opacity-100"
                onClick={(event) => {
                  event.stopPropagation();
                }}
              >
                <MoreHorizontal className="h-4 w-4 text-foreground" />
              </TooltipIconButton>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem
                onClick={(event) => {
                  event.preventDefault();
                  setIsEditing(true);
                }}
              >
                <PencilIcon className="mr-2 h-4 w-4" />
                Rename
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={(event) => {
                  event.preventDefault();
                  void handleArchiveToggle();
                }}
              >
                {thread.status === "archived" ? (
                  <ArchiveRestore className="mr-2 h-4 w-4" />
                ) : (
                  <Archive className="mr-2 h-4 w-4" />
                )}
                {thread.status === "archived" ? "Unarchive" : "Archive"}
              </DropdownMenuItem>
              <DropdownMenuItem
                className="text-destructive focus:text-destructive"
                onClick={(event) => {
                  event.preventDefault();
                  setShowDeleteDialog(true);
                }}
              >
                <Trash2Icon className="mr-2 h-4 w-4" />
                Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        ) : null}
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
                if (active) {
                  setActiveChatThreadId(null);
                }
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
