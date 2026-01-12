import { useQuery } from "@tanstack/react-query";
import type { SnapshotInfo } from "@/lib/workspace/events";

/**
 * Fetch all workspace snapshots from API
 */
async function fetchWorkspaceSnapshots(workspaceId: string): Promise<SnapshotInfo[]> {
  const response = await fetch(`/api/workspaces/${workspaceId}/snapshots`);
  
  if (!response.ok) {
    throw new Error(`Failed to fetch snapshots: ${response.statusText}`);
  }
  
  const data = await response.json();
  return data.snapshots || [];
}

/**
 * Hook to fetch all workspace snapshots using React Query
 * Used for version history modal - only fetches when enabled
 */
export function useWorkspaceSnapshots(workspaceId: string | null, enabled: boolean = false) {
  return useQuery({
    queryKey: ["workspace", workspaceId, "snapshots"],
    queryFn: () => fetchWorkspaceSnapshots(workspaceId!),
    enabled: !!workspaceId && enabled,
    staleTime: 1000 * 60 * 5, // 5 minutes - snapshots don't change often
    gcTime: 1000 * 60 * 10, // 10 minutes
    refetchOnWindowFocus: false, // Explicitly disable to reduce downloads
  });
}

