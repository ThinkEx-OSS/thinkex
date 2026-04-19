"use client";

import { useRouter, usePathname } from "next/navigation";
import { useState, useEffect, useRef, type ReactNode } from "react";
import useSWR, { mutate } from "swr";
import { PencilIcon, PlusIcon, Trash2Icon } from "lucide-react";
import { toast } from "sonner";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
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
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { fetcher } from "@/lib/chat-v2/utils";

type ChatListItem = { id: string; title: string; createdAt: string; updatedAt: string };

const LIST_KEY = "/api/chat-v2/list";

export function ChatListDropdown({ trigger }: { trigger: ReactNode }) {
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const pathname = usePathname();
  const currentChatId = pathname?.match(/\/chat-v2\/([^/]+)/)?.[1] ?? null;

  const { data, isLoading } = useSWR<{ chats: ChatListItem[] }>(open ? LIST_KEY : null, fetcher);
  const chats = data?.chats ?? [];

  const startNew = () => {
    setOpen(false);
    router.push(`/chat-v2/${crypto.randomUUID()}`);
  };

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>{trigger}</DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        className="w-80 max-h-[500px] overflow-hidden border-sidebar-border bg-sidebar p-0"
      >
        <Button
          type="button"
          variant="ghost"
          onClick={startNew}
          className="flex w-full items-center justify-start gap-2 rounded-none px-4 py-3 text-start font-medium transition-all hover:bg-muted/50"
        >
          <PlusIcon className="h-4 w-4 text-primary" />
          New Chat
        </Button>
        <DropdownMenuSeparator className="m-0 bg-sidebar-border" />
        <div className="max-h-[400px] flex-1 overflow-y-auto p-1">
          {isLoading ? (
            <ListSkeleton />
          ) : chats.length === 0 ? (
            <div className="px-4 py-6 text-center text-sm text-muted-foreground">No chats yet</div>
          ) : (
            chats.map((chat) => (
              <ChatListItemRow
                key={chat.id}
                chat={chat}
                isActive={chat.id === currentChatId}
                onSelect={() => {
                  setOpen(false);
                  router.push(`/chat-v2/${chat.id}`);
                }}
              />
            ))
          )}
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function ListSkeleton() {
  return (
    <div className="flex flex-col gap-1">
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="flex items-center gap-2 rounded-md px-3 py-2">
          <Skeleton className="h-[22px] flex-grow" />
        </div>
      ))}
    </div>
  );
}

function ChatListItemRow({
  chat,
  isActive,
  onSelect,
}: {
  chat: ChatListItem;
  isActive: boolean;
  onSelect: () => void;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState(chat.title);
  const [showDelete, setShowDelete] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!isEditing) setEditValue(chat.title);
  }, [chat.title, isEditing]);

  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isEditing]);

  const startEdit = () => {
    setIsEditing(true);
    setEditValue(chat.title);
  };

  const saveEdit = async () => {
    const trimmed = editValue.trim();
    if (!trimmed || trimmed === chat.title) {
      setEditValue(chat.title);
      setIsEditing(false);
      return;
    }
    try {
      const res = await fetch(`/api/chat-v2/${chat.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: trimmed }),
      });
      if (!res.ok) throw new Error(await res.text());
      toast.success("Title updated");
      void mutate(LIST_KEY);
    } catch {
      toast.error("Failed to update title");
      setEditValue(chat.title);
    }
    setIsEditing(false);
  };

  const onDelete = async () => {
    try {
      const res = await fetch(`/api/chat-v2?id=${chat.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error(await res.text());
      toast.success("Chat deleted");
      void mutate(LIST_KEY);
      const currentId = pathname?.match(/\/chat-v2\/([^/]+)/)?.[1];
      if (currentId === chat.id) {
        router.push(`/chat-v2/${crypto.randomUUID()}`);
      }
    } catch {
      toast.error("Failed to delete chat");
    }
    setShowDelete(false);
  };

  return (
    <>
      <div
        className={cn(
          "group flex items-center gap-1 rounded-lg transition-all hover:bg-muted",
          isActive && "bg-muted",
        )}
      >
        {isEditing ? (
          <input
            ref={inputRef}
            type="text"
            value={editValue}
            onChange={(e) => setEditValue(e.target.value)}
            onBlur={saveEdit}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                void saveEdit();
              } else if (e.key === "Escape") {
                e.preventDefault();
                setEditValue(chat.title);
                setIsEditing(false);
              }
            }}
            className="mx-3 my-2 w-full rounded border border-border bg-background px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            onClick={(e) => e.stopPropagation()}
          />
        ) : (
          <button
            type="button"
            onClick={onSelect}
            onDoubleClick={(e) => {
              e.stopPropagation();
              startEdit();
            }}
            className="flex min-w-0 flex-1 items-center gap-2 px-3 py-2 text-start text-sm"
          >
            <span className="block min-w-0 flex-1 truncate">{chat.title || "New Chat"}</span>
          </button>
        )}
        {!isEditing && (
          <>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                startEdit();
              }}
              className="mr-1 flex size-6 shrink-0 items-center justify-center rounded opacity-0 transition-opacity hover:bg-muted group-hover:opacity-100"
              aria-label="Rename"
            >
              <PencilIcon className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setShowDelete(true);
              }}
              className="mr-3 flex size-6 shrink-0 items-center justify-center rounded opacity-0 transition-opacity hover:bg-muted hover:text-destructive group-hover:opacity-100"
              aria-label="Delete"
            >
              <Trash2Icon className="h-3.5 w-3.5" />
            </button>
          </>
        )}
      </div>

      <AlertDialog open={showDelete} onOpenChange={setShowDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete chat</AlertDialogTitle>
            <AlertDialogDescription>This action cannot be undone.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={onDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
