import { google } from "@ai-sdk/google";
import { streamText, convertToModelMessages, stepCountIs } from "ai";
import { logger } from "@/lib/utils/logger";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { createChatTools } from "@/lib/ai/tools";
import { loadWorkspaceState } from "@/lib/workspace/state-loader";
import { formatSelectedCardsContext } from "@/lib/utils/format-workspace-context";

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
 * Extract file URLs from FILE_URL markers in messages
 */
function extractFileUrls(messages: any[]): string[] {
  const fileUrls: string[] = [];

  messages.forEach((message) => {
    if (message.content && Array.isArray(message.content)) {
      message.content.forEach((part: any) => {
        if (part.type === "text" && typeof part.text === "string") {
          // Create regex inside loop to reset lastIndex state for each iteration
          const fileUrlRegex = /\[FILE_URL:([^|]+)\|mediaType:([^|]*)\|filename:([^\]]*)\]/g;
          let match;
          while ((match = fileUrlRegex.exec(part.text)) !== null) {
            fileUrls.push(match[1]);
          }
        }
      });
    }
  });

  return fileUrls;
}

/**
 * Extract URLs from URL_CONTEXT markers and direct URLs in messages
 */
function extractUrlContextUrls(messages: any[]): string[] {
  const urlContextUrls: string[] = [];

  messages.forEach((message) => {
    if (message.content && Array.isArray(message.content)) {
      message.content.forEach((part: any) => {
        if (part.type === "text" && typeof part.text === "string") {
          // Look for [URL_CONTEXT:...] markers
          const urlMatches = part.text.matchAll(/\[URL_CONTEXT:(.+?)\]/g);
          for (const match of urlMatches) {
            const url = match[1];
            if (url && !urlContextUrls.includes(url)) {
              urlContextUrls.push(url);
            }
          }
          // Also look for direct URLs in text
          const directUrlMatches = part.text.matchAll(/https?:\/\/[^\s]+/g);
          for (const match of directUrlMatches) {
            const url = match[0];
            if (url && !urlContextUrls.includes(url)) {
              urlContextUrls.push(url);
            }
          }
        }
      });
    }
  });

  return urlContextUrls;
}

/**
 * Clean URL_CONTEXT markers from messages
 */
function cleanMessages(messages: any[]): any[] {
  return messages.map((message) => {
    if (message.content && Array.isArray(message.content)) {
      const updatedContent = message.content.map((part: any) => {
        if (part.type === "text" && typeof part.text === "string") {
          const updatedText = part.text.replace(/\[URL_CONTEXT:(.+?)\]/g, (_match: string, url: string) => {
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
}

/**
 * Build selected cards context from card IDs
 * Fetches workspace state and formats the selected cards for the system prompt
 */
async function buildSelectedCardsContext(
  workspaceId: string | null,
  selectedCardIds: string[]
): Promise<string> {
  if (!workspaceId || !selectedCardIds || selectedCardIds.length === 0) {
    return "";
  }

  try {
    const state = await loadWorkspaceState(workspaceId);
    const selectedItems = state.items.filter((item) =>
      selectedCardIds.includes(item.id)
    );

    if (selectedItems.length === 0) {
      return "";
    }

    return formatSelectedCardsContext(selectedItems, state.items);
  } catch (error) {
    logger.error("❌ [CHAT-API] Failed to load selected cards context:", {
      error: error instanceof Error ? error.message : String(error),
      workspaceId,
      selectedCardIds,
    });
    return "";
  }
}

/**
 * Build the enhanced system prompt with guidelines and detection hints
 */
function buildSystemPrompt(baseSystem: string, fileUrls: string[], urlContextUrls: string[]): string {
  let finalSystemPrompt = baseSystem;

  // Add web search decision-making guidelines
  finalSystemPrompt += `

WEB SEARCH DECISION GUIDELINES:
You have access to the searchWeb tool. Use the following guidelines to decide when to search vs use internal knowledge:

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

CONFIDENCE THRESHOLD:
If you are uncertain about a fact's accuracy or currency, prefer to search rather than risk providing outdated information.
`;

  // Add file detection hint if file URLs are present
  if (fileUrls.length > 0) {
    finalSystemPrompt += `\n\nFILE DETECTION: The user's message contains ${fileUrls.length} file(s). You MUST call the processFiles tool with these URLs to analyze them: ${fileUrls.join(', ')}`;
  }

  // Add URL detection hint if URLs are present
  if (urlContextUrls.length > 0) {
    finalSystemPrompt += `\n\nURL DETECTION: The user's message contains ${urlContextUrls.length} URL(s): ${urlContextUrls.join(', ')}. You should call the processUrls tool with these URLs to analyze them.`;
  }

  return finalSystemPrompt;
}

export async function POST(req: Request) {
  let workspaceId: string | null = null;
  let activeFolderId: string | undefined;

  try {
    // FIX: Parallelize headers() and req.json() to eliminate waterfall
    const [headersObj, body] = await Promise.all([
      headers(),
      req.json()
    ]);

    // Get authenticated user ID
    const session = await auth.api.getSession({ headers: headersObj });
    const userId = session?.user?.id || null;

    const messages = body.messages || [];
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

    // Extract URLs and files from messages
    const fileUrls = extractFileUrls(convertedMessages);
    const urlContextUrls = extractUrlContextUrls(convertedMessages);

    // Clean messages
    const cleanedMessages = cleanMessages(convertedMessages);

    // Build selected cards context
    const selectedCardIds = body.selectedCardIds || [];
    const selectedCardsContext = await buildSelectedCardsContext(workspaceId, selectedCardIds);

    // Build system prompt
    let finalSystemPrompt = buildSystemPrompt(system, fileUrls, urlContextUrls);

    // Inject selected cards context if available
    if (selectedCardsContext) {
      finalSystemPrompt = `${finalSystemPrompt}\n\n${selectedCardsContext}`;
    }

    // Inject reply context if available
    const replySelections = body.replySelections || [];
    if (replySelections.length > 0) {
      const replyContext = replySelections
        .map((sel: { text: string }) => `> ${sel.text}`)
        .join("\n");

      finalSystemPrompt = `${finalSystemPrompt}\n\nREPLY CONTEXT:\nThe user is replying specifically to these parts of the previous message:\n${replyContext}`;
    }

    // Get model
    const modelId = body.modelId || "gemini-2.5-pro";
    const model = google(modelId);

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

    const result = streamText({
      model: model,
      system: finalSystemPrompt,
      messages: cleanedMessages,
      stopWhen: stepCountIs(25),
      tools,
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
