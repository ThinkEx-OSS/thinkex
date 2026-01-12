import { useAssistantApi } from "@assistant-ui/react";
import { useEffect, useMemo } from "react";
import type { AgentState } from "@/lib/workspace-state/types";
import { formatWorkspaceContext } from "@/lib/utils/format-workspace-context";

/**
 * Hook that injects minimal workspace context (metadata and system instructions) into the assistant using modelContext API
 * Cards register their own context individually, so this only includes workspace-level metadata
 * Automatically updates when workspace state changes and cleans up on unmount
 */
export function useWorkspaceContextProvider(
  workspaceId: string | null, 
  state: AgentState
) {
  const api = useAssistantApi();

  // Format workspace context - memoized to avoid recalculation
  const contextInstructions = useMemo(
    () => workspaceId ? formatWorkspaceContext(state) : "",
    [workspaceId, state]
  );

  // Register context provider with proper cleanup
  useEffect(() => {
    if (!workspaceId) {
      return;
    }

    return api.modelContext().register({
      getModelContext: () => ({
        system: contextInstructions,
      }),
    });
  }, [api, contextInstructions, workspaceId]);
}
