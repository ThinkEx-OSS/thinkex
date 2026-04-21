"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { useChatContext } from "@/components/chat/ChatProvider";
import { useOptionalComposer } from "@/components/chat/composer-context";
import {
  AssistantThreadSelection,
  type SelectionInfo,
} from "@/components/chat/parts/AssistantThreadSelection";
import { SelectionTooltip } from "@/components/ui/selection-tooltip";
import { useUIStore } from "@/lib/stores/ui-store";
import { useWorkspaceStore } from "@/lib/stores/workspace-store";
import { cn } from "@/lib/utils";

/**
 * Listens for text selections inside the conversation viewport and surfaces
 * an "Ask AI" tooltip that pushes the selection into `useUIStore` as a reply.
 * The new Conversation component still tags its viewport with
 * `.aui-thread-viewport`, so the DOM hook from the legacy implementation keeps
 * working unchanged.
 */
export function TextSelectionManager({ className }: { className?: string }) {
  const { threadId } = useChatContext();
  const composer = useOptionalComposer();
  const workspaceId = useWorkspaceStore((s) => s.currentWorkspaceId);

  const addReplySelection = useUIStore((s) => s.addReplySelection);
  const clearReplySelections = useUIStore((s) => s.clearReplySelections);

  const [tooltipPosition, setTooltipPosition] = useState({ x: 0, y: 0 });
  const [currentSelection, setCurrentSelection] = useState<SelectionInfo | null>(
    null,
  );

  // Wipe selections when the workspace or active thread changes.
  const prevWorkspaceIdRef = useRef<string | null>(workspaceId);
  useEffect(() => {
    if (
      prevWorkspaceIdRef.current !== null &&
      prevWorkspaceIdRef.current !== workspaceId
    ) {
      window.getSelection()?.removeAllRanges();
      setCurrentSelection(null);
      clearReplySelections();
    }
    prevWorkspaceIdRef.current = workspaceId;
  }, [workspaceId, clearReplySelections]);

  const prevThreadIdRef = useRef<string | undefined>(threadId);
  useEffect(() => {
    if (
      prevThreadIdRef.current !== undefined &&
      prevThreadIdRef.current !== threadId
    ) {
      window.getSelection()?.removeAllRanges();
      setCurrentSelection(null);
      clearReplySelections();
    }
    prevThreadIdRef.current = threadId;
  }, [threadId, clearReplySelections]);

  const handleSelectionChange = useCallback(
    (selection: SelectionInfo | null) => {
      if (selection) {
        setCurrentSelection(selection);
        if (selection.position) setTooltipPosition(selection.position);
      } else {
        setCurrentSelection(null);
        window.getSelection()?.removeAllRanges();
      }
    },
    [],
  );

  const handleAskAi = useCallback(() => {
    if (!currentSelection) return;
    addReplySelection({
      text: currentSelection.text,
      title: "Assistant message",
    });
    setCurrentSelection(null);
    window.getSelection()?.removeAllRanges();
    composer?.focus();
  }, [currentSelection, addReplySelection, composer]);

  return (
    <>
      <AssistantThreadSelection
        className={cn("fixed inset-0 pointer-events-none", className)}
        onSelectionChange={handleSelectionChange}
        containerSelector=".aui-thread-viewport"
      />
      <SelectionTooltip
        visible={!!currentSelection}
        position={tooltipPosition}
        referenceElement={currentSelection?.range ?? null}
        onClick={handleAskAi}
        onHide={() => {
          setCurrentSelection(null);
          window.getSelection()?.removeAllRanges();
        }}
      />
    </>
  );
}
