"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import { cn } from "@/lib/utils";
import { SelectionTooltip } from "@/components/ui/selection-tooltip";
import {
  AssistantThreadSelection,
  type SelectionInfo,
} from "@/components/chat-v2/AssistantThreadSelection";
import { useUIStore } from "@/lib/stores/ui-store";
import { useWorkspaceStore } from "@/lib/stores/workspace-store";
import { useComposerOptional } from "@/components/chat-v2/runtime/composer-context";
import { useThread } from "@/components/chat-v2/runtime/thread-context";

export default function AssistantTextSelectionManager({
  className,
}: {
  className?: string;
}) {
  const addReplySelection = useUIStore((state) => state.addReplySelection);
  const clearReplySelections = useUIStore(
    (state) => state.clearReplySelections,
  );

  const [tooltipPosition, setTooltipPosition] = useState({ x: 0, y: 0 });
  const [currentSelection, setCurrentSelection] =
    useState<SelectionInfo | null>(null);

  const composer = useComposerOptional();
  const { threadId: currentThreadId } = useThread();
  const workspaceId = useWorkspaceStore((state) => state.currentWorkspaceId);

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

  const prevThreadIdRef = useRef<string | undefined>(currentThreadId);
  useEffect(() => {
    if (
      prevThreadIdRef.current !== undefined &&
      prevThreadIdRef.current !== currentThreadId
    ) {
      window.getSelection()?.removeAllRanges();
      setCurrentSelection(null);
      clearReplySelections();
    }
    prevThreadIdRef.current = currentThreadId;
  }, [currentThreadId, clearReplySelections]);

  const handleSelectionChange = useCallback(
    (selection: SelectionInfo | null) => {
      if (selection) {
        setCurrentSelection(selection);
        if (selection.position) {
          setTooltipPosition(selection.position);
        }
      } else {
        setCurrentSelection(null);
        window.getSelection()?.removeAllRanges();
      }
    },
    [],
  );

  const handleAskAi = useCallback(() => {
    if (!currentSelection) {
      console.warn(
        "[AssistantTextSelectionManager] handleAskAi - no selection to add",
      );
      return;
    }

    addReplySelection({
      text: currentSelection.text,
      title: "Assistant message",
    });

    setCurrentSelection(null);
    window.getSelection()?.removeAllRanges();
    composer?.focus();
  }, [composer, currentSelection, addReplySelection]);

  return (
    <>
      <AssistantThreadSelection
        className={cn("fixed inset-0 pointer-events-none", className)}
        onSelectionChange={handleSelectionChange}
        containerSelector=".chat-v2-thread-viewport"
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
