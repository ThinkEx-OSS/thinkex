"use client";

import React, { useState, useCallback, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
import { useUIStore } from "@/lib/stores/ui-store";
import { useSelectedCardIds } from "@/hooks/ui/use-selected-card-ids";
import {
  createRectFromPoints,
  getIntersectingCards,
  type Rectangle,
} from "@/lib/utils/marquee-utils";
import { useAutoScroll } from "@/hooks/ui/use-auto-scroll";

interface MarqueeSelectorProps {
  scrollContainerRef: React.RefObject<HTMLElement | null>;
  cardIds: string[];
}

export function MarqueeSelector({
  scrollContainerRef,
  cardIds,
}: MarqueeSelectorProps) {
  const [isSelecting, setIsSelecting] = useState(false);
  const [marqueeRect, setMarqueeRect] = useState<Rectangle | null>(null);

  const selectMultipleCards = useUIStore((state) => state.selectMultipleCards);
  const { selectedCardIds } = useSelectedCardIds();

  const isDraggingRef = useRef(false);
  const startPointRef = useRef({ x: 0, y: 0 });

  const { handleDragStart: startAutoScroll, handleDragStop: stopAutoScroll } =
    useAutoScroll(scrollContainerRef as React.RefObject<HTMLDivElement | null>);

  const isInteractiveTarget = useCallback((target: HTMLElement) => {
    return Boolean(
      target.closest('[id^="item-"]') ||
        target.closest("button") ||
        target.closest('[role="button"]') ||
        target.closest("input") ||
        target.closest("textarea") ||
        target.closest("select") ||
        target.closest("a") ||
        target.closest("label") ||
        target.closest('[role="menuitem"]') ||
        target.closest('[contenteditable="true"]') ||
        target.closest('[data-slot="dropdown-menu-content"]') ||
        target.closest('[data-slot="dropdown-menu-trigger"]') ||
        target.closest('[data-slot="popover-content"]') ||
        target.closest('[data-slot="popover"]') ||
        target.closest('[data-slot="dialog-content"]') ||
        target.closest('[data-slot="dialog-close"]') ||
        target.closest('[data-slot="dialog-overlay"]') ||
        target.isContentEditable,
    );
  }, []);

  const canStartMarqueeFromEvent = useCallback(
    (e: MouseEvent) => {
      const container = scrollContainerRef.current;
      const target = e.target;

      if (!container || !(target instanceof HTMLElement)) {
        return false;
      }

      if (!container.contains(target)) {
        return false;
      }

      return !isInteractiveTarget(target);
    },
    [isInteractiveTarget, scrollContainerRef],
  );

  useEffect(() => {
    if (isSelecting) {
      document.body.classList.add("marquee-selecting");
    } else {
      document.body.classList.remove("marquee-selecting");
    }

    return () => {
      document.body.classList.remove("marquee-selecting");
    };
  }, [isSelecting]);

  const startMarqueeSelection = useCallback(
    (e: MouseEvent) => {
      const container = scrollContainerRef.current;
      if (!container) return false;

      const containerRect = container.getBoundingClientRect();
      if (
        e.clientX < containerRect.left ||
        e.clientX > containerRect.right ||
        e.clientY < containerRect.top ||
        e.clientY > containerRect.bottom
      ) {
        return false;
      }

      const scrollbarWidth = container.offsetWidth - container.clientWidth;
      const scrollbarHeight = container.offsetHeight - container.clientHeight;
      const clickXRelativeToContainer = e.clientX - containerRect.left;
      const clickYRelativeToContainer = e.clientY - containerRect.top;
      const isVerticalScrollbar =
        scrollbarWidth > 0 && clickXRelativeToContainer > container.clientWidth;
      const isHorizontalScrollbar =
        scrollbarHeight > 0 && clickYRelativeToContainer > container.clientHeight;

      if (isHorizontalScrollbar || isVerticalScrollbar) {
        return false;
      }

      const x = e.clientX - containerRect.left + container.scrollLeft;
      const y = e.clientY - containerRect.top + container.scrollTop;

      startPointRef.current = { x, y };
      setIsSelecting(true);
      isDraggingRef.current = true;
      startAutoScroll();

      e.preventDefault();
      e.stopPropagation();

      return true;
    },
    [scrollContainerRef, startAutoScroll],
  );

  const handleMouseDown = useCallback(
    (e: MouseEvent) => {
      if (e.button !== 0) return;

      window.getSelection()?.removeAllRanges();

      if (!canStartMarqueeFromEvent(e)) {
        return;
      }

      startMarqueeSelection(e);
    },
    [canStartMarqueeFromEvent, startMarqueeSelection],
  );

  const handleGlobalShiftMouseDown = useCallback(
    (e: MouseEvent) => {
      if (e.button !== 0 || !e.shiftKey) return;

      if (!canStartMarqueeFromEvent(e)) {
        return;
      }

      startMarqueeSelection(e);
    },
    [canStartMarqueeFromEvent, startMarqueeSelection],
  );

  const handleMouseMove = useCallback(
    (e: MouseEvent) => {
      if (!isDraggingRef.current) return;

      const container = scrollContainerRef.current;
      if (!container) return;

      const containerRect = container.getBoundingClientRect();
      const x = e.clientX - containerRect.left + container.scrollLeft;
      const y = e.clientY - containerRect.top + container.scrollTop;

      const rect = createRectFromPoints(
        startPointRef.current.x,
        startPointRef.current.y,
        x,
        y,
      );
      setMarqueeRect(rect);
    },
    [scrollContainerRef],
  );

  const handleMouseUp = useCallback(() => {
    if (!isDraggingRef.current) return;

    isDraggingRef.current = false;
    setIsSelecting(false);
    stopAutoScroll();

    if (marqueeRect && marqueeRect.width > 3 && marqueeRect.height > 3) {
      const intersecting = getIntersectingCards(
        marqueeRect,
        cardIds,
        scrollContainerRef.current,
      );

      if (intersecting.length > 0) {
        const newSelection = [...Array.from(selectedCardIds), ...intersecting];
        selectMultipleCards(newSelection);
      }
    }

    setMarqueeRect(null);
  }, [
    cardIds,
    marqueeRect,
    scrollContainerRef,
    selectMultipleCards,
    selectedCardIds,
    stopAutoScroll,
  ]);

  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return;

    container.addEventListener("mousedown", handleMouseDown);

    return () => {
      container.removeEventListener("mousedown", handleMouseDown);
    };
  }, [handleMouseDown, scrollContainerRef]);

  useEffect(() => {
    document.addEventListener("mousedown", handleGlobalShiftMouseDown, {
      capture: true,
    });

    return () => {
      document.removeEventListener("mousedown", handleGlobalShiftMouseDown, {
        capture: true,
      });
    };
  }, [handleGlobalShiftMouseDown]);

  useEffect(() => {
    if (!isSelecting) return;

    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);

    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };
  }, [isSelecting, handleMouseMove, handleMouseUp]);

  const displayRect =
    marqueeRect && scrollContainerRef.current
      ? {
          left: marqueeRect.left - scrollContainerRef.current.scrollLeft,
          top: marqueeRect.top - scrollContainerRef.current.scrollTop,
          width: marqueeRect.width,
          height: marqueeRect.height,
        }
      : null;

  const marqueeElement =
    isSelecting && displayRect && displayRect.width > 0 && displayRect.height > 0 ? (
      <div
        className="fixed border-2 border-blue-500 dark:border-blue-400 bg-blue-500/10 dark:bg-blue-400/20 pointer-events-none z-[100] flex items-center justify-center"
        style={{
          left: `${scrollContainerRef.current ? scrollContainerRef.current.getBoundingClientRect().left + displayRect.left : 0}px`,
          top: `${scrollContainerRef.current ? scrollContainerRef.current.getBoundingClientRect().top + displayRect.top : 0}px`,
          width: `${displayRect.width}px`,
          height: `${displayRect.height}px`,
        }}
      >
        {displayRect.width > 120 && displayRect.height > 30 && (
          <span className="text-blue-900 dark:text-blue-100 text-sm font-medium select-none whitespace-nowrap animate-pulse">
            Select items in workspace
          </span>
        )}
      </div>
    ) : null;

  return typeof document !== "undefined" && marqueeElement
    ? createPortal(marqueeElement, document.body)
    : null;
}
