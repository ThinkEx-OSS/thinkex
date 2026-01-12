import { useMemo, useEffect, useRef } from "react";
import { useWorkspaceEvents } from "./use-workspace-events";
import { replayEvents } from "@/lib/workspace/event-reducer";
import { initialState } from "@/lib/workspace-state/state";
import type { AgentState } from "@/lib/workspace-state/types";

/**
 * Hook to get derived workspace state from events
 * State is computed by replaying events (pure function, no mutations)
 */
export function useWorkspaceState(workspaceId: string | null) {
  const { data: eventLog, isLoading, error, refetch } = useWorkspaceEvents(workspaceId);

  const prevStateRef = useRef<AgentState | null>(null);
  const stateUpdateCountRef = useRef(0);

  // Derive state by replaying events (with snapshot optimization)
  const state: AgentState = useMemo(() => {
    const replayStart = performance.now();
    stateUpdateCountRef.current += 1;
    const updateNumber = stateUpdateCountRef.current;
    
    if (!eventLog || !workspaceId) {
      return { ...initialState, workspaceId: workspaceId || undefined };
    }

    // Use snapshot as base state if available, then replay delta events
    const snapshotState = eventLog.snapshot?.state;
    const replayedState = replayEvents(eventLog.events, workspaceId, snapshotState);
    
    const replayTime = performance.now() - replayStart;
    const prevItemsCount = prevStateRef.current?.items.length || 0;
    const itemsChanged = prevItemsCount !== replayedState.items.length;
    
    // Only log if replay is slow (>50ms), items count changed significantly, or first update
    // This reduces log noise from fast, frequent replays during optimistic updates
    const shouldLog = replayTime > 50 || 
                      (itemsChanged && Math.abs(prevItemsCount - replayedState.items.length) > 5) || 
                      updateNumber === 1;
    
    if (shouldLog) {
      // Logging removed - use logger if needed
    }
    
    prevStateRef.current = replayedState;
    return replayedState;
  }, [eventLog, workspaceId]);
  
  // Log when state changes trigger slow re-renders
  useEffect(() => {
    const renderStart = performance.now();
    const timeoutId = setTimeout(() => {
      const renderTime = performance.now() - renderStart;
      // Only warn if render takes longer than 500ms (indicates a serious problem)
      if (renderTime > 500) {
        console.warn(`[STATE-RENDER-SLOW] State update took ${renderTime.toFixed(2)}ms to render (${state.items.length} items) - this may cause UI freeze`);
      }
    }, 0);
    
    return () => clearTimeout(timeoutId);
  }, [state]);

  return {
    state,
    isLoading,
    error,
    version: eventLog?.version ?? 0,
    refetch,
  };
}

