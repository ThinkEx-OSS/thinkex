"use client";

import {
  AssistantRuntimeProvider,
  Tools,
  useRemoteThreadListRuntime,
  useAui,
} from "@assistant-ui/react";
import {
  useChatRuntime,
  AssistantChatTransport,
} from "@assistant-ui/react-ai-sdk";
import type { UIMessage } from "ai";
import { useMemo, useCallback, useRef } from "react";
import { AssistantAvailableProvider } from "@/contexts/AssistantAvailabilityContext";
import { useUIStore } from "@/lib/stores/ui-store";
import { toast } from "sonner";
import { useWorkspaceState } from "@/hooks/workspace/use-workspace-state";
import { useViewingItemIds } from "@/hooks/ui/use-viewing-item-ids";
import { formatSelectedCardsMetadata } from "@/lib/utils/format-workspace-context";
import { createThreadListAdapter } from "@/lib/chat/custom-thread-list-adapter";
import { toCreateMessageWithContext } from "@/lib/chat/toCreateMessageWithContext";
import { chatToolToolkit } from "@/components/assistant-ui/chat-toolkit";

interface WorkspaceRuntimeProviderProps {
  workspaceId: string;
  children: React.ReactNode;
}

function createWorkspaceChatRuntimeHook(
  transport: AssistantChatTransport<UIMessage>,
  onError: (error: Error) => void,
) {
  return function useWorkspaceChatRuntimeHook() {
    return useChatRuntime({
      transport,
      onError,
      toCreateMessage: toCreateMessageWithContext,
    });
  };
}

export function WorkspaceRuntimeProvider({
  workspaceId,
  children,
}: WorkspaceRuntimeProviderProps) {
  const selectedModelId = useUIStore((state) => state.selectedModelId);
  const activeFolderId = useUIStore((state) => state.activeFolderId);
  const selectedCardIdsSet = useUIStore((state) => state.selectedCardIds);
  const activePdfPageByItemId = useUIStore(
    (state) => state.activePdfPageByItemId,
  );
  const { state: workspaceState } = useWorkspaceState(workspaceId);
  const viewingItemIds = useViewingItemIds();

  /** Union of selected cards and items open in the workspace viewer (primary and/or secondary). */
  const contextCardIds = useMemo(() => {
    const ids = new Set<string>(selectedCardIdsSet);
    viewingItemIds.forEach((id) => ids.add(id));
    return ids;
  }, [selectedCardIdsSet, viewingItemIds]);

  const selectedCardsContext = useMemo(() => {
    if (contextCardIds.size === 0) {
      return "";
    }

    const contextItems = workspaceState.filter((item) =>
      contextCardIds.has(item.id),
    );

    if (contextItems.length === 0) {
      return "";
    }

    return formatSelectedCardsMetadata(
      contextItems,
      workspaceState,
      activePdfPageByItemId,
      viewingItemIds,
    );
  }, [
    workspaceState,
    contextCardIds,
    activePdfPageByItemId,
    viewingItemIds,
  ]);

  // Per AI SDK, transport `body` is `Resolvable<object>` — if it is a function, `resolve()`
  // calls it on every sendMessages (see @ai-sdk/provider-utils resolve()). That gives
  // fresh metadata without recreating AssistantChatTransport (which would change the
  // transport passed into useChatRuntime and stress useRemoteThreadListRuntime).
  // @assistant-ui/react-ai-sdk also wraps the transport in useDynamicChatTransport (Proxy
  // + ref) so the chat layer can follow transport updates; keeping one transport instance
  // is still the least surprising option for our custom runtimeHook wrapper.
  const chatApiPayloadRef = useRef({
    workspaceId,
    modelId: selectedModelId,
    activeFolderId,
    selectedCardsContext: "",
  });
  chatApiPayloadRef.current.workspaceId = workspaceId;
  chatApiPayloadRef.current.modelId = selectedModelId;
  chatApiPayloadRef.current.activeFolderId = activeFolderId;
  chatApiPayloadRef.current.selectedCardsContext = selectedCardsContext;

  const handleChatError = useCallback((error: Error) => {
    console.error("[Chat Error]", error);

    // Extract error message from various sources (error.message, responseBody, data, etc.)
    const errorMessage = error.message?.toLowerCase() || "";
    const responseBody = (error as any).responseBody?.toLowerCase() || "";
    const errorData = (error as any).data?.error?.message?.toLowerCase() || "";
    const combinedMessage =
      `${errorMessage} ${responseBody} ${errorData}`.toLowerCase();

    if (
      combinedMessage.includes("timeout") ||
      combinedMessage.includes("504") ||
      combinedMessage.includes("gateway")
    ) {
      toast.error("Request timed out", {
        description: "The AI is taking too long to respond. Please try again.",
      });
    } else if (
      combinedMessage.includes("network") ||
      combinedMessage.includes("fetch") ||
      combinedMessage.includes("failed to fetch")
    ) {
      toast.error("Connection error", {
        description:
          "Unable to reach the server. Please check your connection.",
      });
    } else if (
      combinedMessage.includes("500") ||
      combinedMessage.includes("internal server")
    ) {
      toast.error("Server error", {
        description: "Something went wrong on our end. Please try again.",
      });
    } else if (
      combinedMessage.includes("429") ||
      combinedMessage.includes("rate limit")
    ) {
      toast.error("Rate limited", {
        description: "Too many requests. Please wait a moment and try again.",
      });
    } else if (
      combinedMessage.includes("401") ||
      combinedMessage.includes("unauthorized")
    ) {
      toast.error("Authentication error", {
        description: "Your session may have expired. Please refresh the page.",
      });
    } else if (
      combinedMessage.includes("api key not valid") ||
      combinedMessage.includes("api_key_invalid") ||
      combinedMessage.includes("api key not defined") ||
      combinedMessage.includes("api key is not set") ||
      (combinedMessage.includes("api key") &&
        (combinedMessage.includes("not valid") ||
          combinedMessage.includes("invalid")))
    ) {
      toast.error("API key not valid", {
        description:
          "Please check your GOOGLE_GENERATIVE_AI_API_KEY in your environment variables.",
      });
    } else {
      // Generic error fallback
      toast.error("Something went wrong", {
        description:
          error.message || "An unexpected error occurred. Please try again.",
      });
    }
  }, []);

  const threadListAdapter = useMemo(
    () => createThreadListAdapter(workspaceId),
    [workspaceId],
  );

  const transport = useMemo(
    () =>
      new AssistantChatTransport({
        api: "/api/chat",
        body: () => ({ ...chatApiPayloadRef.current }),
      }),
    // Body snapshot comes from the ref via Resolvable function above.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- stable transport instance
    [],
  );

  const runtimeHook = useMemo(
    () => createWorkspaceChatRuntimeHook(transport, handleChatError),
    [transport, handleChatError],
  );

  const runtime = useRemoteThreadListRuntime({
    runtimeHook,
    adapter: threadListAdapter,
  });

  const aui = useAui({
    tools: Tools({ toolkit: chatToolToolkit }),
  });

  return (
    <AssistantRuntimeProvider runtime={runtime} aui={aui}>
      <AssistantAvailableProvider>{children}</AssistantAvailableProvider>
    </AssistantRuntimeProvider>
  );
}
