import type { UIMessage } from "ai";

type ChatTrigger = "submit-message" | "regenerate-message";

export async function resolveInitialParentId({
  trigger,
  regenerateMessageId,
  lastMessage,
  getStoredMessageParentId,
}: {
  trigger: ChatTrigger;
  regenerateMessageId: string | null;
  lastMessage?: UIMessage;
  getStoredMessageParentId: (messageId: string) => Promise<string | null>;
}) {
  if (trigger === "regenerate-message" && regenerateMessageId) {
    return await getStoredMessageParentId(regenerateMessageId);
  }

  return lastMessage?.id ?? null;
}

export function getNewFinishedMessages({
  finishedMessages,
  validatedMessages,
}: {
  finishedMessages: UIMessage[];
  validatedMessages: UIMessage[];
}) {
  const validatedIds = new Set(validatedMessages.map((message) => message.id));
  return finishedMessages.filter((message) => !validatedIds.has(message.id));
}
