import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useWorkspaceEvents } from "./use-workspace-events";
import {
  deriveWorkspaceStateFromCaches,
  type WorkspaceStateResponse,
  workspaceStateQueryKey,
} from "./workspace-state-cache";

async function fetchWorkspaceState(
  workspaceId: string,
): Promise<WorkspaceStateResponse> {
  const response = await fetch(`/api/workspaces/${workspaceId}/state`);

  if (!response.ok) {
    throw new Error(`Failed to fetch workspace state: ${response.statusText}`);
  }

  return response.json();
}

export function useWorkspaceState(workspaceId: string | null) {
  const stateQuery = useQuery({
    queryKey: workspaceStateQueryKey(workspaceId),
    queryFn: () => fetchWorkspaceState(workspaceId!),
    enabled: !!workspaceId,
    staleTime: 1000 * 30,
    gcTime: 1000 * 60 * 10,
    refetchOnWindowFocus: false,
  });
  const eventsQuery = useWorkspaceEvents(workspaceId);

  const derived = useMemo(
    () =>
      deriveWorkspaceStateFromCaches({
        workspaceId,
        stateData: stateQuery.data,
        eventLog: eventsQuery.data,
      }),
    [workspaceId, stateQuery.data, eventsQuery.data],
  );

  return {
    state: derived.state,
    isLoading: stateQuery.isLoading && !stateQuery.data,
    error: stateQuery.error ?? eventsQuery.error,
    version: derived.version,
    refetch: async () => {
      await Promise.all([stateQuery.refetch(), eventsQuery.refetch()]);
    },
  };
}
