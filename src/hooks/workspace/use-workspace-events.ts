import { useQuery } from "@tanstack/react-query";
import type { EventResponse } from "@/lib/workspace/events";

/**
 * Fetch workspace events from API
 */
async function fetchWorkspaceEvents(workspaceId: string): Promise<EventResponse> {
  try {
    const response = await fetch(`/api/workspaces/${workspaceId}/events`);

    if (!response.ok) {
      throw new Error(`Failed to fetch events: ${response.statusText}`);
    }

    const data = await response.json();
    return data;
  } catch (err) {
    console.error(`[EVENTS] Failed to fetch events for ${workspaceId}`, err);
    throw err;
  }
}

/**
 * Hook to fetch workspace events using React Query
 * Automatically caches and refetches as configured
 */
export function useWorkspaceEvents(workspaceId: string | null) {
  return useQuery({
    queryKey: ["workspace", workspaceId, "events"],
    queryFn: () => fetchWorkspaceEvents(workspaceId!),
    enabled: !!workspaceId,
    staleTime: 1000 * 30, // 30 seconds - allows instant workspace switches
    gcTime: 1000 * 60 * 10, // 10 minutes - cache inactive workspaces
    refetchInterval: false, // DISABLE POLLING - use event-based updates only
    refetchOnWindowFocus: false, // Explicitly disable to reduce downloads
  });
}

