import { useQuery } from "@tanstack/react-query";
import type { EventResponse } from "@/lib/workspace/events";

export function workspaceEventsQueryKey(workspaceId: string | null) {
  return ["workspace", workspaceId, "events"] as const;
}

async function fetchWorkspaceEvents(
  workspaceId: string,
): Promise<EventResponse> {
  try {
    const response = await fetch(`/api/workspaces/${workspaceId}/events`);

    if (!response.ok) {
      throw new Error(`Failed to fetch events: ${response.statusText}`);
    }

    return await response.json();
  } catch (err) {
    console.error(`[EVENTS] Failed to fetch events for ${workspaceId}`, err);
    throw err;
  }
}

export function useWorkspaceEvents(workspaceId: string | null) {
  return useQuery({
    queryKey: workspaceEventsQueryKey(workspaceId),
    queryFn: () => fetchWorkspaceEvents(workspaceId!),
    enabled: !!workspaceId,
    staleTime: 1000 * 30,
    gcTime: 1000 * 60 * 10,
    refetchInterval: false,
    refetchOnWindowFocus: false,
  });
}
