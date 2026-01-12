"use client";

import React, { useState, useCallback, useRef, useEffect, useMemo } from "react";
import { createPortal } from "react-dom";
import { useUIStore, selectSelectedCardIdsArray } from "@/lib/stores/ui-store";
import { useShallow } from "zustand/react/shallow";
import { createRectFromPoints, getIntersectingCards, type Rectangle } from "@/lib/utils/marquee-utils";
import { useAutoScroll } from "@/hooks/ui/use-auto-scroll";

interface MarqueeSelectorProps {
  scrollContainerRef: React.RefObject<HTMLElement | null>;
  cardIds: string[];
  isGridDragging: boolean;
}

/**
 * MarqueeSelector component for rectangular card selection
 * Handles mouse events to create a selection rectangle and select intersecting cards
 * Features autoscroll when selecting near container edges
 */
export function MarqueeSelector({
  scrollContainerRef,
  cardIds,
  isGridDragging,
}: MarqueeSelectorProps) {
  const [isSelecting, setIsSelecting] = useState(false);
  const [marqueeRect, setMarqueeRect] = useState<Rectangle | null>(null);
  
  const selectMultipleCards = useUIStore((state) => state.selectMultipleCards);
  // Use array selector with shallow comparison to prevent unnecessary re-renders and SSR issues
  const selectedCardIdsArray = useUIStore(
    useShallow(selectSelectedCardIdsArray)
  );
  const selectedCardIds = useMemo(() => new Set(selectedCardIdsArray), [selectedCardIdsArray]);
  
  const isDraggingRef = useRef(false);
  const startPointRef = useRef({ x: 0, y: 0 });
  
  // Use autoscroll hook for smooth scrolling during selection
  const { handleDragStart: startAutoScroll, handleDragStop: stopAutoScroll } = useAutoScroll(
    scrollContainerRef as React.RefObject<HTMLDivElement | null>
  );

  // Cancel marquee selection if grid starts dragging
  useEffect(() => {
    if (isGridDragging && isSelecting) {
      setIsSelecting(false);
      setMarqueeRect(null);
      isDraggingRef.current = false;
      stopAutoScroll(); // Stop autoscroll when canceling
    }
  }, [isGridDragging, isSelecting, stopAutoScroll]);

  // Add/remove class on body to disable pointer events on iframes during marquee selection
  useEffect(() => {
    if (isSelecting) {
      document.body.classList.add('marquee-selecting');
    } else {
      document.body.classList.remove('marquee-selecting');
    }
    
    return () => {
      document.body.classList.remove('marquee-selecting');
    };
  }, [isSelecting]);

  // Helper to start marquee selection
  const startMarqueeSelection = useCallback((e: MouseEvent) => {
    const container = scrollContainerRef.current;
    if (!container) return false;

    const containerRect = container.getBoundingClientRect();
    
    // Check if click is within the container bounds
    if (
      e.clientX < containerRect.left ||
      e.clientX > containerRect.right ||
      e.clientY < containerRect.top ||
      e.clientY > containerRect.bottom
    ) {
      return false;
    }
    
    // Robust scrollbar detection: calculate actual scrollbar dimensions
    // offsetWidth/Height includes scrollbar, clientWidth/Height excludes it
    const scrollbarWidth = container.offsetWidth - container.clientWidth;
    const scrollbarHeight = container.offsetHeight - container.clientHeight;
    
    // Check if clicking on scrollbar by comparing click position with client area
    // For vertical scrollbar: check if click is to the right of the client area
    const clickXRelativeToContainer = e.clientX - containerRect.left;
    const isVerticalScrollbar = scrollbarWidth > 0 && clickXRelativeToContainer > container.clientWidth;
    
    // For horizontal scrollbar: check if click is below the client area
    const clickYRelativeToContainer = e.clientY - containerRect.top;
    const isHorizontalScrollbar = scrollbarHeight > 0 && clickYRelativeToContainer > container.clientHeight;
    
    // Don't start marquee if clicking on scrollbar
    if (isHorizontalScrollbar || isVerticalScrollbar) {
      return false;
    }
    
    const x = e.clientX - containerRect.left + container.scrollLeft;
    const y = e.clientY - containerRect.top + container.scrollTop;

    startPointRef.current = { x, y };
    setIsSelecting(true);
    isDraggingRef.current = true;
    
    // Start autoscroll for marquee selection
    startAutoScroll();

    // Prevent text selection and other drag behaviors during marquee
    e.preventDefault();
    e.stopPropagation();
    
    return true;
  }, [scrollContainerRef, startAutoScroll]);

  const handleMouseDown = useCallback((e: MouseEvent) => {
    // Only start marquee on left click
    if (e.button !== 0) return;
    
    // Don't start if clicking on a card or interactive element
    const target = e.target as HTMLElement;
    
    // Check if clicking on any interactive or grid element
    if (
      target.closest('article') ||           // Card itself
      target.closest('button') ||            // Any button
      target.closest('[role="button"]') ||   // Button role elements
      target.closest('.react-grid-item') ||  // Grid item wrapper
      target.classList.contains('drag-handle') || // Drag handle
      target.tagName === 'INPUT' ||          // Input fields
      target.tagName === 'TEXTAREA'          // Text areas
    ) {
      return;
    }

    startMarqueeSelection(e);
  }, [startMarqueeSelection]);

  // Global shift+drag handler - activates marquee from ANYWHERE in the app when Shift is held
  // Takes precedence over card dragging and other interactions
  const handleGlobalShiftMouseDown = useCallback((e: MouseEvent) => {
    // Only activate on left click with Shift held
    if (e.button !== 0 || !e.shiftKey) return;
    
    // Don't interfere with text inputs
    const target = e.target as HTMLElement;
    if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) {
      return;
    }
    
    const container = scrollContainerRef.current;
    if (!container) return;

    const containerRect = container.getBoundingClientRect();
    
    // Use raw mouse position - marquee can start from anywhere
    const x = e.clientX - containerRect.left + container.scrollLeft;
    const y = e.clientY - containerRect.top + container.scrollTop;

    startPointRef.current = { x, y };
    setIsSelecting(true);
    isDraggingRef.current = true;
    
    // Start autoscroll for marquee selection
    startAutoScroll();

    // Prevent text selection and other drag behaviors during marquee
    e.preventDefault();
    e.stopPropagation();
  }, [scrollContainerRef, startAutoScroll]);

  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (!isDraggingRef.current || isGridDragging) return;

    const container = scrollContainerRef.current;
    if (!container) return;

    const containerRect = container.getBoundingClientRect();
    const x = e.clientX - containerRect.left + container.scrollLeft;
    const y = e.clientY - containerRect.top + container.scrollTop;

    // Calculate marquee rectangle
    const rect = createRectFromPoints(
      startPointRef.current.x,
      startPointRef.current.y,
      x,
      y
    );
    setMarqueeRect(rect);
  }, [scrollContainerRef, isGridDragging]);

  const handleMouseUp = useCallback(() => {
    if (!isDraggingRef.current) return;

    isDraggingRef.current = false;
    setIsSelecting(false);
    
    // Stop autoscroll when selection ends
    stopAutoScroll();

    // Get intersecting cards and add to selection
    if (marqueeRect && marqueeRect.width > 3 && marqueeRect.height > 3) {
      const intersecting = getIntersectingCards(
        marqueeRect,
        cardIds,
        scrollContainerRef.current
      );

      if (intersecting.length > 0) {
        // Combine with existing selection (always add)
        const newSelection = [...Array.from(selectedCardIds), ...intersecting];
        selectMultipleCards(newSelection);
      }
    }

    setMarqueeRect(null);
  }, [marqueeRect, cardIds, scrollContainerRef, selectMultipleCards, selectedCardIds, stopAutoScroll]);

  // Set up mouse event listeners on scroll container (normal marquee)
  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return;

    container.addEventListener('mousedown', handleMouseDown);

    return () => {
      container.removeEventListener('mousedown', handleMouseDown);
    };
  }, [handleMouseDown, scrollContainerRef]);

  // Set up global shift+drag listener (takes precedence, captures phase)
  useEffect(() => {
    // Use capture phase to intercept before other handlers (like card drag)
    document.addEventListener('mousedown', handleGlobalShiftMouseDown, { capture: true });

    return () => {
      document.removeEventListener('mousedown', handleGlobalShiftMouseDown, { capture: true });
    };
  }, [handleGlobalShiftMouseDown]);

  // Set up global mouse event listeners for move and up
  useEffect(() => {
    if (isSelecting) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);

      return () => {
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
      };
    }
  }, [isSelecting, handleMouseMove, handleMouseUp]);

  // Calculate display rectangle (relative to viewport)
  const displayRect = marqueeRect && scrollContainerRef.current ? {
    left: marqueeRect.left - scrollContainerRef.current.scrollLeft,
    top: marqueeRect.top - scrollContainerRef.current.scrollTop,
    width: marqueeRect.width,
    height: marqueeRect.height,
  } : null;

  // Render marquee via portal to escape stacking context and appear above sidebar
  const marqueeElement = isSelecting && displayRect && displayRect.width > 0 && displayRect.height > 0 ? (
    <div
      className="fixed border-2 border-blue-500 bg-blue-500/10 pointer-events-none z-[100] flex items-center justify-center"
      style={{
        left: `${scrollContainerRef.current ? scrollContainerRef.current.getBoundingClientRect().left + displayRect.left : 0}px`,
        top: `${scrollContainerRef.current ? scrollContainerRef.current.getBoundingClientRect().top + displayRect.top : 0}px`,
        width: `${displayRect.width}px`,
        height: `${displayRect.height}px`,
      }}
    >
      {displayRect.width > 120 && displayRect.height > 30 && (
        <span className="text-white text-sm font-medium select-none whitespace-nowrap animate-pulse">
          Select items in workspace
        </span>
      )}
    </div>
  ) : null;

  return typeof document !== 'undefined' && marqueeElement
    ? createPortal(marqueeElement, document.body)
    : null;
}

