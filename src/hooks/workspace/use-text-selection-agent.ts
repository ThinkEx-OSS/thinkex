import { useCallback } from "react";
import { toast } from "sonner";
import type { WorkspaceOperations } from "@/hooks/workspace/use-workspace-operations";
import { extractMarkdownFromSelection, extractMarkdownFromHighlights, extractMarkdownFromRange, combineMarkdownSelections } from "@/lib/utils/markdown-extractor";

interface TextSelectionHandlers {
  handleCreateInstantNote: (text: string, range?: Range) => Promise<void>;
  handleCreateCardFromSelections: (selections: Array<{ text: string; id: string; range?: Range }>) => Promise<void>;
}

export function useTextSelectionAgent(operations: WorkspaceOperations): TextSelectionHandlers {
  
  const callLangGraphAgent = useCallback(async (prompt: string): Promise<{ fullResponse: string; lastMessage: string } | undefined> => {
    try {
      const requestBody = { text: prompt };
      
      // Call our API route which proxies to LangGraph
      const response = await fetch('/api/process-selection', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody),
      });
      
      if (!response.ok) {
        await response.text(); // Consume response
        return;
      }

      // Read the stream to completion
      const reader = response.body?.getReader();
      if (!reader) {
        return;
      }
      
      let fullResponse = '';
      
      while (true) {
        const { done, value } = await reader.read();
        if (value) {
          const text = new TextDecoder().decode(value);
          fullResponse += text;
        }
        if (done) {
          break;
        }
      }
      
      // Parse the agent's response and extract any structured data
      const lines = fullResponse.split('\n');
      let lastMessage = '';
      
      for (const line of lines) {
        if (line.startsWith('data: ')) {
          try {
            const data = JSON.parse(line.substring(6));
            
            if (data.messages && data.messages.length > 0) {
              // Look for AI/assistant messages, not human messages
              for (let i = data.messages.length - 1; i >= 0; i--) {
                const msg = data.messages[i];
                
                // Look for AI messages (type: 'ai' or role: 'assistant')
                if ((msg.type === 'ai' || msg.role === 'assistant') && msg.content && typeof msg.content === 'string') {
                  if (msg.content.length > lastMessage.length) {
                    lastMessage = msg.content;
                  }
                }
              }
            }
          } catch {
            // Ignore parse errors
          }
        }
      }
      
      // Parse the agent's decision from the response
      // The agent should respond with structured instructions
      return { fullResponse, lastMessage };
    } catch {
      // Silently ignore errors
    }
  }, []);

  const handleCreateInstantNote = useCallback(async (text: string, range?: Range) => {
    try {
      // Extract markdown content from the provided range or current selection
      let markdownContent: string | null = null;
      
      if (range) {
        markdownContent = extractMarkdownFromRange(range);
      } else {
        markdownContent = extractMarkdownFromSelection();
      }
      
      // Use markdown content if available, otherwise fallback to plain text
      const content = markdownContent || text;
      
      // Create a simple note card with the content
      await operations.createItem("note", "New Highlight", { field1: content });
      
      toast.success("Highlight saved to note");
    } catch (error) {
      console.error("Error creating instant note:", error);
      toast.error("Failed to save highlight");
    }
  }, [operations]);

  const handleCreateCardFromSelections = useCallback(async (selections: Array<{ text: string; id: string; range?: Range }>) => {
    try {
      // Extract markdown content from all selections
      const markdownContents = extractMarkdownFromHighlights(selections);
      
      // Combine all markdown content with proper formatting
      const combinedContent = combineMarkdownSelections(markdownContents);
      
      // Create a simple note card with all the content
      await operations.createItem("note", "New Highlight", { field1: combinedContent });
      
      const count = selections.length;
      toast.success(`Saved ${count} highlight${count === 1 ? '' : 's'} to note`);
    } catch (error) {
      console.error("Error creating card from selections:", error);
      toast.error("Failed to save highlights");
    }
  }, [operations]);

  return {
    handleCreateInstantNote,
    handleCreateCardFromSelections,
  };
}