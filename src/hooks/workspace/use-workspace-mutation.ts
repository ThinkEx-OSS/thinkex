import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { WorkspaceEvent, EventResponse } from "@/lib/workspace/events";
import { logger } from "@/lib/utils/logger";

interface AppendEventParams {
  workspaceId: string;
  event: WorkspaceEvent;
  baseVersion: number;
}

/**
 * Append event to workspace event log
 */
async function appendWorkspaceEvent(
  { workspaceId, event, baseVersion }: AppendEventParams
): Promise<{ success: boolean; version: number; conflict?: boolean }> {
  logger.debug("📤 [API] Appending event:", {
    workspaceId,
    eventType: event.type,
    baseVersion,
    userId: event.userId,
  });

  const response = await fetch(`/api/workspaces/${workspaceId}/events`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ event, baseVersion }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    logger.error("❌ [API] Response error:", response.status, errorText);
    throw new Error(`Failed to append event: ${response.statusText} - ${errorText}`);
  }

  const result = await response.json();
  logger.debug("✅ [API] Event appended successfully:", result);
  return result;
}

/**
 * Hook to mutate workspace by appending events
 * Implements optimistic updates with automatic rollback on error
 */
export function useWorkspaceMutation(workspaceId: string | null) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (event: WorkspaceEvent) => {
      if (!workspaceId) {
        logger.error("❌ [MUTATION] No workspace ID!");
        throw new Error("No workspace ID provided");
      }

      // Get current version from cache at mutation time
      const currentData = queryClient.getQueryData<EventResponse>([
        "workspace",
        workspaceId,
        "events",
      ]);

      // Use the cache's version field directly - this is the authoritative server version
      // This is more reliable than calculating from events, especially during cache updates
      const currentVersion = currentData?.version ?? 0;
      const eventsCount = currentData?.events?.length ?? 0;
      const optimisticEventsCount = currentData?.events?.filter(e => typeof e.version !== 'number').length ?? 0;

      // CRITICAL FIX: Account for optimistic events when calculating baseVersion
      // If there are optimistic events (pending mutations), they will increment the server version
      // So we need to use a baseVersion that accounts for those pending increments
      // Note: optimisticEventsCount includes our own optimistic event (added in onMutate)
      // So we subtract 1 to get the count of mutations that will complete before this one
      // Example: If currentVersion=169 and optimisticEventsCount=2 (including ours), 
      // then 1 other mutation will complete first, making server version 170
      // So we should use baseVersion = 169 + (2-1) = 170
      const adjustedBaseVersion = currentVersion + Math.max(0, optimisticEventsCount - 1);

      logger.debug("🚀 [MUTATION] Starting mutation:", {
        workspaceId,
        currentVersion,
        adjustedBaseVersion,
        optimisticEventsCount,
        eventType: event.type,
        eventId: event.id,
      });

      return appendWorkspaceEvent({ workspaceId, event, baseVersion: adjustedBaseVersion });
    },

    // Optimistic update - apply event immediately to UI
    onMutate: async (event: WorkspaceEvent) => {
      if (!workspaceId) return;

      // Cancel any outgoing refetches to avoid overwriting optimistic update
      await queryClient.cancelQueries({
        queryKey: ["workspace", workspaceId, "events"],
      });

      // Snapshot the previous value for rollback
      const previous = queryClient.getQueryData<EventResponse>([
        "workspace",
        workspaceId,
        "events",
      ]);

      logger.debug("⚡ [OPTIMISTIC] Applying event optimistically:", {
        eventType: event.type,
        currentVersion: previous?.version,
      });

      // Optimistically update to the new value
      // NOTE: Don't increment version here - let server confirm the version
      queryClient.setQueryData<EventResponse>(
        ["workspace", workspaceId, "events"],
        (old) => {
          if (!old) {
            const newState = {
              events: [{ ...event }], // Don't assign version to optimistic events
              version: 0, // Keep server version, don't increment optimistically
            };
            return newState;
          }

          const newState = {
            ...old,
            events: [...old.events, { ...event }], // Don't assign version to optimistic events
            // Keep the same version - server will tell us the new version
            version: old.version,
          };
          return newState;
        }
      );

      // Return context with previous value for rollback
      return { previous };
    },

    // Rollback on error
    onError: (err, event, context) => {
      logger.error("❌ [MUTATION] Event mutation failed:", err);
      logger.error("❌ [MUTATION] Failed event:", event);
      logger.error("❌ [MUTATION] Error details:", {
        message: err instanceof Error ? err.message : String(err),
        workspaceId,
      });

      if (!workspaceId || !context?.previous) return;

      // Rollback to previous state
      queryClient.setQueryData(
        ["workspace", workspaceId, "events"],
        context.previous
      );
    },

    // Refetch to ensure consistency on success
    onSuccess: (data) => {
      if (!workspaceId) return;

      logger.debug("✅ [SUCCESS] Mutation succeeded:", {
        conflict: data.conflict,
        newVersion: data.version,
      });

      // Handle conflicts
      if (data.conflict) {
        logger.warn("⚠️ [CONFLICT] Event conflict detected, refetching...");

        // First, remove the optimistic event from cache to prevent baseVersion calculation issues
        queryClient.setQueryData<EventResponse>(
          ["workspace", workspaceId, "events"],
          (old) => {
            if (!old) return old;

            // Remove events without version numbers (optimistic events)
            const confirmedEvents = old.events.filter(e => typeof e.version === 'number');

            return {
              ...old,
              events: confirmedEvents,
            };
          }
        );

        // Then invalidate to force refetch with server state
        queryClient.invalidateQueries({
          queryKey: ["workspace", workspaceId, "events"],
        });
      } else {
        // Success! Update the version in cache without full refetch
        queryClient.setQueryData<EventResponse>(
          ["workspace", workspaceId, "events"],
          (old) => {
            if (!old) return old;

            // Find the last event without a version (the optimistic one) and assign the server version
            const updatedEvents = [...old.events];
            for (let i = updatedEvents.length - 1; i >= 0; i--) {
              if (typeof updatedEvents[i].version !== 'number') {
                updatedEvents[i] = {
                  ...updatedEvents[i],
                  version: data.version,
                };
                break; // Only update the first unversioned event we find
              }
            }

            const newState = {
              ...old,
              events: updatedEvents,
              version: data.version, // Update to server-confirmed version
            };
            return newState;
          }
        );

        logger.debug("✅ [SUCCESS] Version updated to:", data.version);
      }
    },
  });
}

