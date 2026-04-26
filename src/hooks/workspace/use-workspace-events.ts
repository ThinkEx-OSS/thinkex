import { useQuery } from "@rocicorp/zero/react";
import { queries } from "@/lib/zero/queries";
import type { WorkspaceEventsRow } from "@/lib/zero/zero-schema.gen";

export function useWorkspaceEvents(
  workspaceId: string | null,
  limit = 50,
): {
  events: readonly WorkspaceEventsRow[];
  isLoading: boolean;
  error: Error | null;
} {
  const [rows, status] = useQuery(
    workspaceId ? queries.workspace.events({ workspaceId, limit }) : null,
  );
  return {
    events: (rows ?? []) as readonly WorkspaceEventsRow[],
    isLoading: Boolean(workspaceId) && status.type === "unknown",
    error: status.type === "error" ? new Error(status.error.message) : null,
  };
}
