"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import {
  Check,
  ChevronDown,
  MessageSquarePlus,
  X,
} from "lucide-react";
import { RiChatHistoryLine } from "react-icons/ri";
import { LuMaximize2, LuMinimize2, LuPanelRightClose } from "react-icons/lu";
import { toast } from "sonner";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Kbd } from "@/components/ui/kbd";
import { formatKeyboardShortcut } from "@/lib/utils/keyboard-shortcut";
import { ThreadListDropdown } from "@/components/chat-v2/ThreadListDropdown";
import { ThinkExLogo } from "@/components/ui/thinkex-logo";
import { useWorkspaceStore } from "@/lib/stores/workspace-store";
import { useUIStore } from "@/lib/stores/ui-store";
import {
  getActiveThread,
  useCreateThread,
  useRenameThread,
  useThreadList,
} from "@/components/chat-v2/runtime/use-thread-list";

interface Conversation {
  id: string;
  title: string;
  updated_at: string;
}

export function AppChatHeader({
  onClose,
  onCollapse,
  isMaximized,
  onToggleMaximize,
}: {
  onClose?: () => void;
  onCollapse?: () => void;
  isMaximized?: boolean;
  onToggleMaximize?: () => void;
  activeConversationId?: string | null;
  activeConversationTitle?: string;
  conversations?: Conversation[];
  onSelectConversation?: (conversationId: string) => void;
  onRenameConversation?: (conversationId: string, newTitle: string) => void;
  onDeleteConversation?: (conversationId: string) => void;
  onNewConversation?: () => void;
}) {
  const workspaceId = useWorkspaceStore((state) => state.currentWorkspaceId);
  const activeThreadId = useUIStore((state) => state.activeChatThreadId);
  const setActiveChatThreadId = useUIStore((state) => state.setActiveChatThreadId);
  const threadList = useThreadList(workspaceId);
  const createThread = useCreateThread(workspaceId ?? "");
  const renameThread = useRenameThread(workspaceId ?? "");
  const [isEditing, setIsEditing] = useState(false);
  const [titleValue, setTitleValue] = useState("");
  const titleTextareaRef = useRef<HTMLTextAreaElement>(null);

  const currentThread = getActiveThread(threadList.data ?? [], activeThreadId);
  const currentThreadTitle = currentThread?.title || "New Chat";

  useEffect(() => {
    if (threadList.data?.length && !currentThread) {
      setActiveChatThreadId(threadList.data[0]!.remoteId);
    }
  }, [currentThread, setActiveChatThreadId, threadList.data]);

  useEffect(() => {
    if (!isEditing) {
      setTitleValue(currentThreadTitle);
    }
  }, [currentThreadTitle, isEditing]);

  useEffect(() => {
    if (!isEditing || !titleTextareaRef.current) return;
    titleTextareaRef.current.focus();
    const length = titleTextareaRef.current.value.length;
    titleTextareaRef.current.setSelectionRange(length, length);
    titleTextareaRef.current.style.height = "auto";
    titleTextareaRef.current.style.height = `${titleTextareaRef.current.scrollHeight}px`;
  }, [isEditing]);

  const saveTitle = async () => {
    const title = titleValue.trim();
    if (!currentThread?.remoteId) {
      setIsEditing(false);
      return;
    }
    if (title && title !== currentThreadTitle) {
      await renameThread.mutateAsync({ threadId: currentThread.remoteId, title });
      toast.success("Title updated");
    }
    setIsEditing(false);
  };

  return (
    <div className="bg-sidebar">
      <div className="flex items-center justify-between py-2 px-3">
        <div className="flex items-center gap-2 flex-1 min-w-0">
          {isMaximized ? (
            <Link href="/home" className="group flex items-center shrink-0 rounded-md cursor-pointer mr-2" aria-label="ThinkEx">
              <div className="relative h-6 w-6 flex items-center justify-center transition-transform duration-200 group-hover:scale-105">
                <ThinkExLogo size={24} />
              </div>
            </Link>
          ) : null}

          <div className="flex items-center min-w-0">
            {isEditing ? (
              <textarea
                ref={titleTextareaRef}
                value={titleValue}
                onChange={(event) => setTitleValue(event.target.value)}
                onBlur={() => void saveTitle()}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    void saveTitle();
                  }
                  if (event.key === "Escape") {
                    event.preventDefault();
                    setTitleValue(currentThreadTitle);
                    setIsEditing(false);
                  }
                }}
                onInput={(event) => {
                  event.currentTarget.style.height = "auto";
                  event.currentTarget.style.height = `${event.currentTarget.scrollHeight}px`;
                }}
                className="text-sm font-medium bg-transparent border-none outline-none resize-none overflow-hidden min-w-0 text-sidebar-foreground placeholder:text-sidebar-foreground/60 focus:text-sidebar-foreground cursor-text"
                rows={1}
              />
            ) : (
              <button
                type="button"
                className="text-sm font-medium text-sidebar-foreground whitespace-nowrap truncate cursor-text hover:text-sidebar-foreground/80 transition-colors"
                onClick={() => setIsEditing(true)}
              >
                {currentThreadTitle}
              </button>
            )}
          </div>

          <Tooltip>
            <TooltipTrigger asChild>
              <button
                className="flex items-center justify-center text-sidebar-foreground/60 hover:text-sidebar-foreground/80 transition-colors flex-shrink-0 p-1 rounded hover:bg-sidebar-accent"
                aria-label="Current chat"
              >
                <ChevronDown className="h-3.5 w-3.5" />
              </button>
            </TooltipTrigger>
            <TooltipContent>{currentThreadTitle}</TooltipContent>
          </Tooltip>
        </div>

        <div className="flex items-center gap-2 flex-shrink-0">
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                aria-label="New conversation"
                className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-sidebar-border text-muted-foreground hover:text-sidebar-foreground hover:bg-sidebar-accent transition-colors cursor-pointer"
                onClick={async () => {
                  if (!workspaceId) return;
                  const result = await createThread.mutateAsync();
                  setActiveChatThreadId(result.remoteId);
                }}
              >
                <MessageSquarePlus className="h-4 w-4" />
              </button>
            </TooltipTrigger>
            <TooltipContent>New conversation</TooltipContent>
          </Tooltip>

          <ThreadListDropdown
            trigger={
              <button
                type="button"
                aria-label="Past chats"
                className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-sidebar-border text-muted-foreground hover:text-sidebar-foreground hover:bg-sidebar-accent transition-colors cursor-pointer"
              >
                <RiChatHistoryLine className="h-4 w-4" />
              </button>
            }
          />

          {typeof onToggleMaximize === "function" ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  aria-label={isMaximized ? "Minimize chat" : "Maximize chat"}
                  className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-sidebar-border text-muted-foreground hover:text-sidebar-foreground hover:bg-sidebar-accent transition-colors cursor-pointer"
                  onClick={() => onToggleMaximize?.()}
                >
                  {isMaximized ? <LuMinimize2 className="h-4 w-4" /> : <LuMaximize2 className="h-4 w-4" />}
                </button>
              </TooltipTrigger>
              <TooltipContent>
                {isMaximized ? "Minimize chat" : "Maximize chat"} <Kbd className="ml-1">{formatKeyboardShortcut("M")}</Kbd>
              </TooltipContent>
            </Tooltip>
          ) : null}

          {typeof onCollapse === "function" ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  aria-label={`Toggle chat (${formatKeyboardShortcut("J")})`}
                  className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-sidebar-border text-muted-foreground hover:text-sidebar-foreground hover:bg-sidebar-accent transition-colors cursor-pointer"
                  onClick={() => onCollapse?.()}
                >
                  <X className="h-4 w-4" />
                </button>
              </TooltipTrigger>
              <TooltipContent>
                Toggle chat <Kbd className="ml-1">{formatKeyboardShortcut("J")}</Kbd>
              </TooltipContent>
            </Tooltip>
          ) : null}

          {typeof onClose === "function" ? (
            <button
              type="button"
              aria-label="Close"
              className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-sidebar-border text-muted-foreground hover:text-sidebar-foreground hover:bg-sidebar-accent transition-colors cursor-pointer"
              onClick={() => onClose?.()}
            >
              <LuPanelRightClose className="h-4 w-4" />
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}

export function PopupHeader({ onClose }: { onClose?: () => void }) {
  return <AppChatHeader onClose={onClose} />;
}

export default AppChatHeader;
