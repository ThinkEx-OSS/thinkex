"use client";

import { DevToolsModal } from "@assistant-ui/react-devtools";
import { useAui, useAuiState } from "@assistant-ui/react";
import { Thread } from "./thread";
import { useWorkspaceState } from "@/hooks/workspace/use-workspace-state";
import { useWorkspaceContextProvider } from "@/hooks/ai/use-workspace-context-provider";
import AppChatHeader from "@/components/chat/AppChatHeader";
import { cn } from "@/lib/utils";
import AssistantTextSelectionManager from "@/components/assistant-ui/AssistantTextSelectionManager";
import { useUIStore, selectSelectedCardIdsArray } from "@/lib/stores/ui-store";
import { useShallow } from "zustand/react/shallow";
import { useMemo, useEffect, useRef } from "react";
import { useSearchParams, useRouter } from "next/navigation";

interface AssistantPanelProps {
  workspaceId?: string | null;
  setIsChatExpanded?: (expanded: boolean) => void;
  isChatMaximized?: boolean;
  setIsChatMaximized?: (maximized: boolean) => void;
  onSingleSelect?: (text: string, range?: Range) => void | Promise<void>;
  onMultiSelect?: (selections: Array<{ text: string; id: string; range?: Range }>) => void | Promise<void>;
  onReady?: () => void;
  onThreadRunningChange?: (isRunning: boolean) => void;
}

export function AssistantPanel({
  workspaceId,
  setIsChatExpanded,
  isChatMaximized = false,
  setIsChatMaximized,
  onSingleSelect,
  onMultiSelect,
  onReady,
  onThreadRunningChange,
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
        onThreadRunningChange={onThreadRunningChange}
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
  onReady,
  onThreadRunningChange,
}: {
  workspaceId?: string | null;
  setIsChatExpanded?: (expanded: boolean) => void;
  isChatMaximized?: boolean;
  setIsChatMaximized?: (maximized: boolean) => void;
  onSingleSelect?: (text: string, range?: Range) => void | Promise<void>;
  onMultiSelect?: (selections: Array<{ text: string; id: string; range?: Range }>) => void | Promise<void>;
  onReady?: () => void;
  onThreadRunningChange?: (isRunning: boolean) => void;
}) {
  // Fetch current workspace state (includes loading state)
  const { state, isLoading } = useWorkspaceState(workspaceId || null);

  return (
    <>
      <CreateFromPromptHandler
        workspaceId={workspaceId ?? null}
        isLoading={isLoading}
        setIsChatExpanded={setIsChatExpanded}
      />
      <GenerateStudyMaterialsHandler
        workspaceId={workspaceId ?? null}
        isLoading={isLoading}
        setIsChatExpanded={setIsChatExpanded}
      />
      <WorkspaceContextWrapperContent
        workspaceId={workspaceId}
        setIsChatExpanded={setIsChatExpanded}
        isChatMaximized={isChatMaximized}
        setIsChatMaximized={setIsChatMaximized}
        onSingleSelect={onSingleSelect}
        onMultiSelect={onMultiSelect}
        onReady={onReady}
        state={state}
        isLoading={isLoading}
        onThreadRunningChange={onThreadRunningChange}
      />
    </>
  );
}

function CreateFromPromptHandler({
  workspaceId,
  isLoading,
  setIsChatExpanded,
}: {
  workspaceId: string | null;
  isLoading: boolean;
  setIsChatExpanded?: (expanded: boolean) => void;
}) {
  const searchParams = useSearchParams();
  const router = useRouter();
  const aui = useAui();
  const hasAutoSentRef = useRef(false);
  const timeoutIdsRef = useRef<ReturnType<typeof setTimeout>[]>([]);

  const createFrom = searchParams.get("createFrom");

  useEffect(() => {
    if (!createFrom || !workspaceId || isLoading || hasAutoSentRef.current) return;

    setIsChatExpanded?.(true);

    const wrapped = `Update the preexisting contents of this workspace to be about ${createFrom}. Only add one quality YouTube video.`;

    let attempts = 0;
    const maxAttempts = 12;
    const intervalMs = 200;
    const ids = timeoutIdsRef.current;

    const clearAll = () => {
      ids.forEach((tid) => clearTimeout(tid));
      ids.length = 0;
    };

    const trySend = () => {
      attempts += 1;
      const composer = aui?.composer?.();
      if (composer) {
        try {
          composer.setText(wrapped);
          composer.send();
          hasAutoSentRef.current = true;
          clearAll();
          const url = new URL(window.location.href);
          url.searchParams.delete("createFrom");
          router.replace(url.pathname + url.search);
          return;
        } catch {
          // fall through to retry
        }
      }
      if (attempts < maxAttempts) {
        const id = setTimeout(trySend, intervalMs);
        ids.push(id);
      }
    };

    const id = setTimeout(trySend, 100);
    ids.push(id);

    return () => clearAll();
  }, [createFrom, workspaceId, isLoading, aui, router, setIsChatExpanded]);

  return null;
}

function GenerateStudyMaterialsHandler({
  workspaceId,
  isLoading,
  setIsChatExpanded,
}: {
  workspaceId: string | null;
  isLoading: boolean;
  setIsChatExpanded?: (expanded: boolean) => void;
}) {
  const searchParams = useSearchParams();
  const router = useRouter();
  const aui = useAui();
  const hasAutoSentRef = useRef(false);
  const timeoutIdsRef = useRef<ReturnType<typeof setTimeout>[]>([]);

  const action = searchParams.get("action");

  useEffect(() => {
    if (action !== "generate_study_materials" || !workspaceId || isLoading || hasAutoSentRef.current) return;

    setIsChatExpanded?.(true);

    const prompt = `First, process any PDF files in this workspace.
    
Then, using the content:
1. Update the note with a comprehensive summary
2. Update the quiz with 5-10 relevant questions
3. Update the flashcards with key terms and concepts
4. Search and add one relevant YouTube video if possible`;

    let attempts = 0;
    const maxAttempts = 12;
    const intervalMs = 200;
    const ids = timeoutIdsRef.current;

    const clearAll = () => {
      ids.forEach((tid) => clearTimeout(tid));
      ids.length = 0;
    };

    const trySend = () => {
      attempts += 1;
      const composer = aui?.composer?.();
      if (composer) {
        try {
          composer.setText(prompt);
          composer.send();
          hasAutoSentRef.current = true;
          clearAll();
          const url = new URL(window.location.href);
          url.searchParams.delete("action");
          router.replace(url.pathname + url.search);
          return;
        } catch {
          // fall through to retry
        }
      }
      if (attempts < maxAttempts) {
        const id = setTimeout(trySend, intervalMs);
        ids.push(id);
      }
    };

    const id = setTimeout(trySend, 100);
    ids.push(id);

    return () => clearAll();
  }, [action, workspaceId, isLoading, aui, router, setIsChatExpanded]);

  return null;
}

function WorkspaceContextWrapperContent({
  workspaceId,
  setIsChatExpanded,
  isChatMaximized,
  setIsChatMaximized,
  onSingleSelect,
  onMultiSelect,
  onReady,
  state,
  isLoading,
  onThreadRunningChange,
}: {
  workspaceId?: string | null;
  setIsChatExpanded?: (expanded: boolean) => void;
  isChatMaximized?: boolean;
  setIsChatMaximized?: (maximized: boolean) => void;
  onSingleSelect?: (text: string, range?: Range) => void | Promise<void>;
  onMultiSelect?: (selections: Array<{ text: string; id: string; range?: Range }>) => void | Promise<void>;
  onReady?: () => void;
  state: ReturnType<typeof useWorkspaceState>["state"];
  isLoading: boolean;
  onThreadRunningChange?: (isRunning: boolean) => void;
}) {
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
      <ThreadRunningObserver onRunningChange={onThreadRunningChange} />

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

function ThreadRunningObserver({ onRunningChange }: { onRunningChange?: (isRunning: boolean) => void }) {
  const isRunning = useAuiState(({ thread }) => (thread as any)?.isRunning ?? false);

  useEffect(() => {
    onRunningChange?.(isRunning);
  }, [isRunning, onRunningChange]);

  return null;
}
