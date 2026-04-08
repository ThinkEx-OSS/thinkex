import { useAssistantContext } from "@assistant-ui/react";
import { useCallback, useMemo } from "react";
import type { WorkspaceState } from "@/lib/workspace-state/types";
import { formatWorkspaceContext } from "@/lib/utils/format-workspace-context";

/**
 * Hook that injects minimal workspace context (metadata and system instructions) into the assistant.
 * Cards register their own context individually, so this only includes workspace-level metadata
 * Automatically updates when workspace state changes and cleans up on unmount
 * @param workspaceNameFallback - Canonical workspace name from `workspaces.name`
 */
export function useWorkspaceContextProvider(
  workspaceId: string | null,
  state: WorkspaceState,
  workspaceNameFallback?: string
) {
  const contextInstructions = useMemo(
    () => (workspaceId ? formatWorkspaceContext(state, workspaceNameFallback) : ""),
    [workspaceId, state, workspaceNameFallback]
  );

  const getContext = useCallback(() => contextInstructions, [contextInstructions]);

  useAssistantContext({
    disabled: !workspaceId,
    getContext,
  });
}
