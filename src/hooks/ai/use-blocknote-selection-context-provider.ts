import { useAssistantApi } from "@assistant-ui/react";
import { useEffect, useMemo } from "react";
import { useUIStore, selectBlockNoteSelection } from "@/lib/stores/ui-store";

/**
 * Hook that injects BlockNote text selection context into the assistant using modelContext API
 * Automatically updates when BlockNote selection changes and cleans up on unmount
 */
export function useBlockNoteSelectionContextProvider() {
  const api = useAssistantApi();
  const blockNoteSelection = useUIStore(selectBlockNoteSelection);

  // Format context for BlockNote selection - memoized to avoid recalculation
  const contextInstructions = useMemo(() => {
    if (!blockNoteSelection) {
      return "";
    }

    return [
      "<context>",
      "",
      "================================================================================",
      "TEXT SELECTION FROM CARD",
      "================================================================================",
      `The user has selected text from the card "${blockNoteSelection.cardName}" to provide as context for this conversation.`,
      "",
      "Selected text:",
      "",
      blockNoteSelection.text,
      "",
      "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━",
      "",
      "IMPORTANT: When the user asks questions or makes requests, consider the selected text above as primary context. Reference this selected text when relevant to the user's query.",
      "",
      "</context>"
    ].join("\n");
  }, [blockNoteSelection]);

  // Register context provider with proper cleanup
  // Only register when there is a selection
  useEffect(() => {
    if (!blockNoteSelection) {
      return;
    }

    return api.modelContext().register({
      getModelContext: () => ({
        system: contextInstructions,
      }),
    });
  }, [api, contextInstructions, blockNoteSelection]);
}
