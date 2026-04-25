"use client";

import { X } from "lucide-react";
import { LuMaximize2, LuMinimize2 } from "react-icons/lu";
import { RiChatHistoryLine } from "react-icons/ri";

import { ThreadListDropdown } from "@/components/chat/ThreadListDropdown";
import { Kbd } from "@/components/ui/kbd";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { formatKeyboardShortcut } from "@/lib/utils/keyboard-shortcut";

interface ChatHeaderProps {
  onCollapse?: () => void;
  isMaximized?: boolean;
  onToggleMaximize?: () => void;
}

/**
 * Floating action cluster rendered in the top-right corner of the chat
 * panel. Intentionally not a bordered/backed "header" — just three controls
 * (history, maximize, collapse) hovering over the message list.
 *
 * Positioned absolutely by design: we want messages to flow under it rather
 * than being pushed down by a dedicated header row.
 */
export function ChatHeader({
  onCollapse,
  isMaximized,
  onToggleMaximize,
}: ChatHeaderProps) {
  const buttonClass =
    "inline-flex h-8 w-8 items-center justify-center rounded-md border border-sidebar-border bg-sidebar text-muted-foreground hover:text-sidebar-foreground hover:bg-accent transition-colors cursor-pointer";

  return (
    <div className="pointer-events-none absolute top-2 right-2 z-20 flex items-center gap-2">
      <div className="pointer-events-auto flex items-center gap-2">
        <ThreadListDropdown
          trigger={
            <button
              type="button"
              aria-label="Past chats"
              className={buttonClass}
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
                className={buttonClass}
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
                className={buttonClass}
                onClick={() => onCollapse?.()}
              >
                <X className="h-4 w-4" />
              </button>
            </TooltipTrigger>
            <TooltipContent>
              Toggle chat{" "}
              <Kbd className="ml-1">{formatKeyboardShortcut("J")}</Kbd>
            </TooltipContent>
          </Tooltip>
        )}
      </div>
    </div>
  );
}

export default ChatHeader;
