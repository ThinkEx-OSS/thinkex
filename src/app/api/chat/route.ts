import { gateway } from "ai";
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
import type { UIMessage } from "ai";
import { logger } from "@/lib/utils/logger";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { CHAT_TOOL } from "@/lib/ai/chat-tool-names";
import { createChatTools } from "@/lib/ai/tools";
import {
  capturePostHogServerException,
  getPostHogServerClient,
} from "@/lib/posthog-server";
import { withServerObservability } from "@/lib/with-server-observability";
import { normalizeLegacyToolMessages } from "@/lib/ai/legacy-tool-message-compat";
import type { ReplySelection } from "@/lib/stores/ui-store";
import {
  getDefaultChatModelId,
  getModelForPurpose,
  resolveGatewayModelId,
} from "@/lib/ai/models";

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
    // FIX: Parallelize headers() and req.json() to eliminate waterfall
    const [headersObj, body] = await Promise.all([headers(), req.json()]);

    // Get authenticated user ID
    const session = await auth.api.getSession({ headers: headersObj });
    userId = session?.user?.id || null;

    const { messages = [] }: { messages?: UIMessage[] } = body;
    const system = body.system || "";
    workspaceId = extractWorkspaceId(body);
    activeFolderId = body.activeFolderId;
    // AssistantChatTransport passes thread remoteId as body.id (see assistant-ui react-ai-sdk)
    const threadId = body.id ?? body.threadId ?? null;

    // Create tools using the modular factory (before convertToModelMessages so
    // toModelOutput can sanitize historical tool results for the model)
    const tools = createChatTools({
      workspaceId,
      userId,
      activeFolderId,
      threadId,
      clientTools: body.tools,
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

    // Convert messages (pass tools so toModelOutput strips event from historical tool results)
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

    // Prune older reasoning and tool calls to save context
    convertedMessages = pruneMessages({
      messages: convertedMessages,
      reasoning: "before-last-message",
      toolCalls: "before-last-5-messages",
      emptyMessages: "remove",
    });

    // Get pre-formatted selected cards context from client (no DB fetch needed)
    const selectedCardsContext = getSelectedCardsContext(body);

    const modelId = resolveGatewayModelId(
      body.modelId || getDefaultChatModelId(),
    );

    // Inject selected cards + reply selections into the last user message
    injectSelectionContext(
      convertedMessages,
      body.metadata?.custom,
      selectedCardsContext,
    );

    const posthogClient = getPostHogServerClient();
    const tracedModel = posthogClient
      ? withTracing(gateway(modelId) as any, posthogClient, {
          posthogDistinctId: userId || "anonymous",
          posthogProperties: {
            workspaceId,
            activeFolderId,
            modelId,
          },
        })
      : (gateway(modelId) as any);

    // Use AI Gateway
    const model = wrapLanguageModel({
      model: tracedModel,
      middleware:
        process.env.NODE_ENV === "development" ? devToolsMiddleware() : [],
    });

    // Stream the response
    logger.debug("🔍 [CHAT-API] Final messages before streamText:", {
      count: convertedMessages.length,
      modelId,
    });

    // Configure Google Thinking capabilities
    const googleConfig: any = {
      grounding: {
        // googleSearchRetrieval removed to force usage of explicit web_search tool
      },
      thinkingConfig: {
        includeThoughts: true,
      },
    };

    // Gemini 3 Flash: set thinkingLevel (Gemini 2.5 uses default dynamic budget)
    if (modelId.includes("gemini-3-flash")) {
      googleConfig.thinkingConfig.thinkingLevel = "minimal";
    }

    // Prepare provider options.
    // Prefer Bedrock first for Claude models, then fall back to Anthropic.
    // Non-Claude models stay on their native providers.
    const gatewayOptions: any = {
      caching: "auto",
      models: [modelId],
      ...(userId ? { user: userId } : {}),
    };

    if (modelId.startsWith("anthropic/")) {
      gatewayOptions.order = ["bedrock", "anthropic"];
      gatewayOptions.only = ["bedrock", "anthropic"];
    }

    const providerOptions: any = {
      gateway: gatewayOptions,
      google: googleConfig,
    };

    const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://thinkex.app";
    const result = streamText({
      model: model,
      temperature: 1.0,
      system,
      messages: convertedMessages,
      stopWhen: stepCountIs(25),
      prepareStep: ({ steps }) => {
        const wasEscalated = steps.some((step) =>
          step.toolCalls.some((tc) => tc.toolName === CHAT_TOOL.ESCALATE_MODEL),
        );

        if (!wasEscalated) return undefined;

        const escalationModelId = resolveGatewayModelId(
          getModelForPurpose("escalation"),
        );
        const posthogClient = getPostHogServerClient();
        const escalationTracedModel = posthogClient
          ? withTracing(gateway(escalationModelId) as any, posthogClient, {
              posthogDistinctId: userId || "anonymous",
              posthogProperties: {
                workspaceId,
                activeFolderId,
                modelId: escalationModelId,
                escalated: true,
              },
            })
          : (gateway(escalationModelId) as any);

        const escalationModel = wrapLanguageModel({
          model: escalationTracedModel,
          middleware:
            process.env.NODE_ENV === "development" ? devToolsMiddleware() : [],
        });

        return {
          model: escalationModel,
          providerOptions: {
            ...providerOptions,
            gateway: {
              ...((providerOptions as any)?.gateway ?? {}),
              models: [escalationModelId],
            },
            google: {
              ...((providerOptions as any)?.google ?? {}),
              thinkingConfig: {
                thinkingLevel: "high",
                includeThoughts: true,
              },
            },
          },
        };
      },
      tools,
      providerOptions,
      headers: {
        "http-referer": appUrl,
        "x-title": "ThinkEx",
      },
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
    // Log which provider the Gateway actually used (resolves when stream completes)
    void Promise.resolve((result as any).providerMetadata).then((meta: any) => {
      const provider =
        meta?.gateway?.routing?.resolvedProvider ??
        meta?.gateway?.routing?.finalProvider;
      if (provider) {
        logger.info("🔍 [CHAT-API] Gateway resolved provider:", provider);
      }
    });
    // assistant-ui already persists and rehydrates message history via the
    // thread history adapter. Passing originalMessages here enables a second
    // persistence flow in AI SDK that can relink the same ids into a different
    // parent chain when history loads, triggering duplicate-id repository errors.
    const response = result.toUIMessageStreamResponse();
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
