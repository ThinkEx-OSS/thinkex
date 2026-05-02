import { DefaultChatTransport, type UIMessage } from "ai";

export interface ChatTransportContext {
  workspaceId: string;
  /** Resolved gateway model id for the active chat. */
  modelId: string;
  /** Supermemory toggle (server double-checks env + auth). */
  memoryEnabled: boolean;
  /** Active folder scope — forwarded to tool context. */
  activeFolderId?: string | null;
  /**
   * Pre-formatted selected-cards context string. Server injects into the last user
   * message but never persists it. Kept out of `UIMessage.metadata` on purpose.
   */
  selectedCardsContext: string;
  /** Workspace-level system prompt forwarded as `body.system`. */
  system: string;
}

/**
 * Build a `DefaultChatTransport` bound to a workspace/thread.
 *
 * Only the *new* message is sent on the wire (mirrors the Vercel
 * `ai-chatbot` reference). The server hydrates prior turns from
 * `chat_messages`, so payload size is O(1) per request and the client can
 * never fall out of sync with persisted history.
 *
 * The body resolver is called on every `sendMessages`, so consumers pass a
 * `getContext()` function that reads fresh state (model id, card context,
 * …) from zustand without recreating the transport on every selection
 * change.
 */
export function createChatTransport(
  getContext: () => ChatTransportContext,
): DefaultChatTransport<UIMessage> {
  return new DefaultChatTransport({
    api: "/api/chat",
    prepareSendMessagesRequest: ({ id, messages, trigger, messageId, body }) => {
      // `id` is the chat id the SDK manages — set when the runtime is
      // constructed with `new Chat({ id: threadId })`. Forwarded as `body.id`
      // so the route can upsert `chat_threads.id` without a separate parameter.
      //
      // `trigger` + `messageId` are forwarded as-is so the server can honor
      // `regenerate-message`: it truncates persisted history at the
      // targeted msg before reading it back as the conversation context.
      //
      // We send only `message` (not `messages`). The server reconstructs
      // the conversation from the DB.
      const ctx = getContext();
      const lastMessage = messages.at(-1);
      return {
        body: {
          ...body,
          id,
          message: lastMessage,
          workspaceId: ctx.workspaceId,
          modelId: ctx.modelId,
          memoryEnabled: ctx.memoryEnabled,
          activeFolderId: ctx.activeFolderId,
          selectedCardsContext: ctx.selectedCardsContext,
          system: ctx.system,
          trigger,
          messageId,
        },
      };
    },
  });
}
