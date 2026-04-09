"use client";

import React, { useRef, useEffect, useCallback } from "react";

export interface SelectionInfo {
  text: string;
  position: { x: number; y: number };
  range: Range;
}

export interface AssistantThreadSelectionProps {
  className?: string;
  children?: React.ReactNode;
  onSelectionChange?: (selection: SelectionInfo | null) => void;
  /** Scroll/root container for selection bounds (e.g. `.aui-thread-viewport`) */
  containerSelector: string;
}

/**
 * Captures assistant-thread text selection for the Ask AI toolbar.
 * Selection-only — no persistent DOM highlights.
 */
export function AssistantThreadSelection({
  className,
  children = null,
  onSelectionChange,
  containerSelector,
}: AssistantThreadSelectionProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  /** Tracks active selection for scroll cleanup; parent is source of truth via callbacks */
  const currentSelectionRef = useRef<SelectionInfo | null>(null);
  const mouseUpPositionRef = useRef<{ x: number; y: number } | null>(null);
  const isMouseUpTriggeredRef = useRef(false);

  const calculateTooltipPosition = useCallback(
    (range: Range): { x: number; y: number } => {
      const rects = range.getClientRects();

      let y: number;
      let x: number;

      if (rects.length > 1) {
        let bestRect = rects[0];
        let maxWidth = bestRect.width;
        for (let i = 1; i < rects.length; i++) {
          if (rects[i].width > maxWidth) {
            maxWidth = rects[i].width;
            bestRect = rects[i];
          }
        }
        y = bestRect.top;
        x = bestRect.left + bestRect.width / 2;
      } else {
        const rect = range.getBoundingClientRect();
        y = rect.top;
        x = rect.left + rect.width / 2;
      }

      return { x, y };
    },
    [],
  );

  const handleSelectionChange = useCallback(
    (fromMouseUp = false) => {
      const selection = window.getSelection();

      if (!selection || selection.isCollapsed) {
        if (currentSelectionRef.current) {
          currentSelectionRef.current = null;
          onSelectionChange?.(null);
        }
        mouseUpPositionRef.current = null;
        isMouseUpTriggeredRef.current = false;
        return;
      }

      const range = selection.getRangeAt(0);
      const selectedText = selection.toString().trim();

      if (!selectedText) {
        if (currentSelectionRef.current) {
          currentSelectionRef.current = null;
          onSelectionChange?.(null);
        }
        mouseUpPositionRef.current = null;
        isMouseUpTriggeredRef.current = false;
        return;
      }

      const chatContainer = document.querySelector(containerSelector);

      if (!chatContainer) {
        if (currentSelectionRef.current) {
          currentSelectionRef.current = null;
          onSelectionChange?.(null);
        }
        mouseUpPositionRef.current = null;
        isMouseUpTriggeredRef.current = false;
        return;
      }

      const startContainer = range.startContainer;
      const endContainer = range.endContainer;

      const startInChat = chatContainer.contains(startContainer);
      const endInChat = chatContainer.contains(endContainer);

      if (!startInChat || !endInChat) {
        if (currentSelectionRef.current) {
          currentSelectionRef.current = null;
          onSelectionChange?.(null);
        }
        mouseUpPositionRef.current = null;
        isMouseUpTriggeredRef.current = false;
        return;
      }

      const startElement =
        startContainer.nodeType === Node.TEXT_NODE
          ? startContainer.parentElement
          : (startContainer as Element);
      if (!startElement?.closest(".aui-assistant-message-content")) {
        if (currentSelectionRef.current) {
          currentSelectionRef.current = null;
          onSelectionChange?.(null);
        }
        mouseUpPositionRef.current = null;
        isMouseUpTriggeredRef.current = false;
        return;
      }

      if (!fromMouseUp && !isMouseUpTriggeredRef.current) {
        return;
      }

      const position =
        mouseUpPositionRef.current || calculateTooltipPosition(range);
      const selectionInfo: SelectionInfo = {
        text: selectedText,
        position,
        range: range.cloneRange(),
      };

      currentSelectionRef.current = selectionInfo;
      onSelectionChange?.(selectionInfo);
    },
    [containerSelector, calculateTooltipPosition, onSelectionChange],
  );

  const handleScroll = useCallback(() => {
    if (!currentSelectionRef.current) return;
    const selection = window.getSelection();
    if (!selection || selection.isCollapsed || selection.rangeCount === 0) {
      currentSelectionRef.current = null;
      onSelectionChange?.(null);
    }
  }, [onSelectionChange]);

  useEffect(() => {
    const handleMouseUp = (e: MouseEvent) => {
      const target = e.target as Element;
      if (
        target &&
        (target.closest(".selection-tooltip-container") ||
          target.closest(".selection-tooltip-action"))
      ) {
        return;
      }

      const sel = window.getSelection();
      const hasTextSelection =
        !!sel &&
        !sel.isCollapsed &&
        sel.rangeCount > 0 &&
        sel.toString().trim().length > 0;

      // Finishing a drag-selection on controls (e.g. citation badges use role="button")
      // must still commit the selection; only skip these targets for pure clicks.
      if (
        !hasTextSelection &&
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.tagName === "BUTTON" ||
          target.closest("button") ||
          target.closest('[role="button"]') ||
          target.closest("input") ||
          target.closest("textarea") ||
          target.closest('[contenteditable="true"]') ||
          target.closest('[contenteditable="false"]'))
      ) {
        return;
      }

      mouseUpPositionRef.current = {
        x: e.clientX,
        y: e.clientY,
      };
      isMouseUpTriggeredRef.current = true;
      setTimeout(() => handleSelectionChange(true), 10);
    };

    const chatContainer = document.querySelector(containerSelector);

    document.addEventListener("mouseup", handleMouseUp);

    if (chatContainer) {
      chatContainer.addEventListener("scroll", handleScroll, { passive: true });
      window.addEventListener("scroll", handleScroll, { passive: true });
    }

    return () => {
      document.removeEventListener("mouseup", handleMouseUp);
      if (chatContainer) {
        chatContainer.removeEventListener("scroll", handleScroll);
        window.removeEventListener("scroll", handleScroll);
      }
    };
  }, [handleSelectionChange, handleScroll, containerSelector]);

  return (
    <div ref={containerRef} className={className}>
      {children}
    </div>
  );
}
