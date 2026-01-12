import { useAssistantInstructions } from "@assistant-ui/react";
import { useEffect, useMemo } from "react";
import type { Item } from "@/lib/workspace-state/types";
import { useIsAssistantAvailable } from "@/contexts/AssistantAvailabilityContext";

/**
 * Hook that registers minimal context for an individual card
 * Each card registers its own context (title, id, type) using modelContext API
 * Automatically updates when card properties change and cleans up on unmount
 * 
 * Note: Gracefully handles missing AssistantProvider (e.g., in guest mode)
 * by checking useIsAssistantAvailable() first and becoming a no-op
 */
export function useCardContextProvider(item: Item) {
  const isAssistantAvailable = useIsAssistantAvailable();

  // Format minimal card context - memoized to avoid recalculation
  // Only include type and title, not ID (tools will handle ID lookup by title)
  const cardContext = useMemo(() => {
    return `<card type="${item.type}">${item.name}</card>`;
  }, [item.name, item.type]);

  // Use the high-level hook to register instructions
  // This automatically handles cleanup and updates
  // We disable it if the assistant isn't available (e.g. guest mode)
  useAssistantInstructions({
    instruction: cardContext,
    disabled: !isAssistantAvailable,
  });
}

// Re-export for components that need more control
export { useIsAssistantAvailable };
