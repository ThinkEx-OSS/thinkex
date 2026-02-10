import { gateway } from "ai";
import { streamText, convertToModelMessages, stepCountIs, wrapLanguageModel, tool } from "ai";
import { devToolsMiddleware } from "@ai-sdk/devtools";
import { PostHog } from "posthog-node";
import { withTracing } from "@posthog/ai";
import type { UIMessage } from "ai";
import { logger } from "@/lib/utils/logger";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { createChatTools } from "@/lib/ai/tools";
import type { GatewayProviderOptions } from "@ai-sdk/gateway";
import { formatSelectedActionsContext } from "@/lib/utils/format-workspace-context";

// Regex patterns as constants (compiled once, reused for all requests)
const URL_CONTEXT_REGEX = /\[URL_CONTEXT:(.+?)\]/g;
const DIRECT_URL_REGEX = /https?:\/\/[^\s]+/g;

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
 * Process messages in a single pass: extract URL context URLs and clean markers
 * File attachments are handled natively as file parts via the SupabaseAttachmentAdapter.
 */
function processMessages(messages: any[]): {
  urlContextUrls: string[];
  cleanedMessages: any[];
} {
  const urlContextUrlsSet = new Set<string>();

  const cleanedMessages = messages.map((message) => {
    if (message.content && Array.isArray(message.content)) {
      const updatedContent = message.content.map((part: any) => {
        if (part.type === "text" && typeof part.text === "string") {
          const text = part.text;

          // Extract URL context URLs (use Set for O(1) lookups)
          const urlContextRegexLocal = new RegExp(URL_CONTEXT_REGEX.source, URL_CONTEXT_REGEX.flags);
          const urlContextMatches = text.matchAll(urlContextRegexLocal);
          for (const urlMatch of urlContextMatches) {
            const url = urlMatch[1];
            if (url) urlContextUrlsSet.add(url);
          }

          // Extract direct URLs
          const directUrlRegexLocal = new RegExp(DIRECT_URL_REGEX.source, DIRECT_URL_REGEX.flags);
          const directUrlMatches = text.matchAll(directUrlRegexLocal);
          for (const directMatch of directUrlMatches) {
            const url = directMatch[0];
            if (url) urlContextUrlsSet.add(url);
          }

          // Clean URL_CONTEXT markers (create new instance to avoid global regex state issues)
          const urlContextReplaceRegex = new RegExp(URL_CONTEXT_REGEX.source, URL_CONTEXT_REGEX.flags);
          const updatedText = text.replace(urlContextReplaceRegex, (_match: string, url: string) => {
            return url;
          });

          return { ...part, text: updatedText };
        }
        return part;
      });
      return { ...message, content: updatedContent } as typeof message;
    }
    return message;
  });

  return {
    urlContextUrls: Array.from(urlContextUrlsSet),
    cleanedMessages,
  };
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

// Regex to detect createFrom auto-generated prompts
const CREATE_FROM_REGEX = /^Update the preexisting contents of this workspace to be about (.+)\. Only add one quality YouTube video\.$/;

/**
 * Detect if the first user message is a createFrom auto-generated prompt
 * and return additional system instructions for better workspace curation
 */
function getCreateFromSystemPrompt(messages: any[]): string | null {
  // Find the first user message
  const firstUserMessage = messages.find((m) => m.role === "user");
  if (!firstUserMessage) return null;

  // Extract text content from the message
  let textContent = "";
  if (typeof firstUserMessage.content === "string") {
    textContent = firstUserMessage.content;
  } else if (Array.isArray(firstUserMessage.content)) {
    const textPart = firstUserMessage.content.find((p: any) => p.type === "text");
    if (textPart?.text) textContent = textPart.text;
  }

  // Check if it matches the createFrom pattern
  const match = textContent.match(CREATE_FROM_REGEX);
  if (!match) return null;

  const topic = match[1];

  return `
CREATE-FROM WORKSPACE INITIALIZATION MODE:
This is an automatic workspace initialization request. The user wants to transform this workspace into a curated learning/research space
ace about: "${topic}"

CRITICAL INSTRUCTIONS FOR WORKSPACE CURATION:
1. **For each of the existing workspace items** update the title and content to be about the topic:
   - Use \`updateNote\` tool for notes
   - Use \`updateFlashcards\` tool for flashcard sets
   - Use \`updateQuiz\` tool for quizzes
2. **Be thorough but focused** - Provide a solid foundation for understanding the topic without being overwhelming.
3. **Do NOT ask the user questions** - This is an automated initialization, proceed directly with updating the workspace.

QUALITY GUIDELINES FOR CONTENT:
- For notes: add a comprehensive summary of the topic
- For flashcards: create exactly 5 meaningful question/answer pairs covering key concepts
- For quizzes: create challenging but fair questions that test understanding

QUALITY GUIDELINES FOR THE YOUTUBE VIDEO:
- Search with specific, relevant terms for the topic
- Prefer videos that are educational/explanatory
- Look for high view counts and reputable channels as quality signals
`;
}

/**
 * Inject user-selected context (reply quotes + BlockNote selection) into the last user message.
 * Reads from runConfig metadata sent via the composer's setRunConfig().
 * This keeps context in the user message (not system prompt) without showing in the UI.
 */
function injectSelectionContext(
  messages: any[],
  metadata?: { replySelections?: Array<{ text: string }>; blockNoteSelection?: { cardName: string; text: string } }
): void {
  if (!metadata) return;

  const parts: string[] = [];

  // Reply selections (quoted text from assistant messages)
  if (metadata.replySelections && metadata.replySelections.length > 0) {
    const quoted = metadata.replySelections
      .map((sel) => `> ${sel.text}`)
      .join("\n");
    parts.push(`[Referring to:\n${quoted}]`);
  }

  // BlockNote selection (text selected from a card in the editor)
  if (metadata.blockNoteSelection?.text) {
    parts.push(`[Selected text from "${metadata.blockNoteSelection.cardName}":\n${metadata.blockNoteSelection.text}]`);
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

/**
 * Build the enhanced system prompt with guidelines and detection hints
 * Uses array join for better performance than string concatenation
 */
function buildSystemPrompt(baseSystem: string, urlContextUrls: string[]): string {
  const parts: string[] = [baseSystem];

  // Add URL detection hint if URLs are present
  if (urlContextUrls.length > 0) {
    parts.push(`\n\nURL DETECTION: The user's message contains ${urlContextUrls.length} URL(s): ${urlContextUrls.join(', ')}. You should call the processUrls tool with these URLs to analyze them.`);
  }

  return parts.join('');
}

export async function POST(req: Request) {
  let workspaceId: string | null = null;
  let activeFolderId: string | undefined;

  // Check for API key early (Standardizing on Google Key for now if not using OIDC)
  // With Gateway, you can check for other keys too, or rely on Gateway's auth
  if (!process.env.GOOGLE_GENERATIVE_AI_API_KEY && !process.env.AI_GATEWAY_API_KEY) {
    // Optional: make this check more robust or permissive if using OIDC
  }

  try {
    // FIX: Parallelize headers() and req.json() to eliminate waterfall
    const [headersObj, body] = await Promise.all([
      headers(),
      req.json()
    ]);

    // Get authenticated user ID
    const session = await auth.api.getSession({ headers: headersObj });
    const userId = session?.user?.id || null;

    const { messages = [] }: { messages?: UIMessage[] } = body;
    const system = body.system || "";
    workspaceId = extractWorkspaceId(body);
    activeFolderId = body.activeFolderId;

    // Convert messages
    let convertedMessages;
    try {
      convertedMessages = await convertToModelMessages(messages);
    } catch (convertError) {
      logger.error("❌ [CHAT-API] convertToModelMessages FAILED:", {
        error: convertError instanceof Error ? convertError.message : String(convertError),
        stack: convertError instanceof Error ? convertError.stack : undefined,
      });
      throw convertError;
    }

    // Process messages in single pass: extract URLs and clean markers
    const { urlContextUrls, cleanedMessages } = processMessages(convertedMessages);

    // Get pre-formatted selected cards context from client (no DB fetch needed)
    const selectedCardsContext = getSelectedCardsContext(body);
    const selectedActions = body.metadata?.custom?.selectedActions || body.selectedActions || [];

    // Get model ID and ensure it has the correct prefix for Gateway
    let modelId = body.modelId || "gemini-2.5-flash";

    // Auto-prefix with google/ if it looks like a gemini model and lacks prefix
    // This allows existing client code to work without changes
    if (modelId.startsWith("gemini-") && !modelId.startsWith("google/")) {
      modelId = `google/${modelId}`;
    }

    // Build system prompt with all context parts (using array join for efficiency)
    // Note: The base `system` from client already includes AI assistant identity from formatWorkspaceContext
    const systemPromptParts: string[] = [
      buildSystemPrompt(system, urlContextUrls),
      `\n\nMODEL IDENTITY: You are currently running as "${modelId}". If the user asks what model you are, tell them this model ID.`,
    ];

    // Inject createFrom workspace initialization prompt if detected
    const createFromPrompt = getCreateFromSystemPrompt(cleanedMessages);
    if (createFromPrompt) {
      systemPromptParts.push(`\n\n${createFromPrompt}`);
    }

    // Inject selected cards context if available
    if (selectedCardsContext) {
      systemPromptParts.push(`\n\n${selectedCardsContext}`);
    }

    // Inject selected actions context if available
    if (selectedActions.length > 0) {
      const selectedActionsContext = formatSelectedActionsContext(selectedActions);
      if (selectedActionsContext) {
        systemPromptParts.push(`\n\n${selectedActionsContext}`);
      }
    }

    const finalSystemPrompt = systemPromptParts.join('');

    // Inject reply + BlockNote selection context into the last user message (sent via runConfig metadata)
    injectSelectionContext(cleanedMessages, body.metadata?.custom);

    // Initialize PostHog client
    const posthogClient = new PostHog(process.env.POSTHOG_API_KEY || "disabled", {
      host: process.env.POSTHOG_HOST || "https://us.i.posthog.com",
      disabled: !process.env.POSTHOG_API_KEY,
    });

    // Use AI Gateway
    const model = wrapLanguageModel({
      model: withTracing(gateway(modelId) as any, posthogClient, {
        posthogDistinctId: userId || "anonymous",
        posthogProperties: {
          workspaceId,
          activeFolderId,
          modelId,
        },
      }),
      middleware: process.env.NODE_ENV === 'development' ? devToolsMiddleware() : [],
    });

    // Create tools using the modular factory
    const tools = createChatTools({
      workspaceId,
      userId,
      activeFolderId,
      clientTools: body.tools,
      enableDeepResearch: selectedActions.includes("deep-research"),
    });

    // Stream the response
    logger.debug("🔍 [CHAT-API] Final cleanedMessages before streamText:", {
      count: cleanedMessages.length,
      modelId
    });

    // Configure Google Thinking capabilities
    const googleConfig: any = {
      grounding: {
        // googleSearchRetrieval removed to force usage of explicit webSearch tool
      },
      thinkingConfig: {
        includeThoughts: false,
      },
    };

    // Explicitly disable thinking tokens for Gemini 2.5
    if (modelId.includes("gemini-2.5")) {
      googleConfig.thinkingConfig.thinkingBudget = 0;
    }

    // Prepare provider options
    // The Gateway passes these through to the specific provider
    let providerOptions: any = {
      gateway: {
        // Example: route to google if you want to enforce it, though prefix handles it
        // order: ['google'], 
      } satisfies GatewayProviderOptions,
      google: googleConfig,
    };

    const result = streamText({
      model: model,
      temperature: 1.0,
      system: finalSystemPrompt,
      messages: cleanedMessages,
      stopWhen: stepCountIs(25),
      tools,
      providerOptions,
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
        const stepResult = result as typeof result & { stepType?: "initial" | "continue" | "tool-result" };
        const { stepType, usage, finishReason } = stepResult;

        if (usage) {
          const stepUsageInfo = {
            stepType: stepType || 'unknown',
            inputTokens: usage?.inputTokens,
            outputTokens: usage?.outputTokens,
            totalTokens: usage?.totalTokens,
            cachedInputTokens: usage?.cachedInputTokens, // Standard property
            reasoningTokens: usage?.reasoningTokens,
            finishReason,
          };

          logger.debug(`📊 [CHAT-API] Step Usage (${stepType || 'unknown'}):`, stepUsageInfo);
        }
      },
    });

    logger.debug("🔍 [CHAT-API] streamText returned, calling toUIMessageStreamResponse...");
    const response = result.toUIMessageStreamResponse();
    logger.debug("🔍 [CHAT-API] toUIMessageStreamResponse succeeded");
    return response;

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);

    // Detect timeout errors
    const isTimeout =
      errorMessage.includes('timeout') ||
      errorMessage.includes('TIMEOUT') ||
      errorMessage.includes('Function execution exceeded') ||
      errorMessage.includes('Execution timeout') ||
      (error && typeof error === 'object' && 'code' in error && error.code === 'TIMEOUT');

    if (isTimeout) {
      logger.error("⏱️ [CHAT-API] Request timed out after 30 seconds", {
        errorMessage,
        workspaceId,
      });

      return new Response(JSON.stringify({
        error: "Request timeout",
        message: "The request took too long to process (exceeded 30 seconds). This can happen with complex queries that require multiple tool calls or extensive processing. Please try breaking your question into smaller parts or simplifying your request.",
        code: "TIMEOUT",
      }), {
        status: 504,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Log other errors
    logger.error("❌ [CHAT-API] Error processing request", {
      errorMessage,
      errorStack: error instanceof Error ? error.stack : undefined,
      workspaceId,
    });

    return new Response(JSON.stringify({
      error: "Internal server error",
      message: "An unexpected error occurred while processing your request. Please try again.",
      details: process.env.NODE_ENV === 'development' ? errorMessage : undefined,
      code: "INTERNAL_ERROR",
    }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}
