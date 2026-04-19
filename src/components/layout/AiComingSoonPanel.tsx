"use client";

import Link from "next/link";
import { Sparkles, X } from "lucide-react";
import { LuMaximize2, LuMinimize2 } from "react-icons/lu";
import { Kbd } from "@/components/ui/kbd";
import { ThinkExLogo } from "@/components/ui/thinkex-logo";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { formatKeyboardShortcut } from "@/lib/utils/keyboard-shortcut";

interface AiComingSoonPanelProps {
  onCollapse?: () => void;
  isMaximized?: boolean;
  onToggleMaximize?: () => void;
}

export function AiComingSoonPanel({
  onCollapse,
  isMaximized = false,
  onToggleMaximize,
}: AiComingSoonPanelProps) {
  return (
    <div
      className={cn(
        "flex h-full w-full flex-col bg-sidebar",
        isMaximized && "shadow-2xl",
      )}
      data-tour="chat-panel"
    >
      <div className="flex items-center justify-between px-3 py-2">
        <div className="flex min-w-0 flex-1 items-center gap-2">
          {isMaximized ? (
            <Link
              href="/home"
              className="group mr-2 flex shrink-0 items-center rounded-md cursor-pointer"
              aria-label="ThinkEx"
            >
              <div className="relative flex h-6 w-6 items-center justify-center transition-transform duration-200 group-hover:scale-105">
                <ThinkExLogo size={24} />
              </div>
            </Link>
          ) : null}
          <h2 className="truncate whitespace-nowrap text-sm font-medium text-sidebar-foreground">
            AI
          </h2>
        </div>

        <div className="flex flex-shrink-0 items-center gap-2">
          {typeof onToggleMaximize === "function" ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  aria-label={isMaximized ? "Minimize panel" : "Maximize panel"}
                  className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-sidebar-border text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-foreground transition-colors cursor-pointer"
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
                {isMaximized ? "Minimize" : "Maximize"} <Kbd className="ml-1">{formatKeyboardShortcut("M")}</Kbd>
              </TooltipContent>
            </Tooltip>
          ) : null}
          {typeof onCollapse === "function" ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  aria-label={`Close panel (${formatKeyboardShortcut("J")})`}
                  className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-sidebar-border text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-foreground transition-colors cursor-pointer"
                  onClick={() => onCollapse?.()}
                >
                  <X className="h-4 w-4" />
                </button>
              </TooltipTrigger>
              <TooltipContent>
                Toggle panel <Kbd className="ml-1">{formatKeyboardShortcut("J")}</Kbd>
              </TooltipContent>
            </Tooltip>
          ) : null}
        </div>
      </div>

      <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 text-center">
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-sidebar-accent/60">
          <Sparkles className="h-6 w-6 text-muted-foreground" aria-hidden="true" />
        </div>
        <div className="space-y-1">
          <p className="text-base font-medium text-sidebar-foreground">AI coming soon</p>
          <p className="max-w-[240px] text-xs text-muted-foreground">
            The ThinkEx AI assistant is being rebuilt. Check back soon.
          </p>
        </div>
      </div>
    </div>
  );
}
