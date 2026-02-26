import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { workspaceWorker } from "@/lib/ai/workers";
import { logger } from "@/lib/utils/logger";
import { processMessageContent } from "@/lib/ai/clean-message-content";
import { google } from "@ai-sdk/google";
import { generateText } from "ai";

/**
 * POST /api/cards/from-message
 * Create a card from an AI message response
 */
export async function POST(request: NextRequest) {
  try {
    const session = await auth.api.getSession({
      headers: await headers(),
    });

    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userId = session.user.id;

    const body = await request.json();
    const { content, workspaceId, folderId, sources } = body;

    if (sources !== undefined) {
      const hasInvalidSource =
        !Array.isArray(sources) ||
        sources.some(
          (source) =>
            !source ||
            typeof source.title !== "string" ||
            typeof source.url !== "string"
        );

      if (hasInvalidSource) {
        return NextResponse.json(
          { error: "Sources must be an array of { title, url } objects" },
          { status: 400 }
        );
      }
    }



    // Validate input
    if (!content || typeof content !== "string" || !content.trim()) {
      return NextResponse.json(
        { error: "Content is required" },
        { status: 400 }
      );
    }

    if (!workspaceId || typeof workspaceId !== "string") {
      return NextResponse.json(
        { error: "Workspace ID is required" },
        { status: 400 }
      );
    }

    logger.debug("📝 [CREATE-CARD-FROM-MESSAGE] Creating card from message", {
      workspaceId: workspaceId.substring(0, 8),
      contentLength: content.length,

    });

    // Use AI to extract pure note content from the assistant response (no summarization, no information loss)
    logger.debug("📝 [CREATE-CARD-FROM-MESSAGE] Processing content with AI");

    const systemPrompt = `You are a content extractor. Your task is to turn an assistant's chat response into a clean note card. CRITICAL: Preserve ALL substantive information — do NOT summarize or condense. Only remove irrelevant agent meta-talk.

GOALS:
1. Zero information loss — keep every fact, detail, step, and example from the original content
2. Pure content only — strip all conversational fluff the agent added (e.g. "Here's what I found", "Let me organize this", "I hope this helps", "Does this answer your question?", pleasantries, disclaimers)
3. Extract or infer a concise title from the content
4. Output ONLY the note content in markdown — no meta-commentary, no explanations

RULES:
- DO NOT summarize. If the content has 10 bullet points, output 10 bullet points. If it has a long example, keep the full example
- Remove: conversational phrases, "I" statements, meta-commentary, filler
- Keep: all factual content, lists, code blocks, examples, definitions, steps
- Markdown: use headings (# ## ###), lists (- or 1.), **bold**, *italic*, > block quotes where appropriate
- Math (same as main system): single $...$ for inline, $$...$$ for block. Currency: escape as \\$ (e.g. \\$19.99)
- Start content with subheadings/text — DO NOT repeat the title in the body
- If multiple fragments: concatenate into one cohesive note, preserving all content
- Return ONLY the reformatted note (first line or # heading = title; rest = body). No preamble or footer.`;

    const aiResult = await generateText({
      model: google("gemini-3-flash-preview"),
      system: systemPrompt,
      prompt: `Extract the pure note content from this assistant response. Preserve all information. Remove only conversational/meta fluff. Output title + body in markdown:\n\n${content}`,
    });

    const reformattedContent = aiResult.text.trim();

    logger.debug("📝 [CREATE-CARD-FROM-MESSAGE] AI processing completed", {
      originalLength: content.length,
      reformattedLength: reformattedContent.length,
    });

    // Process the reformatted content to extract a clean title and content
    // This replicates the behavior of the createNote tool
    const { title, content: cleanedContent } = processMessageContent(reformattedContent);

    // Use the workspace worker to create the card
    // This will handle markdown parsing and block conversion
    const result = await workspaceWorker("create", {
      workspaceId,
      title,
      content: cleanedContent,
      sources,
      folderId,
    });

    logger.debug("📝 [CREATE-CARD-FROM-MESSAGE] Card created successfully", {
      itemId: result.itemId?.substring(0, 8),
    });

    return NextResponse.json({
      success: true,
      itemId: result.itemId,
      title,
    });
  } catch (error) {
    logger.error("📝 [CREATE-CARD-FROM-MESSAGE] Error:", error);

    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Internal server error"
      },
      { status: 500 }
    );
  }
}
