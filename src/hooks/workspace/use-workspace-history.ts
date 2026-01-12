import { useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { EventResponse } from "@/lib/workspace/events";

/**
 * Hook for workspace version control (undo/redo/time-travel)
 * Works like Git - replay events to any point in history
 */
export function useWorkspaceHistory(workspaceId: string | null) {
  const queryClient = useQueryClient();

  /**
   * Undo the last change (like git revert HEAD)
   */
  const undo = useCallback(() => {
    if (!workspaceId) return;

    const currentData = queryClient.getQueryData<EventResponse>([
      "workspace",
      workspaceId,
      "events",
    ]);

    if (!currentData || currentData.events.length === 0) {
      return;
    }

    // Remove last event (optimistic local undo)
    const newEvents = currentData.events.slice(0, -1);
    
    queryClient.setQueryData<EventResponse>(
      ["workspace", workspaceId, "events"],
      {
        events: newEvents,
        version: currentData.version - 1,
      }
    );
    
    // Note: This is local only. For persistent undo, you'd emit a compensating event
    // For now, this gives instant feedback and the next change will sync properly
  }, [workspaceId, queryClient]);

  /**
   * Revert to a specific version (like git checkout <commit>)
   */
  const revertToVersion = useCallback(
    async (targetVersion: number) => {
      if (!workspaceId) return;

      const currentData = queryClient.getQueryData<EventResponse>([
        "workspace",
        workspaceId,
        "events",
      ]);

      if (!currentData) return;

      // Keep only events up to target version
      const eventsToKeep = currentData.events.filter((_, idx) => idx <= targetVersion);

      queryClient.setQueryData<EventResponse>(
        ["workspace", workspaceId, "events"],
        {
          events: eventsToKeep,
          version: targetVersion,
        }
      );
      
      // Note: This is local only. For persistent revert, emit compensating events
    },
    [workspaceId, queryClient]
  );

  /**
   * Check if undo is available
   */
  const canUndo = useCallback(() => {
    if (!workspaceId) return false;

    const currentData = queryClient.getQueryData<EventResponse>([
      "workspace",
      workspaceId,
      "events",
    ]);

    return (currentData?.events.length ?? 0) > 1; // Can undo if more than 1 event (keep snapshot)
  }, [workspaceId, queryClient]);

  return {
    undo,
    revertToVersion,
    canUndo: canUndo(),
  };
}

