"use client";

import { useEffect } from "react";

import { ChatDropzone } from "@/components/chat/ChatDropzone";
import { ChatHeader } from "@/components/chat/ChatHeader";
import { MultimodalInput } from "@/components/chat/MultimodalInput";
import { TextSelectionManager } from "@/components/chat/TextSelectionManager";
import { ThreadBody } from "@/components/chat/ThreadBody";
import { ThreadWelcome } from "@/components/chat/ThreadWelcome";
import {
  useWorkspaceItems,
  useWorkspaceItemsLoading,
} from "@/hooks/workspace/use-workspace-items";
import { ChatPanelSkeleton } from "@/components/workspace/WorkspaceLoader";
import { cn } from "@/lib/utils";

interface ChatPanelProps {
  workspaceId?: string | null;
  setIsChatExpanded?: (expanded: boolean) => void;
  isChatMaximized?: boolean;
  setIsChatMaximized?: (maximized: boolean) => void;
  onReady?: () => void;
}

/**
 * Renders the chat panel chrome (header, message list, composer, dropzone).
 * Assumes both `ChatProvider` and `ComposerProvider` already wrap this tree —
 * `WorkspaceLayout` mounts them once at the layout level so workspace UI
 * outside the chat panel can also drive the composer.
 */
export function ChatPanel({
  workspaceId,
  setIsChatExpanded,
  isChatMaximized = false,
  setIsChatMaximized,
  onReady,
}: ChatPanelProps) {
  const state = useWorkspaceItems();
  const isLoading = useWorkspaceItemsLoading();

  useEffect(() => {
    if (!workspaceId || isLoading || !onReady) return;
    onReady();
  }, [workspaceId, isLoading, onReady]);

  if (!workspaceId) return <ChatPanelSkeleton />;

  const handleToggleMaximize = () => {
    setIsChatMaximized?.(!isChatMaximized);
  };

  return (
    <div
      className={cn(
        "flex h-full bg-sidebar flex-col relative",
        isChatMaximized && "shadow-2xl",
      )}
      data-tour="chat-panel"
    >
      {/* Top fade: softens messages as they scroll under the floating header
          buttons. Sits above the message list (z-10) but below the buttons
          (z-20), and is non-interactive so scroll still works through it. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 z-10 h-12 bg-gradient-to-b from-sidebar/80 to-transparent"
      />

      <ChatHeader
        onCollapse={() => {
          if (isChatMaximized) setIsChatMaximized?.(false);
          setIsChatExpanded?.(false);
        }}
        isMaximized={isChatMaximized}
        onToggleMaximize={handleToggleMaximize}
      />

      <ChatDropzone>
        <div className="flex min-h-0 flex-1 flex-col">
          <div className="min-h-0 flex-1 overflow-hidden">
            <ThreadBody empty={<ThreadWelcome items={state} />} />
          </div>
          <div className="shrink-0 px-3 pb-3 sm:px-6">
            <div className="mx-auto w-full max-w-[46rem]">
              <MultimodalInput items={state} />
            </div>
          </div>
        </div>
      </ChatDropzone>

      <TextSelectionManager className="absolute inset-0 pointer-events-none" />
    </div>
  );
}
