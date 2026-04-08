import { useAssistantContext } from "@assistant-ui/react";
import { useCallback, useMemo } from "react";
import type { WorkspaceCanvasState } from "@/lib/workspace-state/types";
import { formatWorkspaceContext } from "@/lib/utils/format-workspace-context";

/**
 * Hook that injects minimal workspace context (metadata and system instructions) into the assistant.
 * Cards register their own context individually, so this only includes workspace-level metadata
 * Automatically updates when workspace state changes and cleans up on unmount
 * @param workspaceName - Canonical workspace metadata from the workspace row
 */
export function useWorkspaceContextProvider(
  workspaceId: string | null,
  state: WorkspaceCanvasState,
  workspaceName?: string
) {
  const contextInstructions = useMemo(
    () => (workspaceId ? formatWorkspaceContext(state, workspaceName) : ""),
    [workspaceId, state, workspaceName]
  );

  const getContext = useCallback(() => contextInstructions, [contextInstructions]);

  useAssistantContext({
    disabled: !workspaceId,
    getContext,
  });
}
