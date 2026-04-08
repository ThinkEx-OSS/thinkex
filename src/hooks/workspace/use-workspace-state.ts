import { useQuery } from "@tanstack/react-query";
import type { WorkspaceState } from "@/lib/workspace-state/types";
import { workspaceStateQueryKey } from "./workspace-query-keys";
import {
  EMPTY_WORKSPACE_ACTIVITY_SUMMARY,
  type WorkspaceActivitySummary,
  type WorkspaceStatePayload,
  createFallbackWorkspaceState,
  normalizeWorkspaceStatePayload,
} from "@/lib/workspace/workspace-activity";

type WorkspaceStateResponse = {
  workspace?: {
    state?: WorkspaceState;
    activity?: WorkspaceActivitySummary;
  };
};

async function fetchWorkspaceState(
  workspaceId: string,
): Promise<WorkspaceStatePayload> {
  const response = await fetch(`/api/workspaces/${workspaceId}`);

  if (!response.ok) {
    throw new Error(`Failed to fetch workspace state: ${response.statusText}`);
  }

  const data = (await response.json()) as WorkspaceStateResponse;
  return normalizeWorkspaceStatePayload(workspaceId, data);
}

/**
 * Hook to get current workspace state.
 * Current-state reads use the projection-backed server route instead of replaying
 * the full event log on the client.
 */
export function useWorkspaceState(workspaceId: string | null) {
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: workspaceStateQueryKey(workspaceId),
    queryFn: () => fetchWorkspaceState(workspaceId!),
    enabled: !!workspaceId,
    staleTime: 1000 * 30,
    gcTime: 1000 * 60 * 10,
    refetchOnWindowFocus: false,
  });

  const fallbackState = createFallbackWorkspaceState(workspaceId);

  return {
    state: data?.state ?? fallbackState,
    isLoading,
    error,
    version: data?.activity.version ?? EMPTY_WORKSPACE_ACTIVITY_SUMMARY.version,
    eventCount:
      data?.activity.eventCount ?? EMPTY_WORKSPACE_ACTIVITY_SUMMARY.eventCount,
    lastEventAt:
      data?.activity.lastEventAt ?? EMPTY_WORKSPACE_ACTIVITY_SUMMARY.lastEventAt,
    refetch,
  };
}

