"use client";

import React, { useEffect, useLayoutEffect, useRef, useState, useMemo } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "motion/react";
import { useFloating, autoUpdate, offset, shift, flip, size, inline, arrow } from "@floating-ui/react";
import { cn } from "@/lib/utils";

export interface TooltipAction {
  id: string;
  label: string;
  icon: React.ReactNode;
  colorClass?: string;
  onClick: () => void;
}

export interface HighlightTooltipProps {
  actions: TooltipAction[];
  visible: boolean;
  position?: { x: number; y: number };
  referenceElement?: HTMLElement | Range | null; // Optional DOM element or Range to track (for multi-mode highlights or active selections)
  markerOffset?: { x: number; y: number } | null; // Offset from marker element to mouse position (for multi-mode)
  onHide?: () => void;
  badge?: string; // Optional badge text to show (e.g., "Multi Mode: 3 selected")
  defaultExpandedActionId?: string; // Action ID to expand by default
  lockPosition?: boolean; // If true, don't update position on scroll (for single mode)
  collapsed?: boolean; // If true, show only highlight action initially
  highlightAction?: TooltipAction; // Action to show when collapsed
  onExpand?: () => void; // Called when collapsed button is clicked to expand
}

export function HighlightTooltip({
  actions,
  visible,
  position = { x: 0, y: 0 },
  referenceElement,
  markerOffset,
  onHide,
  badge,
  defaultExpandedActionId,
  lockPosition = false,
  collapsed = false,
  highlightAction,
  onExpand,
}: HighlightTooltipProps) {
  const tooltipRef = useRef<HTMLDivElement>(null);
  const [tooltipWidth, setTooltipWidth] = useState(0);
  const [hoveredActionId, setHoveredActionId] = useState<string | null>(defaultExpandedActionId || null);
  const [isExpanded, setIsExpanded] = useState(!collapsed);
  const cleanupFnRef = useRef<(() => void) | null>(null);
  const isUnmountingRef = useRef(false);
  const [shouldRender, setShouldRender] = useState(visible);

  // Store locked position for single mode (fixed position)
  const lockedPositionRef = useRef<{ x: number; y: number } | null>(null);
  const positionRef = useRef(position);

  // Update position ref and locked position
  useEffect(() => {
    const prevPosition = positionRef.current;
    positionRef.current = position;

    // If locking position (single mode), always update the locked position when lockPosition is true
    // This ensures we capture the position when entering single mode
    if (lockPosition) {
      const shouldLock = !lockedPositionRef.current || (position.x !== 0 || position.y !== 0);
      if (shouldLock) {
        lockedPositionRef.current = { ...position };
      }
    } else {
      lockedPositionRef.current = null;
    }
  }, [position, lockPosition]);

  // Create virtual element - must be in state for reactivity per Floating UI docs
  // If referenceElement is provided, we'll use it directly via refs.setReference
  // Otherwise, use a virtual element that reads from position refs
  const [virtualElement, setVirtualElement] = useState(() => {
    const getBoundingRect = () => {
      // Read from refs to get current position
      const pos = lockPosition && lockedPositionRef.current
        ? lockedPositionRef.current
        : positionRef.current;
      const rect = {
        width: 0,
        height: 0,
        x: pos.x,
        y: pos.y,
        top: pos.y,
        left: pos.x,
        right: pos.x,
        bottom: pos.y,
      };
      return rect;
    };
    return {
      getBoundingClientRect: getBoundingRect,
      contextElement: document.body,
    };
  });

  // Update virtual element when position changes (only used when referenceElement is not provided)
  useEffect(() => {
    if (referenceElement) {
      // When referenceElement is provided, we use it directly, so no need to update virtual element
      return;
    }

    const getBoundingRect = () => {
      // Read from refs to get current position
      const pos = lockPosition && lockedPositionRef.current
        ? lockedPositionRef.current
        : positionRef.current;
      const rect = {
        width: 0,
        height: 0,
        x: pos.x,
        y: pos.y,
        top: pos.y,
        left: pos.x,
        right: pos.x,
        bottom: pos.y,
      };
      return rect;
    };
    setVirtualElement({
      getBoundingClientRect: getBoundingRect,
      contextElement: document.body,
    });
  }, [position.x, position.y, lockPosition, referenceElement]);

  // Determine if we should use inline middleware (only for Range-based positioning)
  // When using mouse position, we don't want inline() as it positions based on the range
  const hasValidMousePosition = position.x !== 0 || position.y !== 0;
  const shouldUseMousePosition = hasValidMousePosition && referenceElement instanceof Range;
  const shouldUseInline = referenceElement instanceof Range && !shouldUseMousePosition;

  // Use Floating UI React hook
  const { refs, floatingStyles, update, x, y } = useFloating({
    open: visible,
    placement: 'top',
    strategy: 'fixed',
    middleware: [
      // inline() should only be used when positioning based on Range
      // When using mouse position, we want point-based positioning instead
      ...(shouldUseInline ? [inline()] : []),
      offset({ mainAxis: 10 }),
      // Always use shift to keep tooltip visible at edges (works for both single and multi mode)
      shift({
        padding: 24, // Increased padding to keep tooltip further from edges
        crossAxis: true,
        boundary: 'clippingAncestors', // Use clipping ancestors as boundary
      }),
      // Optional: flip middleware to flip placement when there's no space
      // flip({
      //   fallbackPlacements: ['bottom', 'top', 'right', 'left'],
      //   padding: 8,
      // }),
      // Optional: size middleware to adjust tooltip size based on available space
      // size({
      //   apply({ availableWidth, availableHeight, elements }) {
      //     // Adjust tooltip size if needed
      //   },
      //   padding: 8,
      // }),
      // Optional: inline middleware to position tooltip along the edge of the reference
      // inline({
      //   padding: 8,
      // }),
    ],
  });

  // Calculate offset from range center to mouse position (for maintaining mouse position while tracking range)
  const mouseOffsetRef = useRef<{ x: number; y: number } | null>(null);

  // Update mouse offset when position or reference changes
  useEffect(() => {
    if (referenceElement instanceof Range && (position.x !== 0 || position.y !== 0)) {
      try {
        const rangeRect = referenceElement.getBoundingClientRect();
        const rangeCenterX = rangeRect.left + rangeRect.width / 2;
        const rangeTopY = rangeRect.top;

        // Calculate offset from range center/top to mouse position
        mouseOffsetRef.current = {
          x: position.x - rangeCenterX,
          y: position.y - rangeTopY,
        };
      } catch (error) {
        mouseOffsetRef.current = null;
      }
    } else {
      mouseOffsetRef.current = null;
    }
  }, [referenceElement, position.x, position.y]);

  // Create virtual element wrapper for Range objects
  // According to Floating UI docs, Ranges should be wrapped in virtual elements
  // and use setPositionReference() instead of setReference()
  // The contextElement should always be .aui-thread-viewport for proper scroll tracking
  const rangeVirtualElement = useMemo(() => {
    if (!referenceElement || !(referenceElement instanceof Range)) {
      return null;
    }

    const range = referenceElement;

    // Always use .aui-thread-viewport as context element for proper scroll detection
    // This is the scrollable container that contains the chat messages
    let contextElement: Element = document.body;
    const chatContainer = document.querySelector('.aui-thread-viewport');
    if (chatContainer) {
      contextElement = chatContainer;
    }

    return {
      getBoundingClientRect: () => {
        try {
          const rangeRect = range.getBoundingClientRect();

          // If we have a mouse offset, adjust the position to maintain mouse-based positioning
          // while still tracking the range on scroll
          if (mouseOffsetRef.current) {
            const rangeCenterX = rangeRect.left + rangeRect.width / 2;
            const rangeTopY = rangeRect.top;

            // Add vertical offset upward when using mouse position
            const VERTICAL_OFFSET_UP = 12; // pixels above mouse position

            const adjustedX = rangeCenterX + mouseOffsetRef.current.x;
            const adjustedY = rangeTopY + mouseOffsetRef.current.y - VERTICAL_OFFSET_UP;

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

          // No mouse offset, use range position directly
          return rangeRect;
        } catch (error) {
          // Fallback to position prop
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
          // This is important for inline() middleware to work correctly with Range selections
          // But we only use inline when not using mouse position
          return range.getClientRects();
        } catch (error) {
          return [] as unknown as DOMRectList;
        }
      },
      contextElement,
    };
  }, [referenceElement, positionRef]);

  // Create virtual element wrapper for marker element with offset (for multi-mode)
  // This allows tracking the marker element on scroll while positioning at mouse location
  const markerVirtualElement = useMemo(() => {
    if (!referenceElement || !(referenceElement instanceof HTMLElement) || !markerOffset) {
      return null;
    }

    // Check if it's a marker element
    if (!referenceElement.hasAttribute('data-multi-mode-marker')) {
      return null;
    }

    const marker = referenceElement;

    // Use .aui-thread-viewport as context element for proper scroll detection
    let contextElement: Element = document.body;
    const chatContainer = document.querySelector('.aui-thread-viewport');
    if (chatContainer) {
      contextElement = chatContainer;
    }

    return {
      getBoundingClientRect: () => {
        try {
          const markerRect = marker.getBoundingClientRect();

          // Apply offset to position at mouse location
          // Add vertical offset upward when using mouse position
          const VERTICAL_OFFSET_UP = 12; // pixels above mouse position

          const adjustedX = markerRect.x + markerOffset.x;
          const adjustedY = markerRect.y + markerOffset.y - VERTICAL_OFFSET_UP;

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
        } catch (error) {
          // Fallback to position prop
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
          return marker.getClientRects();
        } catch (error) {
          return [] as unknown as DOMRectList;
        }
      },
      contextElement,
    };
  }, [referenceElement, markerOffset, positionRef]);

  // Set the reference element - use actual DOM element if available, otherwise use virtual element
  // When we have a mouse position (position prop with valid x/y), prefer that over Range
  useEffect(() => {
    // Don't set references if unmounting
    if (isUnmountingRef.current) {
      return;
    }

    // Recalculate shouldUseMousePosition inside effect to use current values
    const currentHasValidMousePosition = position.x !== 0 || position.y !== 0;
    const currentShouldUseMousePosition = currentHasValidMousePosition && referenceElement instanceof Range;

    if (visible) {
      try {
        // Priority: Use Range with mouse offset adjustment (for active selections with mouse position)
        // This allows tracking the range on scroll while maintaining mouse-based positioning
        if (currentShouldUseMousePosition && rangeVirtualElement) {
          // Check if Range is still valid before using it
          try {
            referenceElement.getBoundingClientRect();
          } catch (error) {
            // Range is detached, clear references and return
            refs.setReference(null);
            refs.setPositionReference(null);
            return;
          }
          // Use Range virtual element with mouse offset - tracks range on scroll but positions at mouse
          refs.setReference(null);
          refs.setPositionReference(rangeVirtualElement);
        } else if (referenceElement instanceof HTMLElement && markerVirtualElement) {
          // Check if element is still in the DOM
          if (!document.body.contains(referenceElement)) {
            refs.setReference(null);
            refs.setPositionReference(null);
            return;
          }
          // Use marker virtual element with offset - tracks marker on scroll but positions at mouse
          refs.setReference(null);
          refs.setPositionReference(markerVirtualElement);
        } else if (referenceElement instanceof HTMLElement) {
          // Check if element is still in the DOM
          if (!document.body.contains(referenceElement)) {
            refs.setReference(null);
            refs.setPositionReference(null);
            return;
          }
          // Use the actual DOM element - Floating UI will track it automatically
          // Clear any existing position reference first
          refs.setPositionReference(null);
          // Then set the DOM element
          refs.setReference(referenceElement);
        } else if (referenceElement instanceof Range && rangeVirtualElement) {
          // Check if Range is still valid before using it
          try {
            referenceElement.getBoundingClientRect();
          } catch (error) {
            // Range is detached, clear references and return
            refs.setReference(null);
            refs.setPositionReference(null);
            return;
          }
          // Use virtual element wrapper for Range - Floating UI will track it automatically
          // This is used when we want to track the range (e.g., in multi-mode after selection)
          // Clear any existing reference first
          refs.setReference(null);
          // Then set the Range virtual element using setPositionReference (as per Floating UI docs)
          refs.setPositionReference(rangeVirtualElement);
        } else if (virtualElement) {
          // Use virtual element for position-based tracking
          // Clear any existing reference first
          refs.setReference(null);
          // Then set the virtual element
          refs.setPositionReference(virtualElement);
        }
      } catch (error) {
        // If setting reference fails, clear references to prevent issues
        console.warn('[HighlightTooltip] Failed to set reference:', error);
        refs.setReference(null);
        refs.setPositionReference(null);
      }
    } else {
      // Clear references when not visible
      refs.setReference(null);
      refs.setPositionReference(null);
    }
  }, [visible, virtualElement, referenceElement, rangeVirtualElement, markerVirtualElement, refs, position]);

  // Use autoUpdate for floating-ui to keep tooltip positioned correctly
  // When referenceElement is provided, Floating UI will automatically track it
  // When using virtual element, autoUpdate will call getBoundingClientRect on each update
  useEffect(() => {
    // Clean up previous autoUpdate if it exists
    if (cleanupFnRef.current) {
      try {
        cleanupFnRef.current();
      } catch (error) {
        // Ignore cleanup errors
      }
      cleanupFnRef.current = null;
    }

    if (!visible || isUnmountingRef.current) {
      // Clear references immediately when not visible to prevent cleanup issues
      refs.setReference(null);
      refs.setPositionReference(null);
      return;
    }

    const floatingElement = refs.floating.current;

    // Validate floating element is still in the DOM
    if (!floatingElement || !document.body.contains(floatingElement)) {
      return;
    }

    // Determine which reference to use for autoUpdate
    // Priority: DOM element > Range virtual element > position virtual element
    let refElement: any = null;

    if (referenceElement instanceof HTMLElement) {
      // Check if element is still in the DOM
      if (!document.body.contains(referenceElement)) {
        return;
      }
      // Use DOM element directly
      refElement = referenceElement;
    } else if (referenceElement instanceof Range && rangeVirtualElement) {
      // Check if Range is still valid (not detached)
      try {
        referenceElement.getBoundingClientRect();
      } catch (error) {
        // Range is detached, skip autoUpdate
        return;
      }
      // Use Range virtual element wrapper
      refElement = rangeVirtualElement;
    } else if (virtualElement) {
      // Use position virtual element
      refElement = virtualElement;
    } else {
      // Fallback: try to get from refs (should be set by the effect above)
      refElement = refs.reference.current || (refs as any).positionReference?.current;
    }

    if (!refElement) {
      return;
    }

    // Use autoUpdate to continuously update position on scroll/resize
    // For virtual elements (like Range), we need animationFrame to ensure getBoundingClientRect()
    // is called frequently enough to track position changes during scroll
    const isVirtualElement = !(refElement instanceof HTMLElement);

    try {
      const cleanupFn = autoUpdate(refElement, floatingElement, update, {
        // Update on scroll, resize, and layout shifts
        ancestorScroll: true,
        ancestorResize: true,
        elementResize: true,
        layoutShift: true,
        // For virtual elements (Range), use animationFrame to ensure smooth tracking
        // For DOM elements, we can disable it for better performance
        animationFrame: isVirtualElement,
      });
      cleanupFnRef.current = cleanupFn;
    } catch (error) {
      // If autoUpdate fails (e.g., element is detached), just return
      console.warn('[HighlightTooltip] autoUpdate setup failed:', error);
      cleanupFnRef.current = null;
      return;
    }

    return () => {
      // Safely cleanup - check if elements are still valid before cleanup
      if (cleanupFnRef.current) {
        try {
          cleanupFnRef.current();
        } catch (error) {
          // Ignore cleanup errors - element may have already been removed
          // This prevents "removeChild" errors when thread switches
        }
        cleanupFnRef.current = null;
      }
    };
  }, [visible, refs.floating, update, referenceElement, rangeVirtualElement, markerVirtualElement, virtualElement, refs]);

  // Also manually update when position changes to ensure immediate update
  useEffect(() => {
    if (visible && update) {
      // Use requestAnimationFrame to avoid interfering with scroll
      const rafId = requestAnimationFrame(() => {
        update();
      });
      return () => {
        cancelAnimationFrame(rafId);
      };
    }
  }, [visible, position.x, position.y, lockPosition, update]);

  // Track shouldRender to allow exit animation to complete before removing portal
  useEffect(() => {
    if (visible) {
      setShouldRender(true);
    }
    // Don't immediately set shouldRender to false when visible becomes false
    // Let AnimatePresence handle the exit animation first
  }, [visible]);

  // Reset hovered action when tooltip becomes invisible or set default expanded
  useEffect(() => {
    if (!visible) {
      setHoveredActionId(null);
    } else if (defaultExpandedActionId) {
      setHoveredActionId(defaultExpandedActionId);
    }
  }, [visible, defaultExpandedActionId]);

  // Reset expanded state when collapsed prop changes or when tooltip becomes visible
  useEffect(() => {
    setIsExpanded(!collapsed);
  }, [collapsed, visible]);

  // Determine which actions to display
  const displayActions = collapsed && !isExpanded && highlightAction
    ? [highlightAction]
    : actions;

  // Reset hoveredActionId if it's not in the current displayActions
  useEffect(() => {
    const actionIds = displayActions.map(a => a.id);

    // Reset hoveredActionId if it's not in the current displayActions
    if (hoveredActionId && !actionIds.includes(hoveredActionId)) {
      setHoveredActionId(null);
    }
  }, [displayActions, hoveredActionId, actions]);

  const handleActionClick = (action: TooltipAction) => {
    // Always execute the action's onClick handler
    // The action handler (e.g., handleMultiSelect) will handle state changes
    try {
      action.onClick();
    } catch (error) {
      console.error('[HighlightTooltip] Error executing action.onClick:', error);
    }
    // Don't automatically hide - let the action handler decide
  };

  // Get the color of the currently hovered action for the arrow
  const getArrowColor = () => {
    // When collapsed and not expanded, use highlight action color if available
    const actionToCheck = collapsed && !isExpanded && highlightAction
      ? highlightAction
      : actions.find(a => a.id === hoveredActionId);

    if (!actionToCheck?.colorClass) return "rgb(48, 49, 52)"; // card color default

    // Map common Tailwind color classes to hex values
    const colorMap: Record<string, string> = {
      "bg-green-600": "rgb(22, 163, 74)",
      "bg-blue-600": "rgb(37, 99, 235)",
      "bg-purple-600": "rgb(147, 51, 234)",
      "bg-red-600": "rgb(220, 38, 38)",
      "bg-yellow-600": "rgb(202, 138, 4)",
      "bg-orange-600": "rgb(234, 88, 12)",
      "bg-accent": "rgb(138, 180, 248)", // Google blue accent
    };

    // Extract the base color class (e.g., "bg-green-600" from "bg-green-600 hover:bg-green-700")
    const baseColorMatch = actionToCheck.colorClass.match(/bg-(\w+-\d+)/);
    if (baseColorMatch) {
      const fullClass = `bg-${baseColorMatch[1]}`;
      return colorMap[fullClass] || colorMap["bg-accent"];
    }

    return colorMap["bg-accent"];
  };

  // Measure tooltip width after render
  useEffect(() => {
    if (tooltipRef.current && visible) {
      setTooltipWidth(tooltipRef.current.offsetWidth);
    }
  }, [visible, actions, badge]);

  // Handle click outside
  useEffect(() => {
    if (!visible) return;

    const handleClickOutside = (event: MouseEvent) => {
      if (tooltipRef.current && !tooltipRef.current.contains(event.target as Node)) {
        onHide?.();
      }
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onHide?.();
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleEscape);

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [visible, onHide]);

  if (typeof window === "undefined") return null;

  // Don't render if position is invalid (0,0 means not set yet)
  // However, if we have a referenceElement, Floating UI will position it, so we can render
  const hasValidPosition = position.x !== 0 || position.y !== 0;
  const hasReference = !!referenceElement; // DOM element or Range

  // Track unmounting state
  useEffect(() => {
    isUnmountingRef.current = false;
    return () => {
      isUnmountingRef.current = true;
      // Clean up autoUpdate on unmount
      if (cleanupFnRef.current) {
        try {
          cleanupFnRef.current();
        } catch (error) {
          // Ignore cleanup errors during unmount
        }
        cleanupFnRef.current = null;
      }
      // Clear Floating UI refs on unmount
      try {
        refs.setFloating(null);
        refs.setReference(null);
        refs.setPositionReference(null);
      } catch (error) {
        // Ignore errors during unmount
      }
    };
  }, [refs]);

  return createPortal(
    shouldRender && (hasValidPosition || hasReference) ? (
      <div
        ref={(node) => {
          tooltipRef.current = node;
          // Only set floating ref if we're not unmounting and node is valid
          if (!isUnmountingRef.current) {
            try {
              if (node) {
                refs.setFloating(node);
              } else {
                // Node is being removed, clear the ref
                refs.setFloating(null);
              }
            } catch (error) {
              // Ignore errors when setting ref - component may be unmounting
            }
          }
        }}
        style={{
          ...floatingStyles,
          zIndex: 9999,
        }}
        className="highlight-tooltip-container pointer-events-auto"
      >
        <AnimatePresence mode="wait" onExitComplete={() => {
          // Only remove from DOM after exit animation completes
          if (!visible) {
            setShouldRender(false);
          }
        }}>
          {visible && (
            <motion.div
              key="tooltip-content"
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              transition={{
                type: "spring",
                stiffness: 400,
                damping: 25,
                mass: 0.5,
              }}
              onAnimationComplete={(definition) => {
                // Safely handle animation completion
                if (definition === "exit") {
                  // Exit animation completed, portal will be removed via onExitComplete
                  try {
                    // Clear refs after exit animation
                    if (isUnmountingRef.current) {
                      refs.setFloating(null);
                      refs.setReference(null);
                      refs.setPositionReference(null);
                    }
                  } catch (error) {
                    // Ignore cleanup errors
                  }
                }
              }}
              className="flex flex-col items-center"
            >
              {/* Badge indicator for multi-mode - positioned absolutely above */}
              {badge && (
                <div className="absolute -top-5 left-1/2 -translate-x-1/2 px-2 py-0.5 text-[10px] font-medium text-black bg-white rounded text-center whitespace-nowrap shadow-sm">
                  {badge}
                </div>
              )}

              <div className="relative flex items-stretch rounded-md bg-card/95 backdrop-blur-sm shadow-lg overflow-visible" style={{ minWidth: 'fit-content' }}>
                {displayActions.map((action, index) => {
                  const isHoverExpanded = hoveredActionId === action.id;
                  const isLastButton = index === displayActions.length - 1;
                  const isFirstButton = index === 0;

                  // Calculate if this container needs to shift due to another button expanding
                  const otherButtonExpanded = hoveredActionId && hoveredActionId !== action.id;
                  // Calculate shift based on which button is expanded and current position
                  let shiftAmount = 0;
                  if (otherButtonExpanded && !isHoverExpanded) {
                    const expandedIndex = displayActions.findIndex(a => a.id === hoveredActionId);
                    const isExpandedMiddle = expandedIndex > 0 && expandedIndex < displayActions.length - 1;

                    if (expandedIndex < index) {
                      // Button to the right of expanded button
                      shiftAmount = isExpandedMiddle ? 24 : 24; // Consistent shift for all button expansions
                    } else if (expandedIndex > index) {
                      // Button to the left of expanded button
                      shiftAmount = isExpandedMiddle ? -24 : -24; // Consistent shift for all button expansions
                    }
                  }

                  return (
                    <motion.div
                      key={action.id}
                      className="relative"
                      initial={false}
                      animate={{
                        x: shiftAmount,
                      }}
                      transition={{
                        duration: 0.2,
                        ease: [0.4, 0, 0.2, 1],
                      }}
                      style={{
                        width: "32px",
                        height: "32px",
                      }}
                    >
                      <motion.button
                        onClick={() => handleActionClick(action)}
                        onMouseEnter={() => {
                          // Always allow hover expansion to show label
                          setHoveredActionId(action.id);
                        }}
                        onMouseLeave={() => {
                          setHoveredActionId(null);
                        }}
                        initial={false}
                        animate={{
                          width: isHoverExpanded ? "80px" : "32px",
                          // Expand mostly in primary direction, but a bit in opposite direction too
                          ...(isFirstButton
                            ? { right: isHoverExpanded ? "-24px" : "0" } // First button grows 24px to the right, rest to the left
                            : isLastButton
                              ? { left: isHoverExpanded ? "-24px" : "0" }  // Last button grows 24px to the left, rest to the right
                              : {
                                left: "0",
                                x: isHoverExpanded ? "-24px" : "0"  // Middle button expands evenly from center
                              }
                          ),
                        }}
                        transition={{
                          duration: 0.2,
                          ease: [0.4, 0, 0.2, 1],
                        }}
                        className={cn(
                          "highlight-tooltip-action absolute top-0 flex items-center",
                          "text-xs font-medium text-white",
                          "focus:outline-none focus:ring-1 focus:ring-inset focus:ring-white/50",
                          "active:scale-95",
                          action.colorClass || "bg-accent text-foreground dark:text-white",
                          index > 0 && isExpanded && "border-l border-white/20",
                          index === 0 && "rounded-l-md",
                          index === displayActions.length - 1 && "rounded-r-md",
                          !isExpanded && "rounded-md" // When collapsed, single button should be fully rounded
                        )}
                        style={{
                          height: "32px",
                          padding: "0 8px",
                          justifyContent: isHoverExpanded ? "flex-start" : "center",
                          zIndex: isHoverExpanded ? 20 : 10,
                        }}
                        aria-label={action.label}
                      >
                        {/* Icon - always visible */}
                        <span className="flex-shrink-0 flex items-center justify-center" style={{ width: "16px", height: "16px" }}>
                          {action.icon}
                        </span>

                        {/* Label - expands on hover with fixed width for smooth animation */}
                        <motion.span
                          initial={false}
                          animate={{
                            width: isHoverExpanded ? "52px" : "0px",
                            opacity: isHoverExpanded ? 1 : 0,
                            marginLeft: isHoverExpanded ? "6px" : "0px",
                          }}
                          transition={{
                            duration: 0.2,
                            ease: [0.4, 0, 0.2, 1],
                          }}
                          className="overflow-hidden whitespace-nowrap"
                          style={{
                            display: "inline-block",
                          }}
                        >
                          {action.label}
                        </motion.span>
                      </motion.button>
                    </motion.div>
                  );
                })}
              </div>
              {/* Tooltip arrow pointing down - color matches hovered action */}
              <div
                className="absolute left-1/2 -translate-x-1/2 -bottom-2 w-0 h-0 transition-all duration-300"
                style={{
                  borderLeft: '8px solid transparent',
                  borderRight: '8px solid transparent',
                  borderTop: `8px solid ${getArrowColor()}`
                }}
              />
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    ) : null,
    document.body
  );
}

