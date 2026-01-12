"use client";

import { useState, useCallback, useRef } from "react";
import { useMessage } from "@assistant-ui/react";
import { toast } from "sonner";
import { useWorkspaceStore } from "@/lib/stores/workspace-store";
import { useQueryClient } from "@tanstack/react-query";
import { logger } from "@/lib/utils/logger";

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
  const currentWorkspaceId = useWorkspaceStore((state) => state.currentWorkspaceId);
  const queryClient = useQueryClient();

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
        const response = await fetch("/api/cards/from-message", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            content,
            workspaceId: currentWorkspaceId,
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
          { id: toastId }
        );
        throw error;
      } finally {
        setIsCreating(false);
      }
    }, debounceMs);
  }, [message, currentWorkspaceId, isCreating, debounceMs]);

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
