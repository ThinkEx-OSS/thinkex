"use client";

import React, { useRef, useEffect, useCallback, useState } from "react";
import "./selectable-text.css";
import {
  highlightRange,
  removeHighlight,
  clearAllHighlights as clearAllHighlightsUtil,
  findHighlightById,
  generateHighlightId,
  serializeRange,
} from "@/lib/utils/text-highlighter";

export interface TextHighlight {
  id: string;
  text: string;
  range: {
    startContainer: string;
    startOffset: number;
    endContainer: string;
    endOffset: number;
  };
  element?: HTMLElement; // Store the actual DOM element
}

export interface SelectionInfo {
  text: string;
  position: { x: number; y: number };
  range: Range;
}

export interface SelectableTextRef {
  addHighlight: () => void;
  clearAllHighlights: () => void;
  removeHighlight: (highlightId: string) => void;
  getHighlights: () => TextHighlight[];
  getCurrentSelection: () => SelectionInfo | null;
}

export interface SelectableTextProps {
  children: React.ReactNode;
  className?: string;

  // Callbacks
  onSelectionChange?: (selection: SelectionInfo | null) => void;
  onHighlightAdded?: (highlight: TextHighlight) => void;
  onHighlightsChange?: (highlights: TextHighlight[]) => void;

  // Controlled mode
  highlights?: TextHighlight[];

  // Configuration
  highlightClassName?: string;
  enableHighlighting?: boolean;
  containerSelector?: string; // Optional: limit selection to specific containers

  // External trigger for adding highlights
  triggerAddHighlight?: boolean;
}

export const SelectableText = React.forwardRef<SelectableTextRef, SelectableTextProps>(
  (
    {
      children,
      className,
      onSelectionChange,
      onHighlightAdded,
      onHighlightsChange,
      highlights: controlledHighlights,
      enableHighlighting = true,
      containerSelector,
      triggerAddHighlight = false,
      highlightClassName,
    },
    ref
  ) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const [internalHighlights, setInternalHighlights] = useState<TextHighlight[]>([]);
    const [currentSelection, setCurrentSelection] = useState<SelectionInfo | null>(null);
    const previousTriggerRef = useRef(triggerAddHighlight);
    const mouseUpPositionRef = useRef<{ x: number; y: number } | null>(null);
    const isMouseUpTriggeredRef = useRef<boolean>(false);

    // Determine if we're in controlled or uncontrolled mode
    const isControlled = controlledHighlights !== undefined;
    const highlights = isControlled ? controlledHighlights : internalHighlights;

    // Cleanup on unmount - remove all highlight elements
    useEffect(() => {
      // Capture the current container ref value for cleanup
      const currentContainer = containerRef.current;

      return () => {
        const targetContainer = containerSelector
          ? document.querySelector(containerSelector)
          : currentContainer;

        if (targetContainer) {
          try {
            clearAllHighlightsUtil(targetContainer as HTMLElement, 'text-highlight');
          } catch (error) {
            console.error("Error cleaning up highlights:", error);
          }
        }
      };
    }, [containerSelector]);

    // Calculate tooltip position based on selection
    const calculateTooltipPosition = useCallback((range: Range): { x: number; y: number } => {
      const rects = range.getClientRects();

      let y: number;
      let x: number;

      if (rects.length > 1) {
        // Multi-line selection: find the widest rect
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

      return {
        x,
        y,
      };
    }, []);

    // Handle text selection
    const handleSelectionChange = useCallback((fromMouseUp = false) => {
      const selection = window.getSelection();

      if (!selection || selection.isCollapsed) {
        setCurrentSelection(null);
        onSelectionChange?.(null);
        mouseUpPositionRef.current = null;
        isMouseUpTriggeredRef.current = false;
        return;
      }

      const range = selection.getRangeAt(0);
      const selectedText = selection.toString().trim();

      if (!selectedText) {
        setCurrentSelection(null);
        onSelectionChange?.(null);
        mouseUpPositionRef.current = null;
        isMouseUpTriggeredRef.current = false;
        return;
      }

      // Check if selection is within the chat container
      // Find the chat container element
      const chatContainer = containerSelector
        ? document.querySelector(containerSelector)
        : containerRef.current;

      if (!chatContainer) {
        setCurrentSelection(null);
        onSelectionChange?.(null);
        mouseUpPositionRef.current = null;
        isMouseUpTriggeredRef.current = false;
        return;
      }

      // Check if BOTH the start and end of the selection are within the chat container
      const startContainer = range.startContainer;
      const endContainer = range.endContainer;

      const startInChat = chatContainer.contains(startContainer);
      const endInChat = chatContainer.contains(endContainer);

      if (!startInChat || !endInChat) {
        setCurrentSelection(null);
        onSelectionChange?.(null);
        mouseUpPositionRef.current = null;
        isMouseUpTriggeredRef.current = false;
        return;
      }

      // Only show tooltip if triggered by mouse up
      if (!fromMouseUp && !isMouseUpTriggeredRef.current) {
        return;
      }

      // Use mouse up position if available, otherwise fallback to calculated position
      const position = mouseUpPositionRef.current || calculateTooltipPosition(range);
      const selectionInfo: SelectionInfo = {
        text: selectedText,
        position,
        range: range.cloneRange(),
      };

      setCurrentSelection(selectionInfo);
      onSelectionChange?.(selectionInfo);
    }, [containerSelector, calculateTooltipPosition, onSelectionChange]);

    // Handle scroll events - only check if selection was cleared
    // Position updates are now handled by Floating UI's autoUpdate tracking the Range directly
    const handleScroll = useCallback(() => {
      // Only check if selection was cleared - don't update position
      // Floating UI will handle position updates automatically when tracking the Range
      if (currentSelection) {
        const selection = window.getSelection();
        if (!selection || selection.isCollapsed || selection.rangeCount === 0) {
          // Selection was cleared, update state
          setCurrentSelection(null);
          onSelectionChange?.(null);
        }
        // If selection still exists, Floating UI's autoUpdate will handle position tracking
      }
    }, [currentSelection, onSelectionChange]);

    // Add current selection as a persistent highlight
    const addHighlight = useCallback(() => {
      if (!currentSelection || !enableHighlighting) {
        console.warn("Cannot add highlight: missing selection or enableHighlighting is false");
        return;
      }

      try {
        const selection = window.getSelection();
        if (!selection || selection.rangeCount === 0) {
          console.warn("Cannot add highlight: no selection available");
          return;
        }

        const range = selection.getRangeAt(0);

        // Generate unique ID for this highlight
        const highlightId = generateHighlightId();

        // Determine class name: use provided highlightClassName with reset, or fallback to default
        const className = highlightClassName
          ? `text-highlight-reset ${highlightClassName}`
          : 'text-highlight';

        // Apply highlight using native DOM manipulation
        const highlightElement = highlightRange(range, highlightId, className);

        if (!highlightElement) {
          console.warn("Failed to create highlight element");
          return;
        }

        // Create highlight object
        const newHighlight: TextHighlight = {
          id: highlightId,
          text: currentSelection.text,
          range: serializeRange(range),
          element: highlightElement.element,
        };

        const updatedHighlights = [...highlights, newHighlight];

        // Update state based on controlled/uncontrolled mode
        if (!isControlled) {
          setInternalHighlights(updatedHighlights);
        }

        // Fire callbacks
        onHighlightAdded?.(newHighlight);
        onHighlightsChange?.(updatedHighlights);

        // Clear selection but keep highlights
        selection.removeAllRanges();
        setCurrentSelection(null);
        onSelectionChange?.(null);
      } catch (error) {
        console.error("Error adding highlight:", error);
      }
    }, [
      currentSelection,
      highlights,
      isControlled,
      enableHighlighting,
      onHighlightAdded,
      onHighlightsChange,
      onSelectionChange,
      highlightClassName,
    ]);

    // Watch for external trigger to add highlight
    useEffect(() => {
      if (triggerAddHighlight && !previousTriggerRef.current) {
        addHighlight();
      }
      previousTriggerRef.current = triggerAddHighlight;
    }, [triggerAddHighlight, addHighlight]);

    // Public method to add highlight (can be called via ref)
    React.useImperativeHandle(ref, () => ({
      addHighlight,
      clearAllHighlights: () => {
        // Find the actual container where highlights are created
        const targetContainer = containerSelector
          ? document.querySelector(containerSelector)
          : containerRef.current;

        if (targetContainer) {
          try {
            clearAllHighlightsUtil(targetContainer as HTMLElement, 'text-highlight');
          } catch (error) {
            console.error("Error clearing highlights:", error);
          }
        }
        if (!isControlled) {
          setInternalHighlights([]);
        }
        onHighlightsChange?.([]);
      },
      removeHighlight: (highlightId: string) => {
        const highlight = highlights.find(h => h.id === highlightId);
        const targetContainer = containerSelector
          ? document.querySelector(containerSelector)
          : containerRef.current;

        if (highlight?.element) {
          try {
            removeHighlight(highlight.element, targetContainer as HTMLElement);
            const updatedHighlights = highlights.filter(h => h.id !== highlightId);
            if (!isControlled) {
              setInternalHighlights(updatedHighlights);
            }
            onHighlightsChange?.(updatedHighlights);
          } catch (error) {
            console.error("Error removing highlight:", error);
          }
        } else {
          // Fallback: try to find by ID in the DOM
          if (targetContainer) {
            const element = findHighlightById(targetContainer as HTMLElement, highlightId);
            if (element) {
              try {
                removeHighlight(element, targetContainer as HTMLElement);
                const updatedHighlights = highlights.filter(h => h.id !== highlightId);
                if (!isControlled) {
                  setInternalHighlights(updatedHighlights);
                }
                onHighlightsChange?.(updatedHighlights);
              } catch (error) {
                console.error("Error removing highlight:", error);
              }
            }
          }
        }
      },
      getHighlights: () => highlights,
      getCurrentSelection: () => currentSelection,
    }));

    // Listen for selection changes and scroll events
    useEffect(() => {
      const handleMouseUp = (e: MouseEvent) => {
        // Check if the click was on a tooltip element - if so, ignore it
        const target = e.target as Element;
        if (target && (
          target.closest('.highlight-tooltip-container') ||
          target.closest('.highlight-tooltip-action')
        )) {
          return; // Don't trigger selection change for tooltip clicks
        }

        // Don't interfere with input fields, textareas, buttons, or other interactive elements
        if (target && (
          target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'BUTTON' ||
          target.closest('button') ||
          target.closest('[role="button"]') ||
          target.closest('input') ||
          target.closest('textarea') ||
          target.closest('[contenteditable="true"]') ||
          target.closest('[contenteditable="false"]')
        )) {
          return; // Don't trigger selection change for interactive element clicks
        }

        // Capture mouse position on mouse up
        mouseUpPositionRef.current = {
          x: e.clientX,
          y: e.clientY,
        };
        isMouseUpTriggeredRef.current = true;
        setTimeout(() => handleSelectionChange(true), 10);
      };

      // Find the chat container to listen for scroll events
      const chatContainer = containerSelector
        ? document.querySelector(containerSelector)
        : containerRef.current;

      document.addEventListener("mouseup", handleMouseUp);

      // Add scroll event listener to the chat container
      if (chatContainer) {
        chatContainer.addEventListener("scroll", handleScroll, { passive: true });
        // Also listen for scroll on window in case the chat container doesn't handle scroll
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
);

SelectableText.displayName = "SelectableText";

export default SelectableText;

