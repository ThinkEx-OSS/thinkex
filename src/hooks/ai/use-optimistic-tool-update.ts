import { useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { EventResponse } from "@/lib/workspace/events";
import type { WorkspaceEvent } from "@/lib/workspace/events";

interface ToolResult {
  success: boolean;
  itemId?: string;
  event?: WorkspaceEvent;
  version?: number;
}

/**
 * Hook to apply optimistic updates when a tool completes
 * Replaces invalidateQueries pattern with direct cache updates
 */
export function useOptimisticToolUpdate(
  status: { type: string } | undefined,
  result: ToolResult | undefined,
  workspaceId: string | null
) {
  const queryClient = useQueryClient();
  const hasAppliedUpdateRef = useRef<string | null>(null);

  useEffect(() => {
    if (
      status?.type === "complete" &&
      result?.success &&
      result.event &&
      workspaceId
    ) {
      const resultKey = result.event.id ?? result.itemId;
      if (resultKey == null) {
        return; // Cannot dedupe or apply without event.id or itemId
      }
      if (hasAppliedUpdateRef.current === resultKey) {
        return; // Already applied
      }
      hasAppliedUpdateRef.current = resultKey;

      // Cancel any pending refetches
      queryClient.cancelQueries({
        queryKey: ["workspace", workspaceId, "events"],
      });

      // Optimistically update cache
      queryClient.setQueryData<EventResponse>(
        ["workspace", workspaceId, "events"],
        (old) => {
          if (!old) {
            return {
              events: [{ ...result.event! }],
              version: result.version ?? 0,
            };
          }

          return {
            ...old,
            events: [...old.events, { ...result.event! }],
            version: result.version ?? old.version,
          };
        }
      );
    }
  }, [status, result, workspaceId, queryClient]);
}
