import { google } from "@ai-sdk/google";
import { streamText, convertToModelMessages, stepCountIs, tool, zodSchema, wrapLanguageModel } from "ai";
import { devToolsMiddleware } from "@ai-sdk/devtools";
import { PostHog } from "posthog-node";
import { withTracing } from "@posthog/ai";
import type { UIMessage } from "ai";
import { logger } from "@/lib/utils/logger";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { createChatTools } from "@/lib/ai/tools";

// Regex patterns as constants (compiled once, reused for all requests)
const URL_CONTEXT_REGEX = /\[URL_CONTEXT:(.+?)\]/g;
const DIRECT_URL_REGEX = /https?:\/\/[^\s]+/g;
const FILE_URL_REGEX = /\[FILE_URL:([^|]+)\|mediaType:([^|]*)\|filename:([^\]]*)\]/g;

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
 * Process messages in a single pass: extract file URLs, URL context URLs, and clean markers
 * This combines 3 separate iterations into 1 for better performance
 */
function processMessages(messages: any[]): {
  fileUrls: string[];
  urlContextUrls: string[];
  cleanedMessages: any[];
} {
  const fileUrls: string[] = [];
  const urlContextUrlsSet = new Set<string>();

  const cleanedMessages = messages.map((message) => {
    if (message.content && Array.isArray(message.content)) {
      const updatedContent = message.content.map((part: any) => {
        if (part.type === "text" && typeof part.text === "string") {
          const text = part.text;

          // Extract file URLs (create new regex instance to avoid state issues with global flag)
          let match;
          const fileUrlRegexLocal = new RegExp(FILE_URL_REGEX.source, FILE_URL_REGEX.flags);
          while ((match = fileUrlRegexLocal.exec(text)) !== null) {
            fileUrls.push(match[1]);
          }

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
    fileUrls,
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

/**
 * Build the enhanced system prompt with guidelines and detection hints
 * Uses array join for better performance than string concatenation
 */
function buildSystemPrompt(baseSystem: string, fileUrls: string[], urlContextUrls: string[]): string {
  const parts: string[] = [baseSystem];

  // Add web search decision-making guidelines
  parts.push(`


WEB SEARCH DECISION GUIDELINES:
You have access to the webSearch tool. Use the following guidelines to decide when to search vs use internal knowledge:

WHEN TO USE INTERNAL KNOWLEDGE (do NOT search):
- Creative Writing: Writing stories, poems, scripts, or creative content
- Coding & Logic: Explaining programming concepts, writing code, or solving math problems
- General Concepts: Explaining historical events, scientific principles, or established theories
- Analysis & Synthesis: Summarizing provided text, changing tone of drafts, or reorganizing content

WHEN TO USE WEB SEARCH:
- Temporal Cues: User mentions "today", "yesterday", "latest", "current", "recent", or specific dates
- Breaking News: Anything that happened after your training cutoff
- Real-Time Data: Sports scores, stock prices, weather, currency exchange rates
- Fact Verification: When asked for specific statistics, citations, or recent studies
- Niche Information: Details about small local businesses, new software versions, or very specific current events

COMBINED APPROACH (search + internal knowledge):
When a query requires both current data AND conceptual explanation, do both:
1. Search for the real-time/factual component
2. Use internal knowledge for the conceptual/explanatory component  
3. Synthesize into a cohesive answer

YOUTUBE SEARCH GUIDANCE:
If the user asks to "add a youtube video" or "search for a video" but does not provide a specific topic (e.g., "add a video for this workspace"), you MUST inference a relevant search query based on the current workspace context, selected cards, or recent conversation history. Do NOT ask the user for a topic if meaningful context is available. Use the 'searchYoutube' tool directly with your inferred query.

CONFIDENCE THRESHOLD:
If you are uncertain about a fact's accuracy or currency, prefer to search rather than risk providing outdated information.

CITATION REQUIREMENT:
When using search results (grounding), you must include the date of each article/source if available.`);

  // Add file detection hint if file URLs are present
  if (fileUrls.length > 0) {
    parts.push(`\n\nFILE DETECTION: The user's message contains ${fileUrls.length} file(s). You MUST call the processFiles tool with these URLs to analyze them: ${fileUrls.join(', ')}`);
  }

  // Add URL detection hint if URLs are present
  if (urlContextUrls.length > 0) {
    parts.push(`\n\nURL DETECTION: The user's message contains ${urlContextUrls.length} URL(s): ${urlContextUrls.join(', ')}. You should call the processUrls tool with these URLs to analyze them.`);
  }

  return parts.join('');
}

export async function POST(req: Request) {
  let workspaceId: string | null = null;
  let activeFolderId: string | undefined;

  // Check for API key early
  if (!process.env.GOOGLE_GENERATIVE_AI_API_KEY) {
    return new Response(JSON.stringify({
      error: "API key not defined",
      message: "GOOGLE_GENERATIVE_AI_API_KEY is not configured. Please set it in your environment variables.",
      code: "API_KEY_MISSING",
    }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
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

    // Process messages in single pass: extract URLs/files and clean markers
    const { fileUrls, urlContextUrls, cleanedMessages } = processMessages(convertedMessages);

    // Get pre-formatted selected cards context from client (no DB fetch needed)
    const selectedCardsContext = getSelectedCardsContext(body);

    // Build system prompt with all context parts (using array join for efficiency)
    const systemPromptParts: string[] = [buildSystemPrompt(system, fileUrls, urlContextUrls)];

    // Inject selected cards context if available
    if (selectedCardsContext) {
      systemPromptParts.push(`\n\n${selectedCardsContext}`);
    }

    // Inject reply context if available
    const replySelections = body.replySelections || [];
    if (replySelections.length > 0) {
      const replyContext = replySelections
        .map((sel: { text: string }) => `> ${sel.text}`)
        .join("\n");
      systemPromptParts.push(`\n\nREPLY CONTEXT:\nThe user is replying specifically to these parts of the previous message:\n${replyContext}`);
    }

    const finalSystemPrompt = systemPromptParts.join('');

    // Get model
    const modelId = body.modelId || "gemini-flash-lite-latest";
    // Initialize PostHog client
    const posthogClient = new PostHog(process.env.POSTHOG_API_KEY || "disabled", {
      host: process.env.POSTHOG_HOST || "https://us.i.posthog.com",
      disabled: !process.env.POSTHOG_API_KEY,
    });

    const model = wrapLanguageModel({
      model: withTracing(google(modelId), posthogClient, {
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
    });

    // Stream the response
    logger.debug("🔍 [CHAT-API] Final cleanedMessages before streamText:", {
      count: cleanedMessages.length,
    });

    // Prepare provider options
    let providerOptions: any = {
      google: {
        grounding: {
          googleSearchRetrieval: {
            dynamicRetrievalConfig: {
              mode: 'MODE_DYNAMIC',
            },
          },
        },
      },
    };

    const result = streamText({
      model: model,
      temperature: 0,
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
          // Extended properties (Google provider specific)
          inputTokenDetails: (usage as any)?.inputTokenDetails ? {
            cacheReadTokens: (usage as any).inputTokenDetails?.cacheReadTokens,
            cacheWriteTokens: (usage as any).inputTokenDetails?.cacheWriteTokens,
            noCacheTokens: (usage as any).inputTokenDetails?.noCacheTokens,
          } : undefined,
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
            // Extended properties (Google provider specific)
            inputTokenDetails: (usage as any)?.inputTokenDetails ? {
              cacheReadTokens: (usage as any).inputTokenDetails?.cacheReadTokens,
              cacheWriteTokens: (usage as any).inputTokenDetails?.cacheWriteTokens,
              noCacheTokens: (usage as any).inputTokenDetails?.noCacheTokens,
            } : undefined,
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
