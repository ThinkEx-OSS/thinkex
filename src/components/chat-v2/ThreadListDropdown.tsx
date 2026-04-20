"use client";

import { useEffect, useState } from "react";
import { Trash2Icon, PencilIcon, MessageSquarePlus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DropdownMenu, DropdownMenuContent, DropdownMenuTrigger, DropdownMenuSeparator } from "@/components/ui/dropdown-menu";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";

interface ThreadListDropdownProps {
  workspaceId: string;
  activeThreadId?: string | null;
  onSelectThread: (threadId: string | null) => void;
  trigger: React.ReactNode;
}

type ThreadListItem = {
  remoteId: string;
  title?: string;
  status: string;
};

export function ThreadListDropdown({ workspaceId, activeThreadId, onSelectThread, trigger }: ThreadListDropdownProps) {
  const [threads, setThreads] = useState<ThreadListItem[]>([]);
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const loadThreads = async () => {
    const response = await fetch(`/api/threads?workspaceId=${workspaceId}`, { cache: "no-store" });
    if (!response.ok) throw new Error(await response.text());
    const data = (await response.json()) as { threads: ThreadListItem[] };
    setThreads(data.threads.filter((thread) => thread.status !== "archived"));
  };

  useEffect(() => {
    if (!open) return;
    void loadThreads();
  }, [open, workspaceId]);

  return (
    <>
      <DropdownMenu open={open} onOpenChange={setOpen}>
        <DropdownMenuTrigger asChild>{trigger}</DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-80 max-h-[500px] overflow-hidden border-sidebar-border bg-sidebar p-0">
          <Button variant="ghost" className="flex w-full items-center justify-start gap-2 rounded-none px-4 py-3 text-start font-medium" onClick={() => {
            onSelectThread(null);
            setOpen(false);
          }}>
            <MessageSquarePlus className="size-4 text-primary" />
            New Chat
          </Button>
          <DropdownMenuSeparator className="m-0 bg-sidebar-border" />
          <div className="max-h-[400px] overflow-y-auto p-1">
            {threads.map((thread) => (
              <div key={thread.remoteId} className={`group flex items-center gap-2 rounded-lg px-3 py-2 ${thread.remoteId === activeThreadId ? "bg-muted" : "hover:bg-muted"}`}>
                {editingId === thread.remoteId ? (
                  <Input
                    value={editValue}
                    onChange={(event) => setEditValue(event.target.value)}
                    onBlur={() => {
                      void (async () => {
                        try {
                          const response = await fetch(`/api/threads/${thread.remoteId}`, {
                            method: "PATCH",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({ title: editValue.trim() || "New Chat" }),
                          });
                          if (!response.ok) {
                            throw new Error("Failed to rename chat");
                          }
                          await loadThreads();
                        } catch {
                          toast.error("Failed to rename chat");
                        } finally {
                          setEditingId(null);
                        }
                      })();
                    }}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") {
                        event.currentTarget.blur();
                      }
                      if (event.key === "Escape") {
                        setEditingId(null);
                      }
                    }}
                    className="h-8"
                  />
                ) : (
                  <button type="button" className="min-w-0 flex-1 text-left text-sm" onClick={() => {
                    onSelectThread(thread.remoteId);
                    setOpen(false);
                  }}>
                    {thread.title ?? "New Chat"}
                  </button>
                )}
                <Button variant="ghost" size="icon" className="size-6 p-1 opacity-0 group-hover:opacity-100" onClick={() => {
                  setEditingId(thread.remoteId);
                  setEditValue(thread.title ?? "New Chat");
                }}>
                  <PencilIcon className="size-4" />
                </Button>
                <Button variant="ghost" size="icon" className="size-6 p-1 opacity-0 group-hover:opacity-100" onClick={() => setDeleteId(thread.remoteId)}>
                  <Trash2Icon className="size-4" />
                </Button>
              </div>
            ))}
          </div>
        </DropdownMenuContent>
      </DropdownMenu>
      <AlertDialog open={deleteId != null} onOpenChange={(nextOpen) => !nextOpen && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Chat</AlertDialogTitle>
            <AlertDialogDescription>Are you sure you want to delete this chat? This action cannot be undone.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={() => {
              void (async () => {
                if (!deleteId) return;
                const response = await fetch(`/api/threads/${deleteId}`, { method: "DELETE" });
                if (!response.ok) {
                  toast.error("Failed to delete chat");
                  setDeleteId(null);
                  return;
                }
                if (deleteId === activeThreadId) onSelectThread(null);
                setDeleteId(null);
                await loadThreads();
              })();
            }}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
