import {
  convertToModelMessages,
  createUIMessageStream,
  createUIMessageStreamResponse,
  pruneMessages,
  safeValidateUIMessages,
  smoothStream,
  stepCountIs,
  streamText,
  wrapLanguageModel,
  type UIMessage,
} from "ai";
import { devToolsMiddleware } from "@ai-sdk/devtools";
import { withTracing } from "@posthog/ai";
import { headers } from "next/headers";
import { and, eq } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { createChatTools } from "@/lib/ai/tools";
import { getDefaultChatModelId, resolveGatewayModelId } from "@/lib/ai/models";
import { normalizeLegacyToolMessages } from "@/lib/ai/legacy-tool-message-compat";
import { maybeWithSupermemory } from "@/lib/ai/supermemory";
import { buildGatewayProviderOptions, createGatewayLanguageModel, getGatewayAttributionHeaders } from "@/lib/ai/gateway-provider-options";
import { capturePostHogServerException, getPostHogServerClient } from "@/lib/posthog-server";
import { withServerObservability } from "@/lib/with-server-observability";
import { db } from "@/lib/db/client";
import { chatMessages, chatThreads } from "@/lib/db/schema";
import { logger } from "@/lib/utils/logger";
import type { ReplySelection } from "@/lib/stores/ui-store";
import { verifyThreadOwnership, verifyWorkspaceAccess } from "@/lib/api/workspace-helpers";
import { getNewFinishedMessages, resolveInitialParentId } from "@/lib/chat-v2/stream-persistence";

function getSelectedCardsContext(body: Record<string, unknown>): string {
  return typeof body.selectedCardsContext === "string" ? body.selectedCardsContext : "";
}

function injectSelectionContext(
  messages: Awaited<ReturnType<typeof convertToModelMessages>>,
  metadata?: { replySelections?: ReplySelection[] },
  selectedCardsContext?: string,
): void {
  const parts: string[] = [];
  if (selectedCardsContext?.trim()) {
    parts.push(`[Selected cards context:\n${selectedCardsContext.trim()}]`);
  }
  if (metadata?.replySelections?.length) {
    const quoted = metadata.replySelections
      .map((selection) => selection.title ? `> From: ${selection.title}\n> ${selection.text}` : `> ${selection.text}`)
      .join("\n\n");
    parts.push(`[Referring to:\n${quoted}]`);
  }
  if (parts.length === 0) return;
  const prefix = `${parts.join("\n")}\n\n`;

  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (message.role !== "user") continue;
    for (const part of message.content) {
      if (typeof part !== "string" && part.type === "text") {
        part.text = prefix + part.text;
        return;
      }
    }
  }
}

async function saveMessage({
  threadId,
  message,
  parentId,
}: {
  threadId: string;
  message: UIMessage;
  parentId: string | null;
}) {
  await db.insert(chatMessages).values({
    threadId,
    messageId: message.id,
    parentId,
    format: "ai-sdk/v6",
    content: message,
  }).onConflictDoUpdate({
    target: [chatMessages.threadId, chatMessages.messageId],
    set: {
      parentId,
      format: "ai-sdk/v6",
      content: message,
    },
  });
}

async function updateThreadHead(threadId: string, headMessageId: string | null) {
  await db.update(chatThreads).set({
    headMessageId,
    lastMessageAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }).where(eq(chatThreads.id, threadId));
}

async function handlePOST(req: Request) {
  let workspaceId: string | null = null;
  let userId: string | null = null;

  try {
    const [headersObj, body] = await Promise.all([headers(), req.json() as Promise<Record<string, unknown>>]);
    const session = await auth.api.getSession({ headers: headersObj });
    userId = session?.user?.id ?? null;

    const threadId = typeof body.id === "string" ? body.id : null;
    const trigger =
      body.trigger === "regenerate-message"
        ? "regenerate-message"
        : "submit-message";
    const regenerateMessageId =
      typeof body.messageId === "string" ? body.messageId : null;
    const activeFolderId = typeof body.activeFolderId === "string" ? body.activeFolderId : undefined;
    const memoryEnabled = body.memoryEnabled === true;
    const system = typeof body.system === "string" ? body.system : "";
    const selectedCardsContext = getSelectedCardsContext(body);
    const messages = Array.isArray(body.messages) ? (body.messages as UIMessage[]) : [];

    if (!threadId) {
      return new Response(JSON.stringify({ error: "Thread id is required" }), { status: 400, headers: { "Content-Type": "application/json" } });
    }

    const [thread] = await db.select().from(chatThreads).where(eq(chatThreads.id, threadId)).limit(1);
    if (!thread) {
      return new Response(JSON.stringify({ error: "Thread not found" }), { status: 404, headers: { "Content-Type": "application/json" } });
    }
    if (!userId) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { "Content-Type": "application/json" } });
    }
    await verifyWorkspaceAccess(thread.workspaceId, userId);
    verifyThreadOwnership(thread, userId);
    workspaceId = thread.workspaceId;

    const tools = createChatTools({
      workspaceId,
      userId,
      activeFolderId,
      threadId,
    });

    const compatibleMessages = normalizeLegacyToolMessages(messages, {
      availableToolNames: Object.keys(tools),
    });
    const validation = await safeValidateUIMessages({ messages: compatibleMessages, tools });
    if (!validation.success) {
      throw validation.error;
    }

    const validatedMessages = validation.data;
    const lastMessage = validatedMessages.at(-1);
    const previousMessageId = validatedMessages.at(-2)?.id ?? null;
    if (trigger === "submit-message" && lastMessage?.role === "user") {
      await saveMessage({ threadId, message: lastMessage, parentId: previousMessageId });
      await updateThreadHead(threadId, lastMessage.id);
    }

    const initialParentId = await resolveInitialParentId({
      trigger,
      regenerateMessageId,
      lastMessage,
      getStoredMessageParentId: async (messageId) => {
        const [siblingRow] = await db
          .select({ parentId: chatMessages.parentId })
          .from(chatMessages)
          .where(and(eq(chatMessages.threadId, threadId), eq(chatMessages.messageId, messageId)))
          .limit(1);
        return siblingRow?.parentId ?? null;
      },
    });

    let convertedMessages = await convertToModelMessages(validatedMessages, { tools });
    convertedMessages = pruneMessages({
      messages: convertedMessages,
      reasoning: "before-last-message",
      toolCalls: "before-last-5-messages",
      emptyMessages: "remove",
    });
    const lastMetadata =
      lastMessage?.metadata &&
      typeof lastMessage.metadata === "object" &&
      "replySelections" in lastMessage.metadata
        ? (lastMessage.metadata as { replySelections?: ReplySelection[] })
        : undefined;
    injectSelectionContext(convertedMessages, lastMetadata, selectedCardsContext);

    const modelId = resolveGatewayModelId(typeof body.modelId === "string" ? body.modelId : getDefaultChatModelId());
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
      middleware: process.env.NODE_ENV === "development" ? devToolsMiddleware() : [],
    });

    const providerOptions = buildGatewayProviderOptions(modelId, { userId });

    const result = streamText({
      model,
      temperature: 1,
      system,
      messages: convertedMessages,
      stopWhen: stepCountIs(25),
      tools,
      providerOptions: providerOptions as Parameters<typeof streamText>[0]["providerOptions"],
      headers: getGatewayAttributionHeaders(),
      experimental_telemetry: {
        isEnabled: true,
        metadata: {
          "tcc.conversational": "true",
          ...(threadId ? { "tcc.sessionId": String(threadId) } : {}),
          ...(userId ? { userId } : {}),
        },
      },
      experimental_transform: smoothStream({ chunking: "word", delayInMs: 15 }),
      onFinish: ({ usage, finishReason }) => {
        logger.info("📊 [CHAT-V2] Final Token Usage:", {
          inputTokens: usage?.inputTokens,
          outputTokens: usage?.outputTokens,
          totalTokens: usage?.totalTokens,
          cachedInputTokens: usage?.cachedInputTokens,
          reasoningTokens: usage?.reasoningTokens,
          finishReason,
        });
      },
    });

    const stream = createUIMessageStream<UIMessage>({
      originalMessages: validatedMessages,
      execute: ({ writer }) => {
        // TODO: emit data-chat-title here if chat-v2 gets a shared title-generation utility.
        writer.merge(result.toUIMessageStream({
          sendReasoning: true,
          sendSources: true,
        }));
      },
      onFinish: async ({ messages: finishedMessages }) => {
        let parentId = initialParentId;
        const newMessages = getNewFinishedMessages({
          finishedMessages,
          validatedMessages,
        });
        for (const message of newMessages) {
          await saveMessage({ threadId, message, parentId });
          parentId = message.id;
        }
        await updateThreadHead(threadId, parentId);
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
      (error && typeof error === "object" && "code" in error && error.code === "TIMEOUT");

    if (isTimeout) {
      capturePostHogServerException(error, {
        distinctId: userId ?? undefined,
        properties: {
          route_name: "POST /api/chat-v2",
          workspaceId: workspaceId ?? undefined,
          chat_error_kind: "timeout",
        },
      });
      return new Response(JSON.stringify({
        error: "Request timeout",
        message: "The request took too long to process.",
        code: "TIMEOUT",
      }), { status: 504, headers: { "Content-Type": "application/json" } });
    }

    capturePostHogServerException(error, {
      distinctId: userId ?? undefined,
      properties: {
        route_name: "POST /api/chat-v2",
        workspaceId: workspaceId ?? undefined,
        chat_error_kind: "internal",
      },
    });

    return new Response(JSON.stringify({
      error: "Internal server error",
      message: "An unexpected error occurred while processing your request.",
      details: process.env.NODE_ENV === "development" ? errorMessage : undefined,
      code: "INTERNAL_ERROR",
    }), { status: 500, headers: { "Content-Type": "application/json" } });
  }
}

export const POST = withServerObservability(handlePOST, { routeName: "POST /api/chat-v2" });
