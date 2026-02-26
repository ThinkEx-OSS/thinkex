import { useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

/**
 * Hook for workspace version control (undo/revert)
 * Calls the undo API to delete events above a target version,
 * then invalidates the events query so state re-derives automatically.
 */
export function useWorkspaceHistory(workspaceId: string | null) {
  const queryClient = useQueryClient();

  const revertToVersion = useCallback(
    async (targetVersion: number) => {
      if (!workspaceId) return;

      try {
        const response = await fetch(
          `/api/workspaces/${workspaceId}/events/undo`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ targetVersion }),
          }
        );

        if (!response.ok) {
          const data = await response.json().catch(() => ({}));
          throw new Error(data.error || "Failed to revert");
        }

        const data = await response.json();

        await queryClient.invalidateQueries({
          queryKey: ["workspace", workspaceId, "events"],
        });

        toast.success(
          `Reverted ${data.deletedCount} ${data.deletedCount === 1 ? "change" : "changes"}`
        );
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Failed to revert";
        toast.error(message);
        throw error;
      }
    },
    [workspaceId, queryClient]
  );

  return {
    revertToVersion,
  };
}
