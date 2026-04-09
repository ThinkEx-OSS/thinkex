import { useMemo, useRef } from "react";
import { useWorkspaceEvents } from "./use-workspace-events";
import { replayEvents } from "@/lib/workspace/event-reducer";
import { initialItems } from "@/lib/workspace-state/state";
import type { Item } from "@/lib/workspace-state/types";

/**
 * Hook to get derived workspace state from events
 * State is computed by replaying events (pure function, no mutations)
 */
export function useWorkspaceState(workspaceId: string | null) {
  const { data: eventLog, isLoading, error, refetch } = useWorkspaceEvents(workspaceId);

  const prevItemsRef = useRef<Item[] | null>(null);
  const stateUpdateCountRef = useRef(0);

  // Derive state by replaying the workspace event log.
  const state: Item[] = useMemo(() => {
    const replayStart = performance.now();
    stateUpdateCountRef.current += 1;
    const updateNumber = stateUpdateCountRef.current;
    
    if (!eventLog || !workspaceId) {
      return initialItems;
    }

    const replayedItems = replayEvents(eventLog.events);
    
    const replayTime = performance.now() - replayStart;
    const prevItemsCount = prevItemsRef.current?.length || 0;
    const itemsChanged = prevItemsCount !== replayedItems.length;
    
    // Only log if replay is slow (>50ms), items count changed significantly, or first update
    // This reduces log noise from fast, frequent replays during optimistic updates
    const shouldLog = replayTime > 50 || 
                      (itemsChanged && Math.abs(prevItemsCount - replayedItems.length) > 5) || 
                      updateNumber === 1;
    
    if (shouldLog) {
      // Logging removed - use logger if needed
    }
    
    prevItemsRef.current = replayedItems;
    return replayedItems;
  }, [eventLog, workspaceId]);

  return {
    state,
    isLoading,
    error,
    version: eventLog?.version ?? 0,
    refetch,
  };
}
