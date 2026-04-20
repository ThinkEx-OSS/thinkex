"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { useUIStore } from "@/lib/stores/ui-store";
import { SelectionTooltip } from "@/components/ui/selection-tooltip";
import type { SelectionInfo } from "@/components/assistant-ui/assistant-thread-selection";

function extractSelectionTextForReply(selection: Selection) {
  return selection.toString().trim();
}

function calculateTooltipPosition(range: Range) {
  const rect = range.getBoundingClientRect();
  return { y: rect.top, x: rect.left + rect.width / 2 };
}

function ChatV2ThreadSelection({ onSelectionChange, containerSelector, className }: { onSelectionChange?: (selection: SelectionInfo | null) => void; containerSelector: string; className?: string }) {
  const currentSelectionRef = useRef<SelectionInfo | null>(null);
  const mouseUpPositionRef = useRef<{ x: number; y: number } | null>(null);

  const clear = useCallback(() => {
    mouseUpPositionRef.current = null;
    currentSelectionRef.current = null;
    onSelectionChange?.(null);
  }, [onSelectionChange]);

  const commitSelection = useCallback(() => {
    requestAnimationFrame(() => {
      const selection = window.getSelection();
      if (!selection || selection.isCollapsed || selection.rangeCount === 0) {
        clear();
        return;
      }
      const text = extractSelectionTextForReply(selection);
      if (!text) {
        clear();
        return;
      }
      const container = document.querySelector(containerSelector);
      if (!container) {
        clear();
        return;
      }
      const range = selection.getRangeAt(0);
      const startEl = range.startContainer.nodeType === Node.TEXT_NODE ? range.startContainer.parentElement : (range.startContainer as Element);
      const endEl = range.endContainer.nodeType === Node.TEXT_NODE ? range.endContainer.parentElement : (range.endContainer as Element);
      if (!container.contains(range.startContainer) || !container.contains(range.endContainer) || !startEl?.closest(".chat-v2-assistant-message-content") || !endEl?.closest(".chat-v2-assistant-message-content")) {
        clear();
        return;
      }
      const position = mouseUpPositionRef.current ?? calculateTooltipPosition(range);
      const info: SelectionInfo = { text, position, range: range.cloneRange() };
      currentSelectionRef.current = info;
      onSelectionChange?.(info);
    });
  }, [clear, containerSelector, onSelectionChange]);

  useEffect(() => {
    const handleMouseUp = (event: MouseEvent) => {
      mouseUpPositionRef.current = { x: event.clientX, y: event.clientY };
      commitSelection();
    };
    const handleKeyUp = () => commitSelection();
    const handleSelectionChange = () => {
      const selection = window.getSelection();
      if (!selection || selection.isCollapsed) clear();
    };
    document.addEventListener("mouseup", handleMouseUp);
    document.addEventListener("keyup", handleKeyUp);
    document.addEventListener("selectionchange", handleSelectionChange);
    return () => {
      document.removeEventListener("mouseup", handleMouseUp);
      document.removeEventListener("keyup", handleKeyUp);
      document.removeEventListener("selectionchange", handleSelectionChange);
    };
  }, [clear, commitSelection]);

  return <div className={className} />;
}

export function TextSelectionManager({ className, currentThreadId, onFocusComposer }: { className?: string; currentThreadId?: string | null; onFocusComposer: () => void }) {
  const addReplySelection = useUIStore((state) => state.addReplySelection);
  const clearReplySelections = useUIStore((state) => state.clearReplySelections);
  const [tooltipPosition, setTooltipPosition] = useState({ x: 0, y: 0 });
  const [currentSelection, setCurrentSelection] = useState<SelectionInfo | null>(null);
  const previousThreadIdRef = useRef<string | null | undefined>(currentThreadId);

  useEffect(() => {
    if (previousThreadIdRef.current && previousThreadIdRef.current !== currentThreadId) {
      window.getSelection()?.removeAllRanges();
      setCurrentSelection(null);
      clearReplySelections();
    }
    previousThreadIdRef.current = currentThreadId;
  }, [clearReplySelections, currentThreadId]);

  return (
    <>
      <ChatV2ThreadSelection
        className={cn("fixed inset-0 pointer-events-none", className)}
        containerSelector=".chat-v2-thread-viewport"
        onSelectionChange={(selection) => {
          if (!selection) {
            setCurrentSelection(null);
            return;
          }
          setCurrentSelection(selection);
          setTooltipPosition(selection.position);
        }}
      />
      <SelectionTooltip
        visible={Boolean(currentSelection)}
        position={tooltipPosition}
        referenceElement={currentSelection?.range ?? null}
        onClick={() => {
          if (!currentSelection) return;
          addReplySelection({ text: currentSelection.text, title: "Assistant message" });
          setCurrentSelection(null);
          window.getSelection()?.removeAllRanges();
          onFocusComposer();
        }}
        onHide={() => {
          setCurrentSelection(null);
          window.getSelection()?.removeAllRanges();
        }}
      />
    </>
  );
}
