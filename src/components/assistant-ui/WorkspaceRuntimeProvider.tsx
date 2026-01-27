"use client";

import { AssistantCloud, AssistantRuntimeProvider } from "@assistant-ui/react";
import { useChatRuntime, AssistantChatTransport } from "@assistant-ui/react-ai-sdk";
import { useMemo, useCallback } from "react";
import { AssistantAvailableProvider } from "@/contexts/AssistantAvailabilityContext";
import { useUIStore } from "@/lib/stores/ui-store";
import { useSession } from "@/lib/auth-client";
import { toast } from "sonner";
import { useWorkspaceState } from "@/hooks/workspace/use-workspace-state";
import { formatSelectedCardsContext } from "@/lib/utils/format-workspace-context";

interface WorkspaceRuntimeProviderProps {
  workspaceId: string;
  children: React.ReactNode;
}

import { useShallow } from "zustand/react/shallow";

export function WorkspaceRuntimeProvider({
  workspaceId,
  children
}: WorkspaceRuntimeProviderProps) {

  const selectedModelId = useUIStore((state) => state.selectedModelId);
  const activeFolderId = useUIStore((state) => state.activeFolderId);
  /* 
    FIX for "Maximum update depth exceeded":
    We select the Set directly because Array.from() inside the selector creates a new reference on every render,
    triggering an infinite update loop. The Set reference is stable until changed.
  */
  const selectedCardIdsSet = useUIStore((state) => state.selectedCardIds);
  const replySelections = useUIStore(useShallow((state) => state.replySelections));
  const { data: session } = useSession();

  // Get workspace state to format selected cards context on client
  const { state: workspaceState } = useWorkspaceState(workspaceId);

  // Format selected cards context on client side (eliminates server-side DB fetch)
  const selectedCardsContext = useMemo(() => {
    if (!workspaceState?.items || selectedCardIdsSet.size === 0) {
      return "";
    }

    const selectedItems = workspaceState.items.filter((item) =>
      selectedCardIdsSet.has(item.id)
    );

    if (selectedItems.length === 0) {
      return "";
    }

    return formatSelectedCardsContext(selectedItems, workspaceState.items);
  }, [workspaceState?.items, selectedCardIdsSet]);

  // Create AssistantCloud instance - use anonymous mode for anonymous users
  const cloud = useMemo(() => {
    // If user is anonymous, use Assistant UI's built-in anonymous mode
    if (session?.user?.isAnonymous) {
      return new AssistantCloud({
        baseUrl: process.env.NEXT_PUBLIC_ASSISTANT_BASE_URL!,
        anonymous: true, // Browser-session based user ID
      });
    }

    // For authenticated users, use token-based authentication
    return new AssistantCloud({
      baseUrl: process.env.NEXT_PUBLIC_ASSISTANT_BASE_URL!,
      authToken: async () => {
        const response = await fetch("/api/assistant-ui-token", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ workspaceId }),
        });

        if (!response.ok) {
          throw new Error("Failed to get auth token");
        }

        const { token } = await response.json();
        return token;
      },
    });
  }, [workspaceId, session?.user?.isAnonymous]);

  // Error handler for chat runtime errors (timeouts, network issues, etc.)
  const handleChatError = useCallback((error: Error) => {
    console.error("[Chat Error]", error);

    // Extract error message from various sources (error.message, responseBody, data, etc.)
    const errorMessage = error.message?.toLowerCase() || "";
    const responseBody = (error as any).responseBody?.toLowerCase() || "";
    const errorData = (error as any).data?.error?.message?.toLowerCase() || "";
    const combinedMessage = `${errorMessage} ${responseBody} ${errorData}`.toLowerCase();

    if (combinedMessage.includes("timeout") || combinedMessage.includes("504") || combinedMessage.includes("gateway")) {
      toast.error("Request timed out", {
        description: "The AI is taking too long to respond. Please try again.",
      });
    } else if (combinedMessage.includes("network") || combinedMessage.includes("fetch") || combinedMessage.includes("failed to fetch")) {
      toast.error("Connection error", {
        description: "Unable to reach the server. Please check your connection.",
      });
    } else if (combinedMessage.includes("500") || combinedMessage.includes("internal server")) {
      toast.error("Server error", {
        description: "Something went wrong on our end. Please try again.",
      });
    } else if (combinedMessage.includes("429") || combinedMessage.includes("rate limit")) {
      toast.error("Rate limited", {
        description: "Too many requests. Please wait a moment and try again.",
      });
    } else if (combinedMessage.includes("401") || combinedMessage.includes("unauthorized")) {
      toast.error("Authentication error", {
        description: "Your session may have expired. Please refresh the page.",
      });
    } else if (combinedMessage.includes("api key not valid") || combinedMessage.includes("api_key_invalid") || combinedMessage.includes("api key not defined") || combinedMessage.includes("api key is not set") || (combinedMessage.includes("api key") && (combinedMessage.includes("not valid") || combinedMessage.includes("invalid")))) {
      toast.error("API key not valid", {
        description: "Please check your GOOGLE_GENERATIVE_AI_API_KEY in your environment variables.",
      });
    } else {
      // Generic error fallback
      toast.error("Something went wrong", {
        description: error.message || "An unexpected error occurred. Please try again.",
      });
    }
  }, []);

  // Create runtime with Assistant Cloud integration
  const runtime = useChatRuntime({
    cloud,
    transport: useMemo(() => {
      const transport = new AssistantChatTransport({
        api: "/api/chat",
        body: {
          workspaceId,
          modelId: selectedModelId,
          activeFolderId,
          selectedCardsContext, // Pre-formatted context (client-side) instead of IDs
          replySelections,
        },
        headers: {
          // Headers for static context if needed
        },
      });
      return transport;
    }, [workspaceId, selectedModelId, activeFolderId, selectedCardsContext, replySelections]),
    onError: handleChatError,
  });

  return (
    <AssistantRuntimeProvider runtime={runtime}>
      <AssistantAvailableProvider>
        {children}
      </AssistantAvailableProvider>
    </AssistantRuntimeProvider>
  );
}
