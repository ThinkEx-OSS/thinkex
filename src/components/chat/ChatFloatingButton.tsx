"use client";

import { FaRegMessage } from "react-icons/fa6";
import { usePostHog } from 'posthog-js/react';
import { formatKeyboardShortcut } from "@/lib/utils/keyboard-shortcut";
import { cn } from "@/lib/utils";

interface ChatFloatingButtonProps {
  isDesktop: boolean;
  isChatExpanded: boolean;
  setIsChatExpanded: (expanded: boolean) => void;
}

export default function ChatFloatingButton({
  isDesktop,
  isChatExpanded,
  setIsChatExpanded,
}: ChatFloatingButtonProps) {
  const posthog = usePostHog();

  if (!isDesktop || isChatExpanded) {
    return null;
  }

  return (
    <button
      onClick={() => {
        posthog.capture('chat_opened', { from: 'header_button' });
        setIsChatExpanded(true);
      }}
      className={cn(
        "inline-flex items-center gap-2 h-8 px-2 outline-none rounded-md text-sm pointer-events-auto whitespace-nowrap relative cursor-pointer box-border",
        "border border-sidebar-border text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent transition-colors"
      )}
      data-tour="chat-toggle"
      aria-label={`Open AI Chat (${formatKeyboardShortcut('J')})`}
      title={`Open AI Chat (${formatKeyboardShortcut('J')})`}
    >
      <FaRegMessage className="h-4 w-4" />
      AI Chat
    </button>
  );
}
