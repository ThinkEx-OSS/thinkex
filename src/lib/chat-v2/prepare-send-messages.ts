import type { PrepareSendMessagesRequest } from "ai";
import type { ReplySelection } from "@/lib/stores/ui-store";
import type { ChatMessage } from "./types";

export interface PrepareSendMessagesBodyOptions {
  id: string;
  workspaceId: string;
  messages: ChatMessage[];
  trigger: "submit-message" | "regenerate-message";
  messageId?: string;
  modelId: string;
  memoryEnabled: boolean;
  activeFolderId?: string | null;
  selectedCardsContext?: string;
  selectedCardIds?: string[];
  replySelections?: ReplySelection[];
  system?: string;
}

export function injectMessageMetadata({
  messages,
  replySelections = [],
  selectedCardIds = [],
}: {
  messages: ChatMessage[];
  replySelections?: ReplySelection[];
  selectedCardIds?: string[];
}): ChatMessage[] {
  if (messages.length === 0) return messages;

  const nextMessages = [...messages];
  const lastMessage = nextMessages.at(-1);
  if (!lastMessage || lastMessage.role !== "user") {
    return nextMessages;
  }

  nextMessages[nextMessages.length - 1] = {
    ...lastMessage,
    metadata: {
      ...lastMessage.metadata,
      ...(replySelections.length > 0 ? { replySelections } : {}),
      ...(selectedCardIds.length > 0 ? { selectedCards: selectedCardIds } : {}),
    },
  };

  return nextMessages;
}

export function buildPrepareSendMessagesBody(
  options: PrepareSendMessagesBodyOptions,
) {
  const messages = injectMessageMetadata({
    messages: options.messages,
    replySelections: options.replySelections,
    selectedCardIds: options.selectedCardIds,
  });

  return {
    id: options.id,
    workspaceId: options.workspaceId,
    messages,
    trigger: options.trigger,
    messageId: options.messageId,
    modelId: options.modelId,
    memoryEnabled: options.memoryEnabled,
    activeFolderId: options.activeFolderId ?? null,
    selectedCardsContext: options.selectedCardsContext ?? "",
    system: options.system ?? "",
  };
}

export function createPrepareSendMessagesRequest(
  getBody: () => Omit<PrepareSendMessagesBodyOptions, "id" | "messages" | "trigger" | "messageId"> & {
    id: string;
  },
): PrepareSendMessagesRequest<ChatMessage> {
  return async (options) => {
    const current = getBody();
    return {
      body: buildPrepareSendMessagesBody({
        ...current,
        messages: options.messages,
        trigger: options.trigger,
        messageId: options.messageId,
      }),
    };
  };
}
