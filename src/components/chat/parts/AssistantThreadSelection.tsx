"use client";

import React, { useRef, useEffect, useCallback } from "react";
import { extractSelectionTextForReply } from "@/lib/utils/selection-text-extraction";

export interface SelectionInfo {
  text: string;
  position: { x: number; y: number };
  range: Range;
}

export interface AssistantThreadSelectionProps {
  className?: string;
  children?: React.ReactNode;
  onSelectionChange?: (selection: SelectionInfo | null) => void;
  /**
   * Query selector for the chat scroll/root container used for selection
   * bounds. In practice this is `[data-chat-viewport]`, applied on the
   * `Messages` wrapper — anything outside that subtree is rejected.
   */
  containerSelector: string;
}

function calculateTooltipPosition(range: Range): { x: number; y: number } {
  const rects = range.getClientRects();

  if (rects.length > 1) {
    let bestRect = rects[0];
    let maxWidth = bestRect.width;
    for (let i = 1; i < rects.length; i++) {
      if (rects[i].width > maxWidth) {
        maxWidth = rects[i].width;
        bestRect = rects[i];
      }
    }
    return {
      y: bestRect.top,
      x: bestRect.left + bestRect.width / 2,
    };
  }

  const rect = range.getBoundingClientRect();
  return { y: rect.top, x: rect.left + rect.width / 2 };
}

/**
 * Captures assistant-thread text selection for the Ask AI toolbar.
 * - Assistant body only (`[data-assistant-content]` on `AssistantMessage`).
 * - Commits on mouseup / keyup via rAF (not on every selectionchange while dragging).
 */
export function AssistantThreadSelection({
  className,
  children = null,
  onSelectionChange,
  containerSelector,
}: AssistantThreadSelectionProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const currentSelectionRef = useRef<SelectionInfo | null>(null);
  /** Mouse-up position for toolbar placement (matches pre-refactor: anchor near release point). */
  const mouseUpPositionRef = useRef<{ x: number; y: number } | null>(null);

  const clear = useCallback(() => {
    mouseUpPositionRef.current = null;
    if (currentSelectionRef.current) {
      currentSelectionRef.current = null;
      onSelectionChange?.(null);
    }
  }, [onSelectionChange]);

  const commitSelection = useCallback(() => {
    requestAnimationFrame(() => {
      const selection = window.getSelection();
      if (!selection || selection.isCollapsed || selection.rangeCount === 0) {
        clear();
        return;
      }

      const selectedText = extractSelectionTextForReply(selection);
      if (!selectedText) {
        clear();
        return;
      }

      const chatContainer = document.querySelector(containerSelector);
      if (!chatContainer) {
        clear();
        return;
      }

      const range = selection.getRangeAt(0);
      if (
        !chatContainer.contains(range.startContainer) ||
        !chatContainer.contains(range.endContainer)
      ) {
        clear();
        return;
      }

      const startEl =
        range.startContainer.nodeType === Node.TEXT_NODE
          ? range.startContainer.parentElement
          : (range.startContainer as Element);
      const endEl =
        range.endContainer.nodeType === Node.TEXT_NODE
          ? range.endContainer.parentElement
          : (range.endContainer as Element);

      if (
        !startEl?.closest("[data-assistant-content]") ||
        !endEl?.closest("[data-assistant-content]")
      ) {
        clear();
        return;
      }

      const position =
        mouseUpPositionRef.current ?? calculateTooltipPosition(range);
      mouseUpPositionRef.current = null;

      const selectionInfo: SelectionInfo = {
        text: selectedText,
        position,
        range: range.cloneRange(),
      };

      currentSelectionRef.current = selectionInfo;
      onSelectionChange?.(selectionInfo);
    });
  }, [containerSelector, onSelectionChange, clear]);

  useEffect(() => {
    const handleMouseUp = (e: MouseEvent) => {
      const target = e.target;
      if (!(target instanceof Element)) return;

      if (target.closest(".selection-tooltip-container")) {
        return;
      }

      const sel = window.getSelection();
      const hasTextSelection =
        !!sel &&
        !sel.isCollapsed &&
        sel.rangeCount > 0 &&
        sel.toString().trim().length > 0;

      if (
        !hasTextSelection &&
        (target.closest("button") ||
          target.closest('[role="button"]') ||
          target.closest("input") ||
          target.closest("textarea") ||
          target.closest('[contenteditable="true"]'))
      ) {
        return;
      }

      mouseUpPositionRef.current = {
        x: e.clientX,
        y: e.clientY,
      };
      commitSelection();
    };

    const handleKeyUp = () => {
      const sel = window.getSelection();
      const el = document.activeElement;
      if (
        el instanceof HTMLElement &&
        (el.tagName === "INPUT" ||
          el.tagName === "TEXTAREA" ||
          el.isContentEditable)
      ) {
        if (
          sel?.anchorNode &&
          el.contains(sel.anchorNode)
        ) {
          return;
        }
      }
      commitSelection();
    };

    const handleSelectionChange = () => {
      const sel = window.getSelection();
      if (!sel || sel.isCollapsed) {
        clear();
      }
    };

    /** Pre-refactor: scroll does not dismiss the toolbar; only a collapsed selection does. */
    const handleScroll = () => {
      if (!currentSelectionRef.current) return;
      const sel = window.getSelection();
      if (!sel || sel.isCollapsed || sel.rangeCount === 0) {
        clear();
      }
    };

    const chatContainer = document.querySelector(containerSelector);

    document.addEventListener("mouseup", handleMouseUp);
    document.addEventListener("keyup", handleKeyUp);
    document.addEventListener("selectionchange", handleSelectionChange);
    if (chatContainer) {
      chatContainer.addEventListener("scroll", handleScroll, { passive: true });
    }
    window.addEventListener("scroll", handleScroll, { passive: true });

    return () => {
      document.removeEventListener("mouseup", handleMouseUp);
      document.removeEventListener("keyup", handleKeyUp);
      document.removeEventListener("selectionchange", handleSelectionChange);
      if (chatContainer) {
        chatContainer.removeEventListener("scroll", handleScroll);
      }
      window.removeEventListener("scroll", handleScroll);
    };
  }, [commitSelection, clear, containerSelector]);

  return (
    <div ref={containerRef} className={className}>
      {children}
    </div>
  );
}
