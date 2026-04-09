"use client";

import { useState, useCallback, useRef } from "react";
import { useMessage, useThread } from "@assistant-ui/react";
import { toast } from "sonner";
import { useWorkspaceStore } from "@/lib/stores/workspace-store";
import { useUIStore } from "@/lib/stores/ui-store";
import { useQueryClient } from "@tanstack/react-query";
import { logger } from "@/lib/utils/logger";
import { normalizeWebSearchResult } from "@/lib/ai/web-search-shared";
import { CHAT_TOOL, toolPartMatchesCanonical } from "@/lib/ai/chat-tool-names";

interface CreateCardOptions {
  debounceMs?: number;
}

/**
 * Hook to create a card from an AI message with debouncing
 * Allows creating multiple cards from the same message
 */
export function useCreateCardFromMessage(options: CreateCardOptions = {}) {
  const { debounceMs = 300 } = options; // Reduced from 1000ms to 300ms
  const [isCreating, setIsCreating] = useState(false);
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);

  const message = useMessage();
  const thread = useThread(); // Access the full thread to find sources

  const currentWorkspaceId = useWorkspaceStore(
    (state) => state.currentWorkspaceId,
  );
  const queryClient = useQueryClient();

  const extractSourcesFromParts = (parts: unknown) => {
    if (!Array.isArray(parts)) {
      return [];
    }

    return parts.flatMap((part) => {
      if (!part || typeof part !== "object" || Array.isArray(part)) {
        return [];
      }

      const toolPart = part as {
        type?: string;
        state?: string;
        output?: unknown;
      };

      if (
        !toolPartMatchesCanonical(toolPart.type, CHAT_TOOL.WEB_SEARCH) ||
        toolPart.state !== "output-available"
      ) {
        return [];
      }

      const parsed = normalizeWebSearchResult(toolPart.output);
      if (!parsed) {
        return [];
      }

      return parsed.sources.map((source) => ({
        title: source.title,
        url: source.url,
      }));
    });
  };

  const createCard = useCallback(async () => {
    // Clear any existing debounce timer
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }

    // Set up debounced execution
    debounceTimerRef.current = setTimeout(async () => {
      // Prevent creation if already in progress
      if (isCreating) {
        toast.error("Card creation already in progress");
        return;
      }

      // Get message content
      const content = message.content
        .filter((part) => part.type === "text")
        .map((part) => (part as any).text)
        .join("\n\n");

      if (!content || !content.trim()) {
        toast.error("No content to create card from");
        return;
      }

      if (!currentWorkspaceId) {
        toast.error("No workspace selected");
        return;
      }

      setIsCreating(true);
      const toastId = toast.loading("Creating card...");

      try {
        // Get the current active folder ID
        const activeFolderId = useUIStore.getState().activeFolderId;

        // Extract sources from the thread history
        // We look backwards from the current message to find the relevant webSearch result
        let sources:
          | Array<{ title: string; url: string; favicon?: string }>
          | undefined;

        try {
          // Use any cast since standard types might differ
          const messages = (thread as any).messages || [];
          const currentIndex = messages.findIndex(
            (m: any) => m.id === message.id,
          );

          if (currentIndex !== -1) {
            const allSources: Array<{
              title: string;
              url: string;
              favicon?: string;
            }> = [];

            for (let i = currentIndex; i >= 0; i--) {
              const msg = messages[i];

              if (msg.role === "user" && i !== currentIndex) {
                break;
              }

              allSources.push(...extractSourcesFromParts((msg as any).parts));
            }

            if (allSources.length > 0) {
              sources = allSources;
              logger.debug("📝 [CREATE-CARD] Found sources in thread history", {
                count: sources.length,
              });
            }
          }
        } catch (err) {
          logger.warn(
            "📝 [CREATE-CARD] Error extracting sources from thread",
            err,
          );
        }

        const response = await fetch("/api/cards/from-message", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            content,
            workspaceId: currentWorkspaceId,
            folderId: activeFolderId ?? undefined,
            sources: sources ?? undefined,
          }),
        });

        if (!response.ok) {
          const error = await response.json();
          throw new Error(error.error || "Failed to create card");
        }

        const result = await response.json();

        // Invalidate React Query cache to refresh the UI immediately
        if (currentWorkspaceId) {
          logger.debug("🔄 [CREATE-CARD-BUTTON] Invalidating workspace cache", {
            workspaceId: currentWorkspaceId.substring(0, 8),
          });

          // Force refetch workspace events to show the new card
          queryClient.invalidateQueries({
            queryKey: ["workspace", currentWorkspaceId, "events"],
          });
        }

        toast.success("Card created successfully!", { id: toastId });

        return result;
      } catch (error) {
        console.error("Error creating card:", error);
        toast.error(
          error instanceof Error ? error.message : "Failed to create card",
          { id: toastId },
        );
        throw error;
      } finally {
        setIsCreating(false);
      }
    }, debounceMs);
  }, [message, thread, currentWorkspaceId, isCreating, debounceMs]);

  // Cleanup on unmount
  const cleanup = useCallback(() => {
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }
  }, []);

  return {
    createCard,
    isCreating,
    cleanup,
  };
}
