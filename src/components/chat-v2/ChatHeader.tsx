"use client";

import { ChevronDown, Check, Edit2, X } from "lucide-react";
import { LuMaximize2, LuMinimize2, LuPanelRightClose } from "react-icons/lu";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ThreadListDropdown } from "./ThreadListDropdown";

interface ChatHeaderProps {
  workspaceId: string;
  threadId?: string | null;
  onSelectThread: (threadId: string | null) => void;
  onCollapse?: () => void;
  isMaximized?: boolean;
  onToggleMaximize?: () => void;
}

export function ChatHeader({ workspaceId, threadId, onSelectThread, onCollapse, isMaximized, onToggleMaximize }: ChatHeaderProps) {
  const [threadTitle, setThreadTitle] = useState("New Chat");
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("New Chat");

  useEffect(() => {
    if (!threadId) {
      setThreadTitle("New Chat");
      setDraft("New Chat");
      return;
    }

    let cancelled = false;

    void (async () => {
      try {
        const response = await fetch(`/api/threads/${threadId}`, { cache: "no-store" });
        if (!response.ok || cancelled) return;
        const data = (await response.json()) as { title?: string };
        if (cancelled) return;
        setThreadTitle(data.title ?? "New Chat");
        setDraft(data.title ?? "New Chat");
      } catch {
        return;
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [threadId]);

  const title = useMemo(() => threadTitle || "New Chat", [threadTitle]);

  const save = async () => {
    if (!threadId) return;
    const nextTitle = draft.trim() || "New Chat";
    const response = await fetch(`/api/threads/${threadId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: nextTitle }),
    });
    if (!response.ok) {
      toast.error("Failed to rename chat");
      return;
    }
    setThreadTitle(nextTitle);
    setEditing(false);
  };

  return (
    <div className="flex items-center justify-between border-b border-sidebar-border px-3 py-2">
      <div className="flex min-w-0 items-center gap-2">
        <ThreadListDropdown
          workspaceId={workspaceId}
          activeThreadId={threadId}
          onSelectThread={onSelectThread}
          trigger={<Button variant="ghost" size="sm" className="gap-1"><span className="truncate">{title}</span><ChevronDown className="size-4" /></Button>}
        />
        {editing ? (
          <div className="flex items-center gap-1">
            <Textarea value={draft} onChange={(event) => setDraft(event.target.value)} className="min-h-8 w-56 resize-none py-1" rows={1} />
            <Button variant="ghost" size="icon" className="size-7" onClick={() => void save()}><Check className="size-4" /></Button>
            <Button variant="ghost" size="icon" className="size-7" onClick={() => { setEditing(false); setDraft(threadTitle); }}><X className="size-4" /></Button>
          </div>
        ) : threadId ? (
          <Button variant="ghost" size="icon" className="size-7" onClick={() => setEditing(true)}><Edit2 className="size-4" /></Button>
        ) : null}
      </div>
      <div className="flex items-center gap-1">
        <Button variant="ghost" size="icon" className="size-8" onClick={onToggleMaximize}>
          {isMaximized ? <LuMinimize2 className="size-4" /> : <LuMaximize2 className="size-4" />}
        </Button>
        <Button variant="ghost" size="icon" className="size-8" onClick={onCollapse}>
          <LuPanelRightClose className="size-4" />
        </Button>
      </div>
    </div>
  );
}
