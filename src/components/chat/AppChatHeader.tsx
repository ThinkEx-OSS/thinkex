"use client";

import Link from "next/link";
import { X } from "lucide-react";
import { RiChatHistoryLine } from "react-icons/ri";
import { LuMaximize2, LuMinimize2, LuPanelRightClose } from "react-icons/lu";
import { useThreadListItem } from "@assistant-ui/react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Kbd } from "@/components/ui/kbd";
import { formatKeyboardShortcut } from "@/lib/utils/keyboard-shortcut";
import { ThreadListDropdown } from "@/components/assistant-ui/thread-list-dropdown";
import { ThinkExLogo } from "@/components/ui/thinkex-logo";

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
}) {
  const threadListItem = useThreadListItem();
  const currentThreadTitle = threadListItem?.title || "New Chat";

  return (
    <div className="bg-sidebar">
      <div className="flex items-center justify-between py-2 px-3">
        <div className="flex items-center gap-2 flex-1 min-w-0">
          {isMaximized && (
            <Link
              href="/home"
              className="group flex items-center shrink-0 rounded-md cursor-pointer mr-2"
              aria-label="ThinkEx"
            >
              <div className="relative h-6 w-6 flex items-center justify-center transition-transform duration-200 group-hover:scale-105">
                <ThinkExLogo size={24} />
              </div>
            </Link>
          )}

          <h2 className="text-sm font-medium text-sidebar-foreground truncate min-w-0 pr-2">
            {currentThreadTitle}
          </h2>
        </div>

        <div className="flex items-center gap-2 flex-shrink-0">
          <ThreadListDropdown
            trigger={
              <button
                type="button"
                aria-label="Past chats"
                title="Past chats"
                className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-sidebar-border text-muted-foreground hover:text-sidebar-foreground hover:bg-sidebar-accent transition-colors cursor-pointer"
              >
                <RiChatHistoryLine className="h-4 w-4" />
              </button>
            }
          />

          {typeof onToggleMaximize === "function" && (
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  aria-label={isMaximized ? "Minimize chat" : "Maximize chat"}
                  className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-sidebar-border text-muted-foreground hover:text-sidebar-foreground hover:bg-sidebar-accent transition-colors cursor-pointer"
                  onClick={() => onToggleMaximize?.()}
                >
                  {isMaximized ? (
                    <LuMinimize2 className="h-4 w-4" />
                  ) : (
                    <LuMaximize2 className="h-4 w-4" />
                  )}
                </button>
              </TooltipTrigger>
              <TooltipContent>
                {isMaximized ? "Minimize chat" : "Maximize chat"}{" "}
                <Kbd className="ml-1">{formatKeyboardShortcut("M")}</Kbd>
              </TooltipContent>
            </Tooltip>
          )}

          {typeof onCollapse === "function" && (
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
          )}
          {typeof onClose === "function" && (
            <button
              type="button"
              aria-label="Close"
              className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-sidebar-border text-muted-foreground hover:text-sidebar-foreground hover:bg-sidebar-accent transition-colors cursor-pointer"
              onClick={() => onClose?.()}
            >
              <LuPanelRightClose className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export default AppChatHeader;
