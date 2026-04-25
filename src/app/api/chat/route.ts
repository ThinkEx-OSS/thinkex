import {
  streamText,
  smoothStream,
  convertToModelMessages,
  pruneMessages,
  safeValidateUIMessages,
  stepCountIs,
  wrapLanguageModel,
  createUIMessageStream,
  createUIMessageStreamResponse,
  type ModelMessage,
  type ProviderMetadata,
} from "ai";
import { devToolsMiddleware } from "@ai-sdk/devtools";
import { withTracing } from "@posthog/ai";
import { and, asc, eq, inArray } from "drizzle-orm";
import { logger } from "@/lib/utils/logger";
import { after } from "next/server";
import { createChatTools } from "@/lib/ai/tools";
import {
  capturePostHogServerException,
  getPostHogServerClient,
} from "@/lib/posthog-server";
import { withServerObservability } from "@/lib/with-server-observability";
import { normalizeLegacyToolMessages } from "@/lib/ai/legacy-tool-message-compat";
import { maybeWithSupermemory } from "@/lib/ai/supermemory";
import {
  requireAuth,
  verifyThreadOwnership,
  verifyWorkspaceAccess,
} from "@/lib/api/workspace-helpers";
import type { ReplySelection } from "@/lib/stores/ui-store";
import { getDefaultChatModelId, resolveGatewayModelId } from "@/lib/ai/models";
import {
  buildGatewayProviderOptions,
  createGatewayLanguageModel,
  getGatewayAttributionHeaders,
} from "@/lib/ai/gateway-provider-options";
import { db } from "@/lib/db/client";
import { chatThreads, chatMessages } from "@/lib/db/schema";
import { CHAT_MESSAGE_FORMAT, type ChatMessage } from "@/lib/chat/types";
import {
  CHAT_DEBUG_TAG,
  summarizeMessage,
  summarizeRoster,
} from "@/lib/chat/debug";
import { generateThreadTitle } from "@/lib/chat/generate-title";
import { chatRequestBodySchema } from "./schema";

/**
 * Inject user-selected context (selected cards + reply quotes / workspace passages) into the last user message.
 * `custom` is `lastUserMessage.metadata.custom` (replySelections only).
 */
function injectSelectionContext(
  messages: ModelMessage[],
  custom?: {
    replySelections?: ReplySelection[];
  },
  selectedCardsContext?: string,
): void {
  const parts: string[] = [];

  if (selectedCardsContext && selectedCardsContext.trim()) {
    parts.push(`[Selected cards context:\n${selectedCardsContext.trim()}]`);
  }

  if (custom?.replySelections && custom.replySelections.length > 0) {
    const quoted = custom.replySelections
      .map((sel) =>
        sel.title ? `> From: ${sel.title}\n> ${sel.text}` : `> ${sel.text}`,
      )
      .join("\n\n");
    parts.push(`[Referring to:\n${quoted}]`);
  }

  if (parts.length === 0) return;

  const prefix = parts.join("\n") + "\n\n";

  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i];
    if (msg.role !== "user") continue;

    if (Array.isArray(msg.content)) {
      const textIdx = msg.content.findIndex((p) => p.type === "text");
      if (textIdx !== -1) {
        const part = msg.content[textIdx];
        if (part.type === "text") {
          msg.content[textIdx] = { ...part, text: prefix + part.text };
        }
      }
    } else if (typeof msg.content === "string") {
      messages[i] = { ...msg, content: prefix + msg.content };
    }
    break;
  }
}

/**
 * Hydrate prior turns of a thread from `chat_messages`. Only post-migration
 * rows (`format = 'ai-sdk-ui/v1'`) are returned; legacy rows stay hidden
 * until backfill. Mirrors the GET `/api/threads/[id]/messages` response so
 * the server-side conversation context matches what the client sees.
 */
async function loadThreadHistory(threadId: string): Promise<ChatMessage[]> {
  const rows = await db
    .select({ content: chatMessages.content })
    .from(chatMessages)
    .where(
      and(
        eq(chatMessages.threadId, threadId),
        eq(chatMessages.format, CHAT_MESSAGE_FORMAT),
      ),
    )
    .orderBy(asc(chatMessages.createdAt));
  return rows.map((r) => r.content) as ChatMessage[];
}

async function getThreadById(threadId: string) {
  const [thread] = await db
    .select({
      id: chatThreads.id,
      workspaceId: chatThreads.workspaceId,
      userId: chatThreads.userId,
    })
    .from(chatThreads)
    .where(eq(chatThreads.id, threadId))
    .limit(1);

  return thread;
}

async function handlePOST(req: Request) {
  let workspaceId: string | null = null;
  let userId: string | null = null;

  try {
    const rawBody = await req.json();
    const parsed = chatRequestBodySchema.safeParse(rawBody);
    if (!parsed.success) {
      logger.warn("[CHAT-API] request body failed validation", {
        issues: parsed.error.issues,
      });
      return new Response(
        JSON.stringify({
          error: "Bad request",
          message: "Invalid chat request body.",
          details: parsed.error.issues,
          code: "BAD_REQUEST",
        }),
        { status: 400, headers: { "Content-Type": "application/json" } },
      );
    }
    const body = parsed.data;

    workspaceId = body.workspaceId;
    const threadId = body.id;
    const newMessage = body.message;
    const memoryEnabled = body.memoryEnabled === true;
    const trigger = body.trigger;
    const triggeringMessageId = body.messageId;
    const activeFolderId = body.activeFolderId ?? undefined;
    const system = body.system ?? "";
    const selectedCardsContext = body.selectedCardsContext ?? "";

    userId = await requireAuth();
    await verifyWorkspaceAccess(workspaceId, userId, "editor");

    const existingThread = await getThreadById(threadId);
    if (existingThread) {
      await verifyWorkspaceAccess(existingThread.workspaceId, userId, "editor");
      verifyThreadOwnership(existingThread, userId);

      if (existingThread.workspaceId !== workspaceId) {
        return new Response(
          JSON.stringify({
            error: "Bad request",
            message: "Thread does not belong to the requested workspace.",
            code: "THREAD_WORKSPACE_MISMATCH",
          }),
          { status: 400, headers: { "Content-Type": "application/json" } },
        );
      }
    }

    logger.info("🧵 [CHAT-API] Thread ID:", { threadId });

    // [chat-debug] Inbound just shows the single new message + trigger now —
    // history is reconstructed from DB below.
    logger.info(`${CHAT_DEBUG_TAG} POST /api/chat inbound`, {
      threadId,
      trigger,
      triggeringMessageId,
      newMessage: summarizeMessage(newMessage),
    });

    // Upsert the thread row on first write. Client generates the UUID and
    // sends it as `body.id`; we insert or no-op so the client never has to
    // make a separate create call.
    const inserted = await db
      .insert(chatThreads)
      .values({ id: threadId, workspaceId, userId })
      .onConflictDoNothing({ target: chatThreads.id })
      .returning({ id: chatThreads.id });
    const isNewThread = inserted.length > 0;

    // SDK-aligned regenerate semantics: when the client fires
    // `regenerate-message`, hard-truncate persisted history at the targeted
    // message (inclusive) BEFORE loading. The new turn then lands on top of
    // a clean slate.
    //
    // Cases:
    //   - User edited a user msg: messageId is that user. Delete it +
    //     everything after; the new `body.message` is the edited user, which
    //     gets re-saved below.
    //   - User refreshed an assistant: messageId is that assistant. Delete
    //     it + everything after. `body.message` is the user that prompted
    //     the regen — it's already in DB (createdAt < target), so it survives
    //     the delete and is hydrated in the history below.
    if (trigger === "regenerate-message" && triggeringMessageId) {
      const historyBeforeTruncate = await loadThreadHistory(threadId);
      const triggeringMessage = historyBeforeTruncate.find(
        (message) => message.id === triggeringMessageId,
      );
      if (triggeringMessage?.role === "user") {
        const latestUserMessage = [...historyBeforeTruncate]
          .reverse()
          .find((message) => message.role === "user");
        if (
          latestUserMessage &&
          latestUserMessage.id !== triggeringMessageId
        ) {
          return new Response(
            JSON.stringify({
              error: "Conflict",
              message: "Only the latest user message can be edited.",
              code: "MESSAGE_EDIT_CONFLICT",
            }),
            {
              status: 409,
              headers: { "Content-Type": "application/json" },
            },
          );
        }
      }

      const rowsToTruncate = await db
        .select({
          id: chatMessages.id,
          messageId: chatMessages.messageId,
        })
        .from(chatMessages)
        .where(eq(chatMessages.threadId, threadId))
        .orderBy(asc(chatMessages.createdAt), asc(chatMessages.id));

      const truncateIndex = rowsToTruncate.findIndex(
        (row) => row.messageId === triggeringMessageId,
      );

      if (truncateIndex >= 0) {
        const deleteIds = rowsToTruncate
          .slice(truncateIndex)
          .map((row) => row.id);
        const deleted = await db
          .delete(chatMessages)
          .where(
            and(
              eq(chatMessages.threadId, threadId),
              inArray(chatMessages.id, deleteIds),
            ),
          )
          .returning({ messageId: chatMessages.messageId });
        logger.info(`${CHAT_DEBUG_TAG} regenerate: truncated history`, {
          threadId,
          triggeringMessageId,
          deletedCount: deleted.length,
        });
      } else {
        logger.info(`${CHAT_DEBUG_TAG} regenerate: no row to truncate`, {
          threadId,
          triggeringMessageId,
        });
      }
    }

    // Reconstruct the conversation from DB + the new message. The client
    // never sends the full roster — server is the source of truth.
    const historyFromDb = await loadThreadHistory(threadId);
    const newMessageInDb = historyFromDb.some((m) => m.id === newMessage.id);
    const uiMessages: ChatMessage[] = newMessageInDb
      ? historyFromDb
      : [...historyFromDb, newMessage as ChatMessage];

    logger.info(`${CHAT_DEBUG_TAG} hydrated conversation`, {
      threadId,
      historyCount: historyFromDb.length,
      appendedNew: !newMessageInDb,
      roster: summarizeRoster(uiMessages),
    });

    // Persist the new user message before streaming so it survives a
    // mid-stream error. `onConflictDoNothing` on (threadId, messageId)
    // makes this idempotent — no-op when the regenerate-refresh-assistant
    // case sends a user that's already in the DB.
    if (!newMessageInDb) {
      await db
        .insert(chatMessages)
        .values({
          threadId,
          messageId: String(newMessage.id),
          parentId: null,
          format: CHAT_MESSAGE_FORMAT,
          content: newMessage,
        })
        .onConflictDoNothing({
          target: [chatMessages.threadId, chatMessages.messageId],
        });
    }

    // Tool factory (depends on workspace context). Built before
    // convertToModelMessages so toModelOutput can sanitize historical tool
    // results for the model.
    const tools = createChatTools({
      workspaceId,
      userId,
      activeFolderId,
      threadId,
    });

    const compatibleMessages = normalizeLegacyToolMessages(uiMessages, {
      availableToolNames: Object.keys(tools),
    });

    const validation = await safeValidateUIMessages<ChatMessage>({
      messages: compatibleMessages,
      tools,
    });
    if (!validation.success) {
      throw validation.error;
    }
    const validatedMessages = validation.data;

    let convertedMessages;
    try {
      convertedMessages = await convertToModelMessages(validatedMessages, {
        tools,
      });
    } catch (convertError) {
      logger.error("❌ [CHAT-API] convertToModelMessages FAILED:", {
        error:
          convertError instanceof Error
            ? convertError.message
            : String(convertError),
        stack: convertError instanceof Error ? convertError.stack : undefined,
      });
      throw convertError;
    }

    convertedMessages = pruneMessages({
      messages: convertedMessages,
      reasoning: "before-last-message",
      toolCalls: "before-last-5-messages",
      emptyMessages: "remove",
    });

    // Reply selections live on `lastUserMessage.metadata.custom.replySelections`
    // so they survive a thread reload. Selected cards stay ephemeral.
    const replySelectionsForInjection = (() => {
      for (let i = validatedMessages.length - 1; i >= 0; i--) {
        const m = validatedMessages[i] as ChatMessage;
        if (m.role !== "user") continue;
        return m.metadata?.custom?.replySelections;
      }
      return undefined;
    })();

    injectSelectionContext(
      convertedMessages,
      { replySelections: replySelectionsForInjection },
      selectedCardsContext,
    );

    const modelId = resolveGatewayModelId(
      body.modelId || getDefaultChatModelId(),
    );

    const posthogClient = getPostHogServerClient();
    const baseGatewayModel = createGatewayLanguageModel(modelId);
    const tracedModel = posthogClient
      ? withTracing(baseGatewayModel, posthogClient, {
          posthogDistinctId: userId || "anonymous",
          posthogProperties: {
            workspaceId,
            activeFolderId,
            modelId,
            memoryEnabled,
          },
        })
      : baseGatewayModel;

    const memoryWrappedModel = maybeWithSupermemory(tracedModel, {
      userId: userId ?? "",
      threadId,
      memoryEnabled,
    });

    const model = wrapLanguageModel({
      model: memoryWrappedModel,
      middleware:
        process.env.NODE_ENV === "development" ? devToolsMiddleware() : [],
    });

    logger.debug("🔍 [CHAT-API] Final messages before streamText:", {
      count: convertedMessages.length,
      modelId,
    });

    const providerOptions = buildGatewayProviderOptions(modelId, { userId });

    // Kick off title generation in parallel for newly-created threads. We
    // stream the title when it resolves if the SSE is still open, and persist
    // it after the response so title generation never holds the stream open.
    let titlePromise: Promise<string> | null = null;
    if (isNewThread && userId && newMessage.role === "user") {
      const firstUserText = (newMessage.parts ?? [])
        .filter(
          (p): p is { type: "text"; text: string } =>
            p.type === "text" && typeof (p as { text?: string }).text === "string",
        )
        .map((p) => p.text)
        .join(" ")
        .trim();
      if (firstUserText) {
        titlePromise = generateThreadTitle({
          userId,
          firstUserMessageText: firstUserText,
        }).catch((err) => {
          logger.warn("[chat] title generation failed", err);
          return "";
        });

        after(async () => {
          const title = await titlePromise;
          if (!title) return;

          await db
            .update(chatThreads)
            .set({ title, updatedAt: new Date().toISOString() })
            .where(eq(chatThreads.id, threadId));
        });
      }
    }

    const stream = createUIMessageStream<ChatMessage>({
      originalMessages: validatedMessages,
      // CRITICAL: when `originalMessages` ends with a user message (always
      // true for us — we just appended the new one), the SDK does NOT
      // auto-assign an id to the streamed assistant turn. Without this
      // generator, every assistant arrives in `onFinish` with `id: ''`,
      // and the second insert silently no-ops via `onConflictDoNothing` on
      // (threadId, messageId), dropping every assistant after the first.
      generateId: () =>
        typeof crypto !== "undefined" && "randomUUID" in crypto
          ? crypto.randomUUID()
          : `asst-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      execute: async ({ writer: dataStream }) => {
        const result = streamText({
          model,
          temperature: 1.0,
          system,
          messages: convertedMessages,
          stopWhen: stepCountIs(25),
          tools,
          providerOptions,
          headers: getGatewayAttributionHeaders(),
          experimental_telemetry: {
            isEnabled: true,
            metadata: {
              "tcc.conversational": "true",
              "tcc.sessionId": String(threadId),
              ...(userId ? { userId } : {}),
            },
          },
          experimental_transform: smoothStream({
            chunking: "word",
            delayInMs: 15,
          }),
          onFinish: ({ usage, finishReason }) => {
            logger.info("📊 [CHAT-API] Final Token Usage:", {
              inputTokens: usage?.inputTokens,
              outputTokens: usage?.outputTokens,
              totalTokens: usage?.totalTokens,
              cachedInputTokens: usage?.cachedInputTokens,
              reasoningTokens: usage?.reasoningTokens,
              finishReason,
            });
          },
          onStepFinish: (stepResult) => {
            const r = stepResult as typeof stepResult & {
              stepType?: "initial" | "continue" | "tool-result";
            };
            if (r.usage) {
              logger.debug(
                `📊 [CHAT-API] Step Usage (${r.stepType || "unknown"}):`,
                {
                  stepType: r.stepType || "unknown",
                  inputTokens: r.usage.inputTokens,
                  outputTokens: r.usage.outputTokens,
                  totalTokens: r.usage.totalTokens,
                  cachedInputTokens: r.usage.cachedInputTokens,
                  reasoningTokens: r.usage.reasoningTokens,
                  finishReason: r.finishReason,
                },
              );
            }
          },
        });

        dataStream.merge(result.toUIMessageStream());

        // Log Gateway resolved provider when the metadata is ready.
        void Promise.resolve(result.providerMetadata).then(
          (meta: ProviderMetadata | undefined) => {
            const routing = (meta?.gateway as
              | {
                  routing?: {
                    resolvedProvider?: string;
                    finalProvider?: string;
                  };
                }
              | undefined)?.routing;
            const provider =
              routing?.resolvedProvider ?? routing?.finalProvider;
            if (provider) {
              logger.info("🔍 [CHAT-API] Gateway resolved provider:", provider);
            }
          },
        );

        if (titlePromise) {
          void titlePromise.then((title) => {
            if (title) {
              dataStream.write({ type: "data-chat-title", data: title });
            }
          });
        }
      },
      onFinish: async ({ responseMessage, isAborted }) => {
        if (isAborted || !userId) {
          logger.warn(`${CHAT_DEBUG_TAG} onFinish skipped`, {
            isAborted,
            hasUserId: !!userId,
          });
          return;
        }
        try {
          logger.info(`${CHAT_DEBUG_TAG} onFinish responseMessage`, {
            threadId,
            assistant: summarizeMessage(responseMessage),
          });

          const result = await db
            .insert(chatMessages)
            .values({
              threadId,
              messageId: String(responseMessage.id),
              parentId: String(newMessage.id),
              format: CHAT_MESSAGE_FORMAT,
              content: responseMessage,
            })
            .onConflictDoNothing({
              target: [chatMessages.threadId, chatMessages.messageId],
            })
            .returning({ messageId: chatMessages.messageId });

          if (result.length === 0) {
            logger.warn(`${CHAT_DEBUG_TAG} assistant insert skipped`, {
              threadId,
              messageId: String(responseMessage.id),
            });
          }

          const now = new Date().toISOString();
          await db
            .update(chatThreads)
            .set({
              lastMessageAt: now,
              updatedAt: now,
              headMessageId: String(responseMessage.id),
            })
            .where(eq(chatThreads.id, threadId));
        } catch (persistErr) {
          logger.error("[CHAT-API] onFinish persistence error", persistErr);
        }
      },
      onError: (error) => {
        logger.error("[CHAT-API] stream error", error);
        return error instanceof Error ? error.message : String(error);
      },
    });

    return createUIMessageStreamResponse({ stream });
  } catch (error) {
    if (error instanceof Response) {
      return error;
    }

    const errorMessage = error instanceof Error ? error.message : String(error);

    const isTimeout =
      errorMessage.includes("timeout") ||
      errorMessage.includes("TIMEOUT") ||
      errorMessage.includes("Function execution exceeded") ||
      errorMessage.includes("Execution timeout") ||
      (error &&
        typeof error === "object" &&
        "code" in error &&
        error.code === "TIMEOUT");

    if (isTimeout) {
      logger.error("⏱️ [CHAT-API] Request timed out after 30 seconds", {
        errorMessage,
        workspaceId,
      });

      capturePostHogServerException(error, {
        distinctId: userId ?? undefined,
        properties: {
          route_name: "POST /api/chat",
          workspaceId: workspaceId ?? undefined,
          chat_error_kind: "timeout",
        },
      });

      return new Response(
        JSON.stringify({
          error: "Request timeout",
          message:
            "The request took too long to process (exceeded 30 seconds). This can happen with complex queries that require multiple tool calls or extensive processing. Please try breaking your question into smaller parts or simplifying your request.",
          code: "TIMEOUT",
        }),
        { status: 504, headers: { "Content-Type": "application/json" } },
      );
    }

    logger.error("❌ [CHAT-API] Error processing request", {
      errorMessage,
      errorStack: error instanceof Error ? error.stack : undefined,
      workspaceId,
    });

    capturePostHogServerException(error, {
      distinctId: userId ?? undefined,
      properties: {
        route_name: "POST /api/chat",
        workspaceId: workspaceId ?? undefined,
        chat_error_kind: "internal",
      },
    });

    return new Response(
      JSON.stringify({
        error: "Internal server error",
        message:
          "An unexpected error occurred while processing your request. Please try again.",
        details:
          process.env.NODE_ENV === "development" ? errorMessage : undefined,
        code: "INTERNAL_ERROR",
      }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }
}

export const POST = withServerObservability(handlePOST, {
  routeName: "POST /api/chat",
});
