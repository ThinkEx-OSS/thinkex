"use client";

import { useEffect, useMemo } from "react";
import { Loader2 } from "lucide-react";
import { Thread } from "@/components/chat-v2/Thread";
import type { ComposerHandle } from "@/components/chat-v2/runtime/composer-context";
import {
  getActiveThread,
  useCreateThread,
  useThreadList,
} from "@/components/chat-v2/runtime/use-thread-list";
import AppChatHeader from "@/components/chat/AppChatHeader";
import { useWorkspaceContext } from "@/contexts/WorkspaceContext";
import { useWorkspaceState } from "@/hooks/workspace/use-workspace-state";
import { useUIStore } from "@/lib/stores/ui-store";
import { cn } from "@/lib/utils";

interface AssistantPanelProps {
  workspaceId?: string | null;
  setIsChatExpanded?: (expanded: boolean) => void;
  isChatMaximized?: boolean;
  setIsChatMaximized?: (maximized: boolean) => void;
  onComposerHandleChange?: (handle: ComposerHandle | null) => void;
}

export function AssistantPanel({
  workspaceId,
  setIsChatExpanded,
  isChatMaximized = false,
  setIsChatMaximized,
  onComposerHandleChange,
}: AssistantPanelProps) {
  const { state, isLoading } = useWorkspaceState(workspaceId || null);
  const { currentWorkspace } = useWorkspaceContext();
  const activeThreadId = useUIStore((store) => store.activeChatThreadId);
  const setActiveChatThreadId = useUIStore((store) => store.setActiveChatThreadId);
  const threadList = useThreadList(workspaceId ?? null);
  const createThread = useCreateThread(workspaceId ?? "");

  const resolvedThread = useMemo(
    () => getActiveThread(threadList.data ?? [], activeThreadId),
    [activeThreadId, threadList.data],
  );

  useEffect(() => {
    if (!workspaceId || threadList.isLoading) return;

    const threads = threadList.data ?? [];
    if (threads.length === 0) {
      if (!createThread.isPending) {
        void createThread.mutateAsync().then((result) => {
          setActiveChatThreadId(result.remoteId);
        });
      }
      return;
    }

    if (!resolvedThread) {
      setActiveChatThreadId(threads[0]!.remoteId);
    }
  }, [
    createThread,
    resolvedThread,
    setActiveChatThreadId,
    threadList.data,
    threadList.isLoading,
    workspaceId,
  ]);

  if (!workspaceId) {
    return null;
  }

  const handleToggleMaximize = () => {
    setIsChatMaximized?.(!isChatMaximized);
  };

  const isPendingThreadCreation =
    !threadList.isLoading && (threadList.data?.length ?? 0) === 0 && createThread.isPending;
  const isPending =
    isLoading || threadList.isLoading || isPendingThreadCreation || !resolvedThread;

  return (
    <div
      className={cn(
        "relative flex h-full flex-col bg-sidebar",
        isChatMaximized && "shadow-2xl",
      )}
      data-tour="chat-panel"
    >
      <AppChatHeader
        onCollapse={() => {
          if (isChatMaximized) setIsChatMaximized?.(false);
          setIsChatExpanded?.(false);
        }}
        isMaximized={isChatMaximized}
        onToggleMaximize={handleToggleMaximize}
      />

      <div className="flex-1 overflow-hidden">
        {isPending ? (
          <div className="flex h-full items-center justify-center">
            <Loader2 className="size-5 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <Thread
            threadId={resolvedThread.remoteId}
            workspaceId={workspaceId}
            items={state}
            workspaceName={currentWorkspace?.name}
            onComposerHandleChange={onComposerHandleChange}
          />
        )}
      </div>
    </div>
  );
}
