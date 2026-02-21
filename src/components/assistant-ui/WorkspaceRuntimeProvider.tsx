"use client";

import {
  AssistantRuntimeProvider,
  unstable_useRemoteThreadListRuntime as useRemoteThreadListRuntime,
} from "@assistant-ui/react";
import { useChatRuntime, AssistantChatTransport } from "@assistant-ui/react-ai-sdk";
import { useMemo, useCallback } from "react";
import { AssistantAvailableProvider } from "@/contexts/AssistantAvailabilityContext";
import { useUIStore } from "@/lib/stores/ui-store";
import { toast } from "sonner";
import { useWorkspaceState } from "@/hooks/workspace/use-workspace-state";
import { formatSelectedCardsContext } from "@/lib/utils/format-workspace-context";
import { createThreadListAdapter } from "@/lib/chat/custom-thread-list-adapter";
import { toCreateMessageWithContext } from "@/lib/chat/toCreateMessageWithContext";

interface WorkspaceRuntimeProviderProps {
  workspaceId: string;
  children: React.ReactNode;
}

import { ImageSearchToolUI } from "@/components/assistant-ui/ImageSearchToolUI";
import { AddImageToolUI } from "@/components/assistant-ui/AddImageToolUI";

export function WorkspaceRuntimeProvider({
  workspaceId,
  children
}: WorkspaceRuntimeProviderProps) {
  const selectedModelId = useUIStore((state) => state.selectedModelId);
  const activeFolderId = useUIStore((state) => state.activeFolderId);
  const selectedCardIdsSet = useUIStore((state) => state.selectedCardIds);
  const { state: workspaceState } = useWorkspaceState(workspaceId);

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

  const threadListAdapter = useMemo(
    () => createThreadListAdapter(workspaceId),
    [workspaceId]
  );

  const transport = useMemo(
    () =>
      new AssistantChatTransport({
        api: "/api/chat",
        body: {
          workspaceId,
          modelId: selectedModelId,
          activeFolderId,
          selectedCardsContext,
        },
      }),
    [workspaceId, selectedModelId, activeFolderId, selectedCardsContext]
  );

  const runtime = useRemoteThreadListRuntime({
    runtimeHook: () =>
      useChatRuntime({
        transport,
        onError: handleChatError,
        toCreateMessage: toCreateMessageWithContext,
      }),
    adapter: threadListAdapter,
  });

  return (
    <AssistantRuntimeProvider runtime={runtime}>
      <AssistantAvailableProvider>
        {children}
        <ImageSearchToolUI />
        <AddImageToolUI />
      </AssistantAvailableProvider>
    </AssistantRuntimeProvider>
  );
}
