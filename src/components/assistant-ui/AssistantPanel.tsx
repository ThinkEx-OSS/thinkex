"use client";

import { DevToolsModal } from "@assistant-ui/react-devtools";
import { Thread } from "./thread";
import { useWorkspaceState } from "@/hooks/workspace/use-workspace-state";
import { useWorkspaceContextProvider } from "@/hooks/ai/use-workspace-context-provider";
import { useSelectedActionsContextProvider } from "@/hooks/ai/use-selected-actions-context-provider";
import { useBlockNoteSelectionContextProvider } from "@/hooks/ai/use-blocknote-selection-context-provider";
import AppChatHeader from "@/components/chat/AppChatHeader";
import { cn } from "@/lib/utils";
import AssistantTextSelectionManager from "@/components/assistant-ui/AssistantTextSelectionManager";
import { useUIStore, selectSelectedCardIdsArray } from "@/lib/stores/ui-store";
import { useShallow } from "zustand/react/shallow";
import { useMemo, useEffect } from "react";

interface AssistantPanelProps {
  workspaceId?: string | null;
  setIsChatExpanded?: (expanded: boolean) => void;
  isChatMaximized?: boolean;
  setIsChatMaximized?: (maximized: boolean) => void;
  onSingleSelect?: (text: string, range?: Range) => void | Promise<void>;
  onMultiSelect?: (selections: Array<{ text: string; id: string; range?: Range }>) => void | Promise<void>;
  onReady?: () => void;
}

export function AssistantPanel({
  workspaceId,
  setIsChatExpanded,
  isChatMaximized = false,
  setIsChatMaximized,
  onSingleSelect,
  onMultiSelect,
  onReady
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
        onSingleSelect={onSingleSelect}
        onMultiSelect={onMultiSelect}
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
  onSingleSelect,
  onMultiSelect,
  onReady
}: {
  workspaceId?: string | null;
  setIsChatExpanded?: (expanded: boolean) => void;
  isChatMaximized?: boolean;
  setIsChatMaximized?: (maximized: boolean) => void;
  onSingleSelect?: (text: string, range?: Range) => void | Promise<void>;
  onMultiSelect?: (selections: Array<{ text: string; id: string; range?: Range }>) => void | Promise<void>;
  onReady?: () => void;
}) {
  // Fetch current workspace state (includes loading state)
  const { state, isLoading } = useWorkspaceState(workspaceId || null);

  // Notify parent when content is ready
  useEffect(() => {
    if (!isLoading && state && onReady) {
      onReady();
    }
  }, [isLoading, state, onReady]);

  // Extract workspace items for context display
  const items = state?.items || [];

  // Get selected card IDs from UI store
  // Use array selector with shallow comparison to prevent unnecessary re-renders and SSR issues
  const selectedCardIdsArray = useUIStore(
    useShallow(selectSelectedCardIdsArray)
  );
  const selectedCardIds = useMemo(() => new Set(selectedCardIdsArray), [selectedCardIdsArray]);

  // Get selected actions from UI store
  const selectedActions = useUIStore((state) => state.selectedActions);

  // Filter items to get only selected cards
  const selectedItems = useMemo(
    () => items.filter((item) => selectedCardIds.has(item.id)),
    [items, selectedCardIds]
  );

  // Inject minimal workspace context (metadata and system instructions only)
  // Cards register their own context individually
  useWorkspaceContextProvider(workspaceId || null, state);


  // Inject selected actions context as system instructions
  useSelectedActionsContextProvider(selectedActions);

  // Inject BlockNote selection context as system instructions
  useBlockNoteSelectionContextProvider();

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
        onCollapse={() => setIsChatExpanded?.(false)}
        isMaximized={isChatMaximized}
        onToggleMaximize={handleToggleMaximize}
      />

      {/* Assistant UI Thread */}
      <div className="flex-1 overflow-hidden">
        <Thread items={items} />
      </div>

      {/* Text Selection Manager for highlighting assistant responses */}
      <AssistantTextSelectionManager
        className="absolute inset-0 pointer-events-none"
        onSingleSelect={onSingleSelect}
        onMultiSelect={onMultiSelect}
      />
    </div>
  );
}
