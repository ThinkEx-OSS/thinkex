import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { WorkspaceEvent, EventResponse } from "@/lib/workspace/events";
import { logger } from "@/lib/utils/logger";
import { useRef } from "react";
import { toast } from "sonner";

/**
 * Maximum number of automatic retries for version conflicts
 * This prevents infinite retry loops while allowing concurrent edits to succeed
 */
const MAX_RETRY_ATTEMPTS = 3;

interface AppendEventParams {
  workspaceId: string;
  event: WorkspaceEvent;
  baseVersion: number;
}

interface WorkspaceMutationOptions {
  /** Called after event is successfully saved (for realtime broadcast) */
  onEventSaved?: (event: WorkspaceEvent) => void;
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
    if (response.status === 403) {
      throw new Error("PERMISSION_DENIED");
    }
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
export function useWorkspaceMutation(workspaceId: string | null, options: WorkspaceMutationOptions = {}) {
  const queryClient = useQueryClient();
  const { onEventSaved } = options;

  // Track retry attempts per event ID to prevent infinite loops
  const retryAttemptsRef = useRef<Map<string, number>>(new Map());

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

      // Calculate the actual max version from all events in cache
      // This is critical because after tool completions, events may have versions
      // that are higher than the cache's version field
      const events = currentData?.events ?? [];
      const optimisticEventsCount = events.filter(e => typeof e.version !== 'number').length;

      // Find the max version from all events that have versions
      // This accounts for tool events that were added with versions
      const maxEventVersion = events
        .filter(e => typeof e.version === 'number')
        .reduce((max, e) => Math.max(max, e.version!), currentData?.version ?? 0);

      // Use the higher of: cache version or max event version
      // This ensures we account for tool events that updated individual event versions
      // but might not have updated the cache version field
      const currentVersion = Math.max(currentData?.version ?? 0, maxEventVersion);

      // CRITICAL FIX: Account for optimistic events when calculating baseVersion
      // If there are optimistic events (pending mutations), they will increment the server version
      // So we need to use a baseVersion that accounts for those pending increments
      // Note: onMutate runs before mutationFn, so optimisticEventsCount includes our own
      // optimistic event plus any other pending mutations. We subtract 1 to exclude our
      // own event and only account for other mutations that will complete before this one.
      // Example: If currentVersion=169 and optimisticEventsCount=2 (ours + 1 other), 
      // then 1 other mutation will complete first, making server version 170
      // So we should use baseVersion = 169 + (2-1) = 170
      const adjustedBaseVersion = currentVersion + Math.max(0, optimisticEventsCount - 1);

      logger.debug("🚀 [MUTATION] Starting mutation:", {
        workspaceId,
        cacheVersion: currentData?.version ?? 0,
        maxEventVersion,
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

      // Show toast for permission errors
      if (err.message === "PERMISSION_DENIED") {
        toast.error("You don't have permission to edit this workspace");
      } else {
        // Only show generic error for non-permission issues to avoid noise
        // toast.error("Failed to save changes");
      }

      // Rollback to previous state
      queryClient.setQueryData(
        ["workspace", workspaceId, "events"],
        context.previous
      );
    },

    // Refetch to ensure consistency on success
    onSuccess: (data, event, context) => {
      if (!workspaceId) return;

      logger.debug("✅ [SUCCESS] Mutation succeeded:", {
        conflict: data.conflict,
        newVersion: data.version,
        eventId: event.id,
      });

      // Handle conflicts with automatic retry
      if (data.conflict) {
        // Check retry count for this event
        const currentRetries = retryAttemptsRef.current.get(event.id) || 0;

        if (currentRetries < MAX_RETRY_ATTEMPTS) {
          logger.warn(`⚠️ [CONFLICT] Version conflict detected, auto-retrying (attempt ${currentRetries + 1}/${MAX_RETRY_ATTEMPTS})...`);

          // Increment retry counter
          retryAttemptsRef.current.set(event.id, currentRetries + 1);

          // First, remove the optimistic event from cache
          queryClient.setQueryData<EventResponse>(
            ["workspace", workspaceId, "events"],
            (old) => {
              if (!old) return old;

              // Remove events without version numbers (optimistic events)
              const confirmedEvents = old.events.filter(e => typeof e.version === 'number');

              return {
                ...old,
                events: confirmedEvents,
                version: data.version, // Update to current server version
              };
            }
          );

          // Refetch to get latest events, then automatically retry
          queryClient.invalidateQueries({
            queryKey: ["workspace", workspaceId, "events"],
          }).then(() => {
            // After cache is updated with latest events, retry the mutation
            logger.debug("🔄 [RETRY] Retrying event after refetch:", event.type);

            // Re-apply optimistic update
            queryClient.setQueryData<EventResponse>(
              ["workspace", workspaceId, "events"],
              (old) => {
                if (!old) return old;

                return {
                  ...old,
                  events: [...old.events, { ...event }],
                };
              }
            );

            // Retry the mutation with updated base version
            const currentData = queryClient.getQueryData<EventResponse>(["workspace", workspaceId, "events"]);
            if (currentData) {
              const events = currentData.events ?? [];
              const maxEventVersion = events
                .filter(e => typeof e.version === 'number')
                .reduce((max, e) => Math.max(max, e.version!), currentData.version ?? 0);
              const currentVersion = Math.max(currentData.version ?? 0, maxEventVersion);

              logger.debug("🔄 [RETRY] Using base version:", currentVersion);

              // Call API directly to retry
              appendWorkspaceEvent({
                workspaceId,
                event,
                baseVersion: currentVersion
              }).then((retryResult) => {
                if (retryResult.conflict) {
                  // Still conflicting after retry - treat as final failure
                  logger.error("❌ [RETRY] Retry failed with conflict, giving up");

                  // Remove optimistic event
                  queryClient.setQueryData<EventResponse>(
                    ["workspace", workspaceId, "events"],
                    (old) => {
                      if (!old) return old;
                      return {
                        ...old,
                        events: old.events.filter(e => e.id !== event.id),
                      };
                    }
                  );

                  // Clean up retry counter
                  retryAttemptsRef.current.delete(event.id);

                  // Force full refetch
                  queryClient.invalidateQueries({
                    queryKey: ["workspace", workspaceId, "events"],
                  });
                } else {
                  // Retry succeeded!
                  logger.debug("✅ [RETRY] Retry succeeded, version:", retryResult.version);

                  // Update event with version
                  queryClient.setQueryData<EventResponse>(
                    ["workspace", workspaceId, "events"],
                    (old) => {
                      if (!old) return old;

                      const updatedEvents = old.events.map(e =>
                        e.id === event.id ? { ...e, version: retryResult.version } : e
                      );

                      return {
                        ...old,
                        events: updatedEvents,
                        version: retryResult.version,
                      };
                    }
                  );

                  // Clean up retry counter
                  retryAttemptsRef.current.delete(event.id);

                  // Broadcast the successful event
                  if (onEventSaved) {
                    onEventSaved({ ...event, version: retryResult.version });
                  }
                }
              }).catch((err) => {
                logger.error("❌ [RETRY] Retry failed with error:", err);

                // Remove optimistic event
                queryClient.setQueryData<EventResponse>(
                  ["workspace", workspaceId, "events"],
                  (old) => {
                    if (!old) return old;
                    return {
                      ...old,
                      events: old.events.filter(e => e.id !== event.id),
                    };
                  }
                );

                // Clean up retry counter
                retryAttemptsRef.current.delete(event.id);

                // Restore from context if available
                if (context?.previous) {
                  queryClient.setQueryData(
                    ["workspace", workspaceId, "events"],
                    context.previous
                  );
                }
              });
            }
          });
        } else {
          // Max retries exceeded
          logger.error(`❌ [CONFLICT] Max retries (${MAX_RETRY_ATTEMPTS}) exceeded for event ${event.id}`);

          // Remove optimistic event
          queryClient.setQueryData<EventResponse>(
            ["workspace", workspaceId, "events"],
            (old) => {
              if (!old) return old;
              return {
                ...old,
                events: old.events.filter(e => e.id !== event.id),
              };
            }
          );

          // Clean up retry counter
          retryAttemptsRef.current.delete(event.id);

          // Force full refetch to get true server state
          queryClient.invalidateQueries({
            queryKey: ["workspace", workspaceId, "events"],
          });
        }
      } else {
        // Success! No conflict
        // Clean up retry counter if it exists
        retryAttemptsRef.current.delete(event.id);

        // Update the version in cache without full refetch
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

        // Broadcast the event to other clients for realtime sync
        if (onEventSaved) {
          const eventWithVersion: WorkspaceEvent = {
            ...event,
            version: data.version,
          };
          onEventSaved(eventWithVersion);
        }
      }
    },
  });
}

