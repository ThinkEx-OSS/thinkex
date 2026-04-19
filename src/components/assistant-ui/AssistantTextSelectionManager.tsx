"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import { cn } from "@/lib/utils";
import { focusComposerInput } from "@/lib/utils/composer-utils";
import { SelectionTooltip } from "@/components/ui/selection-tooltip";
import {
  AssistantThreadSelection,
  type SelectionInfo,
} from "@/components/assistant-ui/assistant-thread-selection";
import { useMainThreadId, useThreadListItemId } from "@/lib/chat/runtime";
import { useUIStore } from "@/lib/stores/ui-store";
import { useWorkspaceStore } from "@/lib/stores/workspace-store";

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

  const workspaceId = useWorkspaceStore((state) => state.currentWorkspaceId);

  const threadListItemId = useThreadListItemId();
  const mainThreadId = useMainThreadId();
  const currentThreadId = (threadListItemId || mainThreadId) ?? undefined;

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
    focusComposerInput();
  }, [currentSelection, addReplySelection]);

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
