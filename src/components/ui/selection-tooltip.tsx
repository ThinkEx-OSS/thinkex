"use client";

import React, { useEffect, useRef, useState, useMemo } from "react";
import { createPortal } from "react-dom";
import {
  useFloating,
  autoUpdate,
  offset,
  shift,
  inline,
} from "@floating-ui/react";
import { FaQuoteRight } from "react-icons/fa6";
import { cn } from "@/lib/utils";
import { askAiPrimaryButtonClass } from "@/lib/ui/ask-ai-toolbar-styles";

export interface SelectionTooltipProps {
  visible: boolean;
  position?: { x: number; y: number };
  referenceElement?: HTMLElement | Range | null;
  onHide?: () => void;
  onClick: () => void;
}

export function SelectionTooltip({
  visible,
  position = { x: 0, y: 0 },
  referenceElement,
  onHide,
  onClick,
}: SelectionTooltipProps) {
  const tooltipRef = useRef<HTMLDivElement>(null);
  const cleanupFnRef = useRef<(() => void) | null>(null);
  const isUnmountingRef = useRef(false);
  const positionRef = useRef(position);

  useEffect(() => {
    positionRef.current = position;
  }, [position]);

  const [virtualElement, setVirtualElement] = useState(() => {
    const getBoundingRect = () => {
      const pos = positionRef.current;
      return {
        width: 0,
        height: 0,
        x: pos.x,
        y: pos.y,
        top: pos.y,
        left: pos.x,
        right: pos.x,
        bottom: pos.y,
      };
    };
    return {
      getBoundingClientRect: getBoundingRect,
      contextElement: document.body,
    };
  });

  useEffect(() => {
    if (referenceElement) {
      return;
    }
    const getBoundingRect = () => {
      const pos = positionRef.current;
      return {
        width: 0,
        height: 0,
        x: pos.x,
        y: pos.y,
        top: pos.y,
        left: pos.x,
        right: pos.x,
        bottom: pos.y,
      };
    };
    setVirtualElement({
      getBoundingClientRect: getBoundingRect,
      contextElement: document.body,
    });
  }, [position.x, position.y, referenceElement]);

  const hasValidMousePosition = position.x !== 0 || position.y !== 0;
  const shouldUseMousePosition =
    hasValidMousePosition && referenceElement instanceof Range;
  const shouldUseInline =
    referenceElement instanceof Range && !shouldUseMousePosition;

  const { refs, floatingStyles, update } = useFloating({
    open: visible,
    placement: "top",
    strategy: "fixed",
    middleware: [
      ...(shouldUseInline ? [inline()] : []),
      offset({ mainAxis: 10 }),
      shift({
        padding: 24,
        crossAxis: true,
        boundary: "clippingAncestors",
      }),
    ],
  });

  const mouseOffsetRef = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => {
    if (referenceElement instanceof Range && (position.x !== 0 || position.y !== 0)) {
      try {
        const rangeRect = referenceElement.getBoundingClientRect();
        const rangeCenterX = rangeRect.left + rangeRect.width / 2;
        const rangeTopY = rangeRect.top;
        mouseOffsetRef.current = {
          x: position.x - rangeCenterX,
          y: position.y - rangeTopY,
        };
      } catch {
        mouseOffsetRef.current = null;
      }
    } else {
      mouseOffsetRef.current = null;
    }
  }, [referenceElement, position.x, position.y]);

  const rangeVirtualElement = useMemo(() => {
    if (!referenceElement || !(referenceElement instanceof Range)) {
      return null;
    }

    const range = referenceElement;
    let contextElement: Element = document.body;
    const chatContainer = document.querySelector(".aui-thread-viewport");
    if (chatContainer) {
      contextElement = chatContainer;
    }

    return {
      getBoundingClientRect: () => {
        try {
          const rangeRect = range.getBoundingClientRect();
          if (mouseOffsetRef.current) {
            const rangeCenterX = rangeRect.left + rangeRect.width / 2;
            const rangeTopY = rangeRect.top;
            const VERTICAL_OFFSET_UP = 12;
            const adjustedX = rangeCenterX + mouseOffsetRef.current.x;
            const adjustedY =
              rangeTopY + mouseOffsetRef.current.y - VERTICAL_OFFSET_UP;
            return {
              width: 0,
              height: 0,
              x: adjustedX,
              y: adjustedY,
              top: adjustedY,
              left: adjustedX,
              right: adjustedX,
              bottom: adjustedY,
            } as DOMRect;
          }
          return rangeRect;
        } catch {
          const pos = positionRef.current;
          return {
            width: 0,
            height: 0,
            x: pos.x,
            y: pos.y,
            top: pos.y,
            left: pos.x,
            right: pos.x,
            bottom: pos.y,
          } as DOMRect;
        }
      },
      getClientRects: () => {
        try {
          return range.getClientRects();
        } catch {
          return [] as unknown as DOMRectList;
        }
      },
      contextElement,
    };
  }, [referenceElement, positionRef]);

  useEffect(() => {
    if (isUnmountingRef.current) {
      return;
    }

    const currentHasValidMousePosition = position.x !== 0 || position.y !== 0;
    const currentShouldUseMousePosition =
      currentHasValidMousePosition && referenceElement instanceof Range;

    if (visible) {
      try {
        if (currentShouldUseMousePosition && rangeVirtualElement) {
          try {
            referenceElement.getBoundingClientRect();
          } catch {
            refs.setReference(null);
            refs.setPositionReference(null);
            return;
          }
          refs.setReference(null);
          refs.setPositionReference(rangeVirtualElement);
        } else if (referenceElement instanceof HTMLElement) {
          if (!document.body.contains(referenceElement)) {
            refs.setReference(null);
            refs.setPositionReference(null);
            return;
          }
          refs.setPositionReference(null);
          refs.setReference(referenceElement);
        } else if (referenceElement instanceof Range && rangeVirtualElement) {
          try {
            referenceElement.getBoundingClientRect();
          } catch {
            refs.setReference(null);
            refs.setPositionReference(null);
            return;
          }
          refs.setReference(null);
          refs.setPositionReference(rangeVirtualElement);
        } else if (virtualElement) {
          refs.setReference(null);
          refs.setPositionReference(virtualElement);
        }
      } catch {
        console.warn("[SelectionTooltip] Failed to set reference");
        refs.setReference(null);
        refs.setPositionReference(null);
      }
    } else {
      refs.setReference(null);
      refs.setPositionReference(null);
    }
  }, [visible, virtualElement, referenceElement, rangeVirtualElement, refs, position]);

  useEffect(() => {
    if (cleanupFnRef.current) {
      try {
        cleanupFnRef.current();
      } catch {
        /* ignore */
      }
      cleanupFnRef.current = null;
    }

    if (!visible || isUnmountingRef.current) {
      refs.setReference(null);
      refs.setPositionReference(null);
      return;
    }

    const floatingElement = refs.floating.current;
    if (!floatingElement || !document.body.contains(floatingElement)) {
      return;
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Floating UI accepts virtual elements
    let refElement: any = null;

    if (referenceElement instanceof HTMLElement) {
      if (!document.body.contains(referenceElement)) {
        return;
      }
      refElement = referenceElement;
    } else if (referenceElement instanceof Range && rangeVirtualElement) {
      try {
        referenceElement.getBoundingClientRect();
      } catch {
        return;
      }
      refElement = rangeVirtualElement;
    } else if (virtualElement) {
      refElement = virtualElement;
    } else {
      refElement =
        refs.reference.current ||
        (refs as { positionReference?: { current: unknown } }).positionReference
          ?.current;
    }

    if (!refElement) {
      return;
    }

    const isVirtualElement = !(refElement instanceof HTMLElement);

    try {
      const cleanupFn = autoUpdate(
        refElement as never,
        floatingElement,
        update,
        {
          ancestorScroll: true,
          ancestorResize: true,
          elementResize: true,
          layoutShift: true,
          animationFrame: isVirtualElement,
        },
      );
      cleanupFnRef.current = cleanupFn;
    } catch {
      console.warn("[SelectionTooltip] autoUpdate setup failed");
      cleanupFnRef.current = null;
    }

    return () => {
      if (cleanupFnRef.current) {
        try {
          cleanupFnRef.current();
        } catch {
          /* ignore */
        }
        cleanupFnRef.current = null;
      }
    };
  }, [visible, refs.floating, update, referenceElement, rangeVirtualElement, virtualElement, refs]);

  useEffect(() => {
    if (visible && update) {
      const rafId = requestAnimationFrame(() => {
        update();
      });
      return () => cancelAnimationFrame(rafId);
    }
  }, [visible, position.x, position.y, update]);

  useEffect(() => {
    if (!visible) return;

    const handleClickOutside = (event: MouseEvent) => {
      if (
        tooltipRef.current &&
        !tooltipRef.current.contains(event.target as Node)
      ) {
        onHide?.();
      }
    };

    document.addEventListener("mousedown", handleClickOutside);

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [visible, onHide]);

  useEffect(() => {
    isUnmountingRef.current = false;
    return () => {
      isUnmountingRef.current = true;
      if (cleanupFnRef.current) {
        try {
          cleanupFnRef.current();
        } catch {
          /* ignore */
        }
        cleanupFnRef.current = null;
      }
      try {
        refs.setFloating(null);
        refs.setReference(null);
        refs.setPositionReference(null);
      } catch {
        /* ignore */
      }
    };
  }, [refs]);

  if (typeof window === "undefined") return null;

  const hasValidPosition = position.x !== 0 || position.y !== 0;
  const hasReference = !!referenceElement;

  return createPortal(
    visible && (hasValidPosition || hasReference) ? (
      <div
        ref={(node) => {
          tooltipRef.current = node;
          if (!isUnmountingRef.current) {
            try {
              if (node) {
                refs.setFloating(node);
              } else {
                refs.setFloating(null);
              }
            } catch {
              /* ignore */
            }
          }
        }}
        style={floatingStyles}
        className={cn(
          "selection-tooltip-container pointer-events-auto z-[9999]",
          "inline-flex flex-row items-center gap-1 shadow-none outline-none ring-0",
        )}
      >
        <button
          type="button"
          onClick={() => {
            try {
              onClick();
            } catch (e) {
              console.error("[SelectionTooltip] onClick error", e);
            }
          }}
          className={askAiPrimaryButtonClass}
          aria-label="Ask AI"
        >
          <span className="flex h-4 w-4 shrink-0 items-center justify-center">
            <FaQuoteRight size={16} />
          </span>
          <span>Ask AI</span>
        </button>
      </div>
    ) : null,
    document.body,
  );
}
