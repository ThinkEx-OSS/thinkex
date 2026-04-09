import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { WorkspaceEvent, EventResponse } from "@/lib/workspace/events";
import {
  computeBaseVersion,
  removeOptimisticEvent,
  confirmOptimisticEvent,
} from "@/lib/workspace/version-helpers";
import { workspaceEventsQueryKey } from "./use-workspace-events";
import { applyConfirmedWorkspaceEventToStateQuery } from "./workspace-state-cache";
import { useRef } from "react";
import { toast } from "sonner";

const MAX_RETRY_ATTEMPTS = 3;

type AppendEventResponse =
  | { success: true; version: number; conflict: false }
  | { conflict: true; version: number };

async function appendWorkspaceEvent(params: {
  workspaceId: string;
  event: WorkspaceEvent;
  baseVersion: number;
}): Promise<AppendEventResponse> {
  const { workspaceId, event, baseVersion } = params;
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
    throw new Error(
      `Failed to append event: ${response.statusText} - ${errorText}`,
    );
  }

  return response.json();
}

/**
 * Hook to mutate workspace by appending events.
 * Implements optimistic updates with automatic conflict retry.
 */
export function useWorkspaceMutation(workspaceId: string | null) {
  const queryClient = useQueryClient();
  const retryAttemptsRef = useRef<Map<string, number>>(new Map());

  return useMutation({
    mutationFn: (event: WorkspaceEvent) => {
      if (!workspaceId) {
        throw new Error("No workspace ID provided");
      }

      const cacheData = queryClient.getQueryData<EventResponse>(
        workspaceEventsQueryKey(workspaceId),
      );

      const { baseVersion } = computeBaseVersion(cacheData);

      return appendWorkspaceEvent({
        workspaceId,
        event,
        baseVersion,
      });
    },

    onMutate: async (event: WorkspaceEvent) => {
      if (!workspaceId) return;

      await queryClient.cancelQueries({
        queryKey: workspaceEventsQueryKey(workspaceId),
      });

      const previous = queryClient.getQueryData<EventResponse>(
        workspaceEventsQueryKey(workspaceId),
      );

      queryClient.setQueryData<EventResponse>(
        workspaceEventsQueryKey(workspaceId),
        (old) => {
          if (!old) {
            return { events: [{ ...event }], version: 0 };
          }
          return {
            ...old,
            events: [...old.events, { ...event }],
            version: old.version,
          };
        },
      );

      return { previous };
    },

    onError: (err, event, context) => {
      if (!workspaceId || !context?.previous) return;

      if (err.message === "PERMISSION_DENIED") {
        toast.error("You don't have permission to edit this workspace");
      }

      queryClient.setQueryData(
        workspaceEventsQueryKey(workspaceId),
        context.previous,
      );
    },

    onSuccess: (data, event, context) => {
      if (!workspaceId) return;

      if (data.conflict) {
        const currentRetries = retryAttemptsRef.current.get(event.id) || 0;

        if (currentRetries < MAX_RETRY_ATTEMPTS) {
          retryAttemptsRef.current.set(event.id, currentRetries + 1);

          queryClient.setQueryData<EventResponse>(
            workspaceEventsQueryKey(workspaceId),
            (old) => removeOptimisticEvent(old, event.id, data.version),
          );

          queryClient
            .invalidateQueries({
              queryKey: workspaceEventsQueryKey(workspaceId),
            })
            .then(() => {
              queryClient.setQueryData<EventResponse>(
                workspaceEventsQueryKey(workspaceId),
                (old) => {
                  if (!old) return old;
                  return {
                    ...old,
                    events: [...old.events, { ...event }],
                  };
                },
              );

              const currentData = queryClient.getQueryData<EventResponse>([
                "workspace",
                workspaceId,
                "events",
              ]);
              if (!currentData) return;

              const { baseVersion: retryBase } =
                computeBaseVersion(currentData);

              appendWorkspaceEvent({
                workspaceId,
                event,
                baseVersion: retryBase,
              })
                .then((retryResult) => {
                  if (retryResult.conflict) {
                    queryClient.setQueryData<EventResponse>(
                      workspaceEventsQueryKey(workspaceId),
                      (old) => removeOptimisticEvent(old, event.id),
                    );
                    retryAttemptsRef.current.delete(event.id);
                    queryClient.invalidateQueries({
                      queryKey: workspaceEventsQueryKey(workspaceId),
                    });
                  } else {
                    queryClient.setQueryData<EventResponse>(
                      workspaceEventsQueryKey(workspaceId),
                      (old) =>
                        confirmOptimisticEvent(
                          old,
                          event.id,
                          retryResult.version,
                        ),
                    );
                    retryAttemptsRef.current.delete(event.id);
                    applyConfirmedWorkspaceEventToStateQuery(
                      queryClient,
                      workspaceId,
                      { ...event, version: retryResult.version },
                    );
                  }
                })
                .catch(() => {
                  queryClient.setQueryData<EventResponse>(
                    workspaceEventsQueryKey(workspaceId),
                    (old) => removeOptimisticEvent(old, event.id),
                  );
                  retryAttemptsRef.current.delete(event.id);
                  if (context?.previous) {
                    queryClient.setQueryData(
                      workspaceEventsQueryKey(workspaceId),
                      context.previous,
                    );
                  }
                });
            });
        } else {
          queryClient.setQueryData<EventResponse>(
            workspaceEventsQueryKey(workspaceId),
            (old) => removeOptimisticEvent(old, event.id),
          );
          retryAttemptsRef.current.delete(event.id);
          queryClient.invalidateQueries({
            queryKey: workspaceEventsQueryKey(workspaceId),
          });
        }
      } else {
        retryAttemptsRef.current.delete(event.id);

        queryClient.setQueryData<EventResponse>(
          workspaceEventsQueryKey(workspaceId),
          (old) => confirmOptimisticEvent(old, event.id, data.version),
        );

        applyConfirmedWorkspaceEventToStateQuery(queryClient, workspaceId, {
          ...event,
          version: data.version,
        });
      }
    },
  });
}
