import { useAssistantApi } from "@assistant-ui/react";
import { useEffect, useMemo } from "react";
import { formatSelectedActionsContext } from "@/lib/utils/format-workspace-context";

/**
 * Hook that injects selected actions context into the assistant using modelContext API
 * Automatically updates when selected actions change and cleans up on unmount
 */
export function useSelectedActionsContextProvider(
  selectedActions: string[]
) {
  const api = useAssistantApi();

  // Format context for selected actions - memoized to avoid recalculation
  const contextInstructions = useMemo(
    () => formatSelectedActionsContext(selectedActions),
    [selectedActions]
  );

  // Register context provider with proper cleanup
  // Only register when there are selected actions
  useEffect(() => {
    if (selectedActions.length === 0) {
      return;
    }

    return api.modelContext().register({
      getModelContext: () => ({
        system: contextInstructions,
      }),
    });
  }, [api, contextInstructions, selectedActions.length]);
}

