import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { workspaceWorker } from "@/lib/ai/workers";
import { logger } from "@/lib/utils/logger";
import { processMessageContent } from "@/lib/ai/clean-message-content";
import { vertex } from "@ai-sdk/google-vertex/edge";
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
    const { content, workspaceId } = body;



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

    // Use AI to process and reformat the content into a cohesive note
    logger.debug("📝 [CREATE-CARD-FROM-MESSAGE] Processing content with AI");

    const systemPrompt = `You are a note-taking assistant. Your task is to create a cohesive, well-formatted note from the provided content.

INSTRUCTIONS:
1. Create a clear, concise title for the note (extract from content or create one that summarizes the main topic)
2. Reformulate and organize the content into a cohesive, well-structured note
3. Ensure proper markdown formatting:
   - Use appropriate headings (# ## ###) to structure the content
   - Use lists (- or 1.) for enumerated items
   - Use **bold** for emphasis and *italic* for subtle emphasis
   - Use > for block quotes when appropriate
   - Use proper line breaks and spacing for readability
4. Format mathematical expressions using LaTeX:
   - Use $...$ for inline math within text (e.g., The equation $E = mc^2$ shows...)
   - Use $$...$$ for display/block math equations on separate lines
   - Ensure math blocks are properly closed - every opening $ or $$ must have a matching closing $ or $$
   - Add spaces around $ symbols when math appears in lists or tables
   - Do not add periods, commas, or other punctuation immediately after math expressions
5. If the content contains multiple selections or fragments, combine them into a single cohesive narrative
6. Maintain the original meaning and key information while improving clarity and organization
7. Remove any redundant or repetitive information
8. Ensure the note flows naturally and reads well

Return ONLY the reformatted note content in markdown format. Do not include any meta-commentary or explanations.`;

    const aiResult = await generateText({
      model: vertex("gemini-2.5-flash"),
      system: systemPrompt,
      prompt: `Create a cohesive, well-formatted note from the following content:\n\n${content}`,
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
