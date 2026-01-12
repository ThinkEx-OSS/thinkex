"use client";

import { AssistantCloud } from "@assistant-ui/react";
import { SafeAssistantRuntimeProvider } from "@/components/assistant-ui/SafeAssistantRuntimeProvider";
import { useChatRuntime, AssistantChatTransport } from "@assistant-ui/react-ai-sdk";
import { useMemo, useCallback } from "react";
import { SupermemoryCompositeAdapter } from "@/lib/attachments/supermemory-composite-adapter";
import { AssistantAvailableProvider } from "@/contexts/AssistantAvailabilityContext";
import { useUIStore } from "@/lib/stores/ui-store";
import { useSession } from "@/lib/auth-client";
import { toast } from "sonner";

interface WorkspaceRuntimeProviderProps {
  workspaceId: string;
  children: React.ReactNode;
}

export function WorkspaceRuntimeProvider({
  workspaceId,
  children
}: WorkspaceRuntimeProviderProps) {

  const selectedModelId = useUIStore((state) => state.selectedModelId);
  const activeFolderId = useUIStore((state) => state.activeFolderId);
  const { data: session } = useSession();

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

  // Create custom attachment adapter that handles Supabase uploads and Supermemory integration
  const attachmentAdapter = useMemo(
    () => new SupermemoryCompositeAdapter({ workspaceId }),
    [workspaceId]
  );

  // Error handler for chat runtime errors (timeouts, network issues, etc.)
  const handleChatError = useCallback((error: Error) => {
    console.error("[Chat Error]", error);
    
    // Provide user-friendly error messages based on error type
    const errorMessage = error.message?.toLowerCase() || "";
    
    if (errorMessage.includes("timeout") || errorMessage.includes("504") || errorMessage.includes("gateway")) {
      toast.error("Request timed out", {
        description: "The AI is taking too long to respond. Please try again.",
      });
    } else if (errorMessage.includes("network") || errorMessage.includes("fetch") || errorMessage.includes("failed to fetch")) {
      toast.error("Connection error", {
        description: "Unable to reach the server. Please check your connection.",
      });
    } else if (errorMessage.includes("500") || errorMessage.includes("internal server")) {
      toast.error("Server error", {
        description: "Something went wrong on our end. Please try again.",
      });
    } else if (errorMessage.includes("429") || errorMessage.includes("rate limit")) {
      toast.error("Rate limited", {
        description: "Too many requests. Please wait a moment and try again.",
      });
    } else if (errorMessage.includes("401") || errorMessage.includes("unauthorized")) {
      toast.error("Authentication error", {
        description: "Your session may have expired. Please refresh the page.",
      });
    } else {
      // Generic error fallback
      toast.error("Something went wrong", {
        description: error.message || "An unexpected error occurred. Please try again.",
      });
    }
  }, []);

  // Create runtime with Assistant Cloud integration and custom attachment adapter
  // Pass selectedTags via headers (not body) to avoid interfering with message format
  const runtime = useChatRuntime({
    cloud,
    transport: useMemo(() => {
      const transport = new AssistantChatTransport({
        api: "/api/chat",
        body: {
          workspaceId,
          modelId: selectedModelId,
          activeFolderId,
        },
        headers: {
          // Headers for static context if needed
        },
      });
      return transport;
    }, [workspaceId, selectedModelId, activeFolderId]),
    adapters: {
      attachments: attachmentAdapter,
    },
    onError: handleChatError,
  });

  return (
    <SafeAssistantRuntimeProvider runtime={runtime}>
      <AssistantAvailableProvider>
        {children}
      </AssistantAvailableProvider>
    </SafeAssistantRuntimeProvider>
  );
}

