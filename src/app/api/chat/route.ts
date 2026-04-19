import {
  streamText,
  smoothStream,
  convertToModelMessages,
  pruneMessages,
  safeValidateUIMessages,
  stepCountIs,
  wrapLanguageModel,
} from "ai";
import { devToolsMiddleware } from "@ai-sdk/devtools";
import { withTracing } from "@posthog/ai";
import { logger } from "@/lib/utils/logger";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { createChatTools } from "@/lib/ai/tools";
import {
  capturePostHogServerException,
  getPostHogServerClient,
} from "@/lib/posthog-server";
import { withServerObservability } from "@/lib/with-server-observability";
import { normalizeLegacyToolMessages } from "@/lib/ai/legacy-tool-message-compat";
import { maybeWithSupermemory } from "@/lib/ai/supermemory";
import type { ReplySelection } from "@/lib/stores/ui-store";
import { getDefaultChatModelId, resolveGatewayModelId } from "@/lib/ai/models";
import {
  buildGatewayProviderOptions,
  createGatewayLanguageModel,
  getGatewayAttributionHeaders,
} from "@/lib/ai/gateway-provider-options";
import { db } from "@/lib/db/client";
import { chatMessages } from "@/lib/db/schema";
import { and, eq } from "drizzle-orm";
import type { ThinkexUIMessage } from "@/lib/chat/types";
import { upsertMessage, verifyThread } from "@/lib/chat/server-persistence";

interface ChatRequestBody {
  id: string;
  trigger?: "submit-user-message" | "regenerate-assistant-message";
  messages?: ThinkexUIMessage[];
  messageId?: string;
  parentId?: string | null;
  system?: string;
  workspaceId: string;
  modelId?: string;
  memoryEnabled?: boolean;
  activeFolderId?: string;
  selectedCardsContext?: string;
  tools?: Record<string, unknown>;
  metadata?: {
    custom?: {
      replySelections?: ReplySelection[];
    };
  };
}

/**
 * Extract workspaceId from system context or request body
 */
function extractWorkspaceId(body: any): string | null {
  if (body.workspaceId) {
    return body.workspaceId;
  }

  const system = body.system || "";
  const workspaceIdMatch = system.match(/Workspace ID: ([a-f0-9-]{36})/);
  if (workspaceIdMatch) {
    return workspaceIdMatch[1];
  }

  return null;
}

/**
 * Selected cards context is now formatted on the client side and sent directly.
 * This eliminates the need for server-side database fetch.
 * If selectedCardsContext is provided, use it; otherwise return empty string.
 */
function getSelectedCardsContext(body: any): string {
  // Client now sends pre-formatted context string
  return body.selectedCardsContext || "";
}

/**
 * Inject user-selected context (selected cards + reply quotes / workspace passages) into the last user message.
 * `custom` is body.metadata.custom from the composer's runConfig (replySelections only).
 */
function injectSelectionContext(
  messages: any[],
  custom?: {
    replySelections?: ReplySelection[];
  },
  selectedCardsContext?: string,
): void {
  const parts: string[] = [];

  // Selected cards (pre-formatted from client)
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

  // Find the last user message and prepend the context
  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i];
    if (msg.role !== "user") continue;

    if (Array.isArray(msg.content)) {
      const textIdx = msg.content.findIndex((p: any) => p.type === "text");
      if (textIdx !== -1) {
        msg.content[textIdx] = {
          ...msg.content[textIdx],
          text: prefix + msg.content[textIdx].text,
        };
      }
    } else if (typeof msg.content === "string") {
      messages[i] = { ...msg, content: prefix + msg.content };
    }
    break;
  }
}

async function handlePOST(req: Request) {
  let workspaceId: string | null = null;
  let userId: string | null = null;
  let activeFolderId: string | undefined;

  // Check for API key early (Standardizing on Google Key for now if not using OIDC)
  // With Gateway, you can check for other keys too, or rely on Gateway's auth
  if (
    !process.env.GOOGLE_GENERATIVE_AI_API_KEY &&
    !process.env.AI_GATEWAY_API_KEY
  ) {
    // Optional: make this check more robust or permissive if using OIDC
  }

  try {
    const [headersObj, body] = await Promise.all([
      headers(),
      req.json() as Promise<ChatRequestBody>,
    ]);

    const session = await auth.api.getSession({ headers: headersObj });
    userId = session?.user?.id || null;
    if (!userId) {
      return new Response(
        JSON.stringify({ error: "Unauthorized", code: "UNAUTHORIZED" }),
        {
          status: 401,
          headers: { "Content-Type": "application/json" },
        },
      );
    }

    const { messages: rawMessages = [] } = body;
    const incomingMessages = rawMessages as ThinkexUIMessage[];
    const system = body.system || "";
    workspaceId = extractWorkspaceId(body);
    activeFolderId = body.activeFolderId;
    const threadId = body.id ?? null;
    const memoryEnabled = body.memoryEnabled === true;

    if (!threadId) {
      return new Response(
        JSON.stringify({
          error: "thread id is required",
          code: "BAD_REQUEST",
        }),
        {
          status: 400,
          headers: { "Content-Type": "application/json" },
        },
      );
    }

    const { thread } = await verifyThread({ threadId, userId });

    logger.info("🧵 [CHAT-API] Thread ID:", {
      threadId,
      isDefault: threadId === "DEFAULT_THREAD_ID",
    });

    let messages = incomingMessages;
    let assistantParentId: string | null =
      body.parentId == null ? null : String(body.parentId);

    if (body.trigger === "submit-user-message") {
      const userMessage = messages[messages.length - 1];

      if (!userMessage || userMessage.role !== "user") {
        return new Response(
          JSON.stringify({
            error: "last message must be a user message",
            code: "BAD_REQUEST",
          }),
          {
            status: 400,
            headers: { "Content-Type": "application/json" },
          },
        );
      }

      await upsertMessage({
        threadId,
        messageId: userMessage.id,
        parentId: assistantParentId,
        content: {
          role: userMessage.role,
          parts: userMessage.parts,
          metadata: userMessage.metadata ?? {},
        },
        updateHeadIfMatches: true,
      });

      assistantParentId = userMessage.id;
    } else if (body.trigger === "regenerate-assistant-message") {
      const targetMessageId = body.messageId;
      if (!targetMessageId) {
        return new Response(
          JSON.stringify({
            error: "messageId is required for regenerate",
            code: "BAD_REQUEST",
          }),
          {
            status: 400,
            headers: { "Content-Type": "application/json" },
          },
        );
      }

      const [existingAssistant] = await db
        .select({
          messageId: chatMessages.messageId,
          content: chatMessages.content,
        })
        .from(chatMessages)
        .where(
          and(
            eq(chatMessages.threadId, threadId),
            eq(chatMessages.messageId, targetMessageId),
          ),
        )
        .limit(1);

      const existingRole =
        existingAssistant?.content &&
        typeof existingAssistant.content === "object" &&
        !Array.isArray(existingAssistant.content)
          ? (existingAssistant.content as { role?: string }).role
          : undefined;

      if (!existingAssistant || existingRole !== "assistant") {
        return new Response(
          JSON.stringify({
            error: "messageId must reference an assistant message in this thread",
            code: "BAD_REQUEST",
          }),
          {
            status: 400,
            headers: { "Content-Type": "application/json" },
          },
        );
      }

      const regenerateIndex = messages.findIndex(
        (message) => message.id === targetMessageId,
      );
      const searchEnd = regenerateIndex === -1 ? messages.length : regenerateIndex;
      const lastUserIndex = messages
        .slice(0, searchEnd)
        .map((message, index) => ({ message, index }))
        .reverse()
        .find(({ message }) => message.role === "user")?.index;

      if (lastUserIndex == null) {
        return new Response(
          JSON.stringify({
            error: "could not find a user message to regenerate from",
            code: "BAD_REQUEST",
          }),
          {
            status: 400,
            headers: { "Content-Type": "application/json" },
          },
        );
      }

      messages = messages.slice(0, lastUserIndex + 1);
      assistantParentId = messages[messages.length - 1]?.id ?? null;
    }

    const tools = createChatTools({
      workspaceId,
      userId,
      activeFolderId,
      threadId,
    });

    const compatibleMessages = normalizeLegacyToolMessages(messages, {
      availableToolNames: Object.keys(tools),
    });

    const validation = await safeValidateUIMessages({
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

    const selectedCardsContext = getSelectedCardsContext(body);

    const modelId = resolveGatewayModelId(
      body.modelId || getDefaultChatModelId(),
    );

    injectSelectionContext(
      convertedMessages,
      body.metadata?.custom,
      selectedCardsContext,
    );

    const posthogClient = getPostHogServerClient();
    const baseGatewayModel = createGatewayLanguageModel(modelId);
    const tracedModel = posthogClient
      ? withTracing(baseGatewayModel as any, posthogClient, {
          posthogDistinctId: userId || "anonymous",
          posthogProperties: {
            workspaceId,
            activeFolderId,
            modelId,
            memoryEnabled,
          },
        })
      : (baseGatewayModel as any);

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

    const result = streamText({
      model: model,
      temperature: 1.0,
      system,
      messages: convertedMessages,
      stopWhen: stepCountIs(25),
      tools,
      providerOptions: providerOptions as any,
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
        const usageInfo = {
          inputTokens: usage?.inputTokens,
          outputTokens: usage?.outputTokens,
          totalTokens: usage?.totalTokens,
          cachedInputTokens: usage?.cachedInputTokens, // Standard property
          reasoningTokens: usage?.reasoningTokens,
          // Note: Extended provider-specific properties might not be available consistently via Gateway
          finishReason,
        };

        logger.info("📊 [CHAT-API] Final Token Usage:", usageInfo);
      },
      onStepFinish: (result) => {
        // stepType exists in runtime but may not be in type definitions
        const stepResult = result as typeof result & {
          stepType?: "initial" | "continue" | "tool-result";
        };
        const { stepType, usage, finishReason } = stepResult;

        if (usage) {
          const stepUsageInfo = {
            stepType: stepType || "unknown",
            inputTokens: usage?.inputTokens,
            outputTokens: usage?.outputTokens,
            totalTokens: usage?.totalTokens,
            cachedInputTokens: usage?.cachedInputTokens, // Standard property
            reasoningTokens: usage?.reasoningTokens,
            finishReason,
          };

          logger.debug(
            `📊 [CHAT-API] Step Usage (${stepType || "unknown"}):`,
            stepUsageInfo,
          );
        }
      },
    });

    logger.debug(
      "🔍 [CHAT-API] streamText returned, calling toUIMessageStreamResponse...",
    );
    void Promise.resolve((result as any).providerMetadata).then((meta: any) => {
      const provider =
        meta?.gateway?.routing?.resolvedProvider ??
        meta?.gateway?.routing?.finalProvider;
      if (provider) {
        logger.info("🔍 [CHAT-API] Gateway resolved provider:", provider);
      }
    });

    const response = result.toUIMessageStreamResponse({
      originalMessages: messages,
      messageMetadata: ({ part }) => {
        if (part.type === "start") {
          return {
            createdAt: Date.now(),
            model: modelId,
          };
        }

        if (part.type === "finish") {
          return {
            totalTokens: part.totalUsage.totalTokens,
          };
        }

        return undefined;
      },
      onFinish: async ({ responseMessage }) => {
        await upsertMessage({
          threadId: thread.id,
          messageId: responseMessage.id,
          parentId: assistantParentId,
          content: {
            role: responseMessage.role,
            parts: responseMessage.parts,
            metadata: responseMessage.metadata ?? {},
          },
          updateHeadIfMatches: true,
        });
      },
    });
    logger.debug("🔍 [CHAT-API] toUIMessageStreamResponse succeeded");
    return response;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);

    // Detect timeout errors
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
        {
          status: 504,
          headers: { "Content-Type": "application/json" },
        },
      );
    }

    // Log other errors
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
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      },
    );
  }
}

export const POST = withServerObservability(handlePOST, {
  routeName: "POST /api/chat",
});
