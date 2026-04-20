"use client";

import { DevToolsModal } from "@assistant-ui/react-devtools";
import { Thread } from "./thread";
import { useWorkspaceState } from "@/hooks/workspace/use-workspace-state";
import { useWorkspaceContextProvider } from "@/hooks/ai/use-workspace-context-provider";
import { useWorkspaceContext } from "@/contexts/WorkspaceContext";
import AppChatHeader from "@/components/chat/AppChatHeader";
import { cn } from "@/lib/utils";
import AssistantTextSelectionManager from "@/components/assistant-ui/AssistantTextSelectionManager";
import { useEffect } from "react";
import { USE_NEW_CHAT } from "@/lib/chat-v2/feature-flag";
import { ChatV2Panel } from "@/components/chat-v2/ChatV2Panel";

interface AssistantPanelProps {
  workspaceId?: string | null;
  setIsChatExpanded?: (expanded: boolean) => void;
  isChatMaximized?: boolean;
  setIsChatMaximized?: (maximized: boolean) => void;
  onReady?: () => void;
}

export function AssistantPanel({
  workspaceId,
  setIsChatExpanded,
  isChatMaximized = false,
  setIsChatMaximized,
  onReady,
}: AssistantPanelProps) {
  // Don't render if no workspaceId
  if (!workspaceId) {
    return null;
  }

  return (
    <>
      <DevToolsModal />
      <WorkspaceContextWrapper
        workspaceId={workspaceId}
        setIsChatExpanded={setIsChatExpanded}
        isChatMaximized={isChatMaximized}
        setIsChatMaximized={setIsChatMaximized}
        onReady={onReady}
      />
    </>
  );
}

function WorkspaceContextWrapper({
  workspaceId,
  setIsChatExpanded,
  isChatMaximized,
  setIsChatMaximized,
  onReady,
}: {
  workspaceId?: string | null;
  setIsChatExpanded?: (expanded: boolean) => void;
  isChatMaximized?: boolean;
  setIsChatMaximized?: (maximized: boolean) => void;
  onReady?: () => void;
}) {
  // Fetch current workspace state (includes loading state)
  const { state, isLoading } = useWorkspaceState(workspaceId || null);

  return (
    <>

      <WorkspaceContextWrapperContent
        workspaceId={workspaceId}
        setIsChatExpanded={setIsChatExpanded}
        isChatMaximized={isChatMaximized}
        setIsChatMaximized={setIsChatMaximized}
        onReady={onReady}
        state={state}
        isLoading={isLoading}
      />
    </>
  );
}



function WorkspaceContextWrapperContent({
  workspaceId,
  setIsChatExpanded,
  isChatMaximized,
  setIsChatMaximized,
  onReady,
  state,
  isLoading,
}: {
  workspaceId?: string | null;
  setIsChatExpanded?: (expanded: boolean) => void;
  isChatMaximized?: boolean;
  setIsChatMaximized?: (maximized: boolean) => void;
  onReady?: () => void;
  state: ReturnType<typeof useWorkspaceState>["state"];
  isLoading: boolean;
}) {
  // Notify parent when content is ready
  useEffect(() => {
    if (!isLoading && state && onReady) {
      onReady();
    }
  }, [isLoading, state, onReady]);

  // Extract workspace items for context display
  const items = state;

  // Workspace name comes from canonical workspace metadata.
  const { currentWorkspace } = useWorkspaceContext();

  if (!USE_NEW_CHAT) {
    useWorkspaceContextProvider(workspaceId || null, state, currentWorkspace?.name);
  }

  if (USE_NEW_CHAT) {
    return (
      <ChatV2Panel
        workspaceId={workspaceId || ""}
        items={items}
        setIsChatExpanded={setIsChatExpanded}
        isChatMaximized={isChatMaximized}
        setIsChatMaximized={setIsChatMaximized}
        onReady={onReady}
      />
    );
  }



  // Handle maximize toggle from button
  const handleToggleMaximize = () => {
    setIsChatMaximized?.(!isChatMaximized);
  };

  return (
    <div
      className={cn(
        "flex h-full bg-sidebar flex-col relative",
        isChatMaximized && "shadow-2xl"
      )}
      data-tour="chat-panel"
    >
      {/* Chat Header */}
      <AppChatHeader
        onCollapse={() => {
          if (isChatMaximized) setIsChatMaximized?.(false);
          setIsChatExpanded?.(false);
        }}
        isMaximized={isChatMaximized}
        onToggleMaximize={handleToggleMaximize}
      />

      {/* Assistant UI Thread */}
      <div className="flex-1 overflow-hidden">
        <Thread items={items} />
      </div>

      {/* Text selection → Ask AI (composer context) */}
      <AssistantTextSelectionManager className="absolute inset-0 pointer-events-none" />
    </div>
  );
}
