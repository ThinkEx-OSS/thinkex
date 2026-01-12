import { useRef, useEffect, useCallback, useState } from "react";

/**
 * Custom hook for managing auto-scroll behavior during drag operations.
 * Handles smooth scrolling when dragging items near the edge of a container.
 * 
 * Features:
 * - RAF-based smooth scrolling
 * - Eased acceleration near edges
 * - Manual scroll detection and handling
 * - Scroll jump prevention during drag
 * - Automatic cleanup
 */
export function useAutoScroll(scrollContainerRef: React.RefObject<HTMLDivElement | null>) {
  const [isDragging, setIsDragging] = useState(false);
  
  // Refs for scroll management
  const scrollPositionRef = useRef<number>(0);
  const autoScrollAnimationRef = useRef<number | null>(null);
  const autoScrollSpeedRef = useRef<number>(0);
  const isManualScrollingRef = useRef<boolean>(false);
  const manualScrollTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  
  // Smooth auto-scroll using RAF - updates scroll speed based on mouse position
  const handleAutoScroll = useCallback((e: MouseEvent) => {
    if (!isDragging || !scrollContainerRef.current) return;
    
    const container = scrollContainerRef.current;
    const rect = container.getBoundingClientRect();
    const scrollZone = 150; // Distance from edge to trigger scroll (larger zone)
    const maxScrollSpeedUp = 15; // Maximum pixels per frame when scrolling up
    const maxScrollSpeedDown = 60; // Maximum pixels per frame when scrolling down (faster)
    const minScrollSpeed = 1; // Minimum pixels per frame
    
    const mouseY = e.clientY;
    const distanceFromTop = mouseY - rect.top;
    const distanceFromBottom = rect.bottom - mouseY;
    
    // Calculate speed based on distance (closer to edge = faster)
    // Using easing function for smoother acceleration
    const calculateSpeed = (distance: number, maxSpeed: number): number => {
      const ratio = 1 - (distance / scrollZone);
      // Quadratic easing for smoother acceleration
      const easedRatio = ratio * ratio;
      return minScrollSpeed + (easedRatio * (maxSpeed - minScrollSpeed));
    };
    
    // Determine scroll direction and speed
    let newSpeed = 0;
    
    if (distanceFromTop < scrollZone && container.scrollTop > 0) {
      // Scroll up (negative speed)
      newSpeed = -calculateSpeed(distanceFromTop, maxScrollSpeedUp);
    } else if (distanceFromBottom < scrollZone && 
               container.scrollTop < container.scrollHeight - container.clientHeight) {
      // Scroll down (positive speed) - faster than scrolling up
      newSpeed = calculateSpeed(distanceFromBottom, maxScrollSpeedDown);
    }
    
    // Update speed ref for the animation loop
    autoScrollSpeedRef.current = newSpeed;
  }, [isDragging, scrollContainerRef]);
  
  // Continuous RAF-based scrolling loop
  useEffect(() => {
    if (!isDragging) return;
    
    const scroll = () => {
      // Pause auto-scroll if user is manually scrolling
      if (scrollContainerRef.current && autoScrollSpeedRef.current !== 0 && !isManualScrollingRef.current) {
        const container = scrollContainerRef.current;
        const newScrollTop = container.scrollTop + autoScrollSpeedRef.current;
        
        // Clamp to valid scroll range
        const maxScroll = container.scrollHeight - container.clientHeight;
        container.scrollTop = Math.max(0, Math.min(newScrollTop, maxScroll));
        
        // Update our reference
        scrollPositionRef.current = container.scrollTop;
      }
      
      autoScrollAnimationRef.current = requestAnimationFrame(scroll);
    };
    
    autoScrollAnimationRef.current = requestAnimationFrame(scroll);
    
    return () => {
      if (autoScrollAnimationRef.current) {
        cancelAnimationFrame(autoScrollAnimationRef.current);
        autoScrollAnimationRef.current = null;
      }
      autoScrollSpeedRef.current = 0;
    };
  }, [isDragging, scrollContainerRef]);
  
  // Monitor and prevent scroll jumps during drag
  useEffect(() => {
    if (!isDragging || !scrollContainerRef.current) return;
    
    const container = scrollContainerRef.current;
    let frameId: number;
    
    // Detect manual scrolling via wheel/trackpad
    const handleWheel = () => {
      isManualScrollingRef.current = true;
      
      // Clear any existing timeout
      if (manualScrollTimeoutRef.current) {
        clearTimeout(manualScrollTimeoutRef.current);
      }
      
      // Stop auto-scroll temporarily
      autoScrollSpeedRef.current = 0;
      
      // Mark manual scrolling as finished after a brief delay
      manualScrollTimeoutRef.current = setTimeout(() => {
        isManualScrollingRef.current = false;
        // Update scroll position reference
        if (scrollContainerRef.current) {
          scrollPositionRef.current = scrollContainerRef.current.scrollTop;
        }
      }, 150);
    };
    
    // Prevent programmatic scrolling via scroll event
    const preventScrollJump = (e: Event) => {
      // Allow scrolls during manual scrolling or auto-scrolling
      if (autoScrollSpeedRef.current === 0 && !isManualScrollingRef.current) {
        // Not auto-scrolling or manually scrolling, so prevent any scroll changes
        const diff = Math.abs(container.scrollTop - scrollPositionRef.current);
        if (diff > 5) {
          // Prevent the scroll and restore position
          e.preventDefault();
          e.stopPropagation();
          container.scrollTop = scrollPositionRef.current;
        }
      } else if (isManualScrollingRef.current) {
        // Update reference during manual scroll
        scrollPositionRef.current = container.scrollTop;
      }
      // Note: scrollPositionRef is updated in the RAF scroll loop when auto-scrolling
    };
    
    // Add event listeners
    container.addEventListener('wheel', handleWheel, { passive: true });
    container.addEventListener('scroll', preventScrollJump, { capture: true, passive: false });
    
    const monitorScroll = () => {
      // Additional RAF-based monitoring as backup
      if (container.scrollTop !== scrollPositionRef.current && 
          autoScrollSpeedRef.current === 0 && 
          !isManualScrollingRef.current) {
        const diff = Math.abs(container.scrollTop - scrollPositionRef.current);
        if (diff > 5) {
          container.scrollTop = scrollPositionRef.current;
        }
      }
      
      frameId = requestAnimationFrame(monitorScroll);
    };
    
    frameId = requestAnimationFrame(monitorScroll);
    
    return () => {
      container.removeEventListener('wheel', handleWheel);
      container.removeEventListener('scroll', preventScrollJump, { capture: true });
      if (frameId) {
        cancelAnimationFrame(frameId);
      }
      if (manualScrollTimeoutRef.current) {
        clearTimeout(manualScrollTimeoutRef.current);
      }
    };
  }, [isDragging, scrollContainerRef]);
  
  // Handle drag stop - cleanup and reset
  const handleDragStop = useCallback(() => {
    // Clear auto-scroll animation
    if (autoScrollAnimationRef.current) {
      cancelAnimationFrame(autoScrollAnimationRef.current);
      autoScrollAnimationRef.current = null;
    }
    autoScrollSpeedRef.current = 0;
    
    // Clear manual scroll timeout
    if (manualScrollTimeoutRef.current) {
      clearTimeout(manualScrollTimeoutRef.current);
      manualScrollTimeoutRef.current = null;
    }
    isManualScrollingRef.current = false;
    
    // Reset dragging state
    setIsDragging(false);
  }, []);
  
  // Failsafe: global mouseup listener to catch edge cases where onDragStop isn't called
  useEffect(() => {
    if (!isDragging) return;
    
    const handleGlobalMouseUp = () => {
      // If we're still dragging when mouse is released, reset state
      // This catches cases where React Grid Layout doesn't fire onDragStop
      handleDragStop();
    };
    
    window.addEventListener('mouseup', handleGlobalMouseUp, { once: true });
    
    return () => {
      window.removeEventListener('mouseup', handleGlobalMouseUp);
    };
  }, [isDragging, handleDragStop]);

  // Set up auto-scroll on mouse move during drag
  useEffect(() => {
    if (isDragging) {
      window.addEventListener('mousemove', handleAutoScroll);
      
      return () => {
        window.removeEventListener('mousemove', handleAutoScroll);
        autoScrollSpeedRef.current = 0;
      };
    }
  }, [isDragging, handleAutoScroll]);
  
  // Handle drag start - save scroll position and enable dragging state
  const handleDragStart = useCallback(() => {
    if (scrollContainerRef.current) {
      scrollPositionRef.current = scrollContainerRef.current.scrollTop;
      
      // Lock scroll position by preventing scroll events temporarily
      const container = scrollContainerRef.current;
      const savedPosition = scrollPositionRef.current;
      
      // Aggressive scroll locking during drag initialization
      const lockScroll = () => {
        if (container.scrollTop !== savedPosition) {
          container.scrollTop = savedPosition;
        }
      };
      
      // Lock scroll multiple times during the first few frames
      requestAnimationFrame(lockScroll);
      requestAnimationFrame(() => requestAnimationFrame(lockScroll));
      setTimeout(lockScroll, 0);
      setTimeout(lockScroll, 10);
      setTimeout(lockScroll, 20);
    }
    
    setIsDragging(true);
  }, [scrollContainerRef]);
  
  // Cleanup on unmount - ensure drag state is reset
  useEffect(() => {
    return () => {
      if (autoScrollAnimationRef.current) {
        cancelAnimationFrame(autoScrollAnimationRef.current);
        autoScrollAnimationRef.current = null;
      }
      if (manualScrollTimeoutRef.current) {
        clearTimeout(manualScrollTimeoutRef.current);
        manualScrollTimeoutRef.current = null;
      }
      // Reset refs on unmount as a safety measure
      // State will be destroyed anyway, but we need to stop animations
      autoScrollSpeedRef.current = 0;
      isManualScrollingRef.current = false;
    };
  }, []);
  
  return {
    isDragging,
    handleDragStart,
    handleDragStop,
  };
}

