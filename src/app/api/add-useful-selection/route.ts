import Supermemory from 'supermemory';
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { NextRequest } from 'next/server';

export const maxDuration = 30;

export async function POST(request: NextRequest) {
  try {
    // Get authenticated user
    const session = await auth.api.getSession({
      headers: await headers(),
    });
    
    if (!session) {
      return Response.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }
    
    const userId = session.user.id;

    const body = await request.json();
    const { selection, messageContext, userPrompt, annotation, selections, workspaceId } = body;

    // Check if this is multi-selection format (new format with selections array)
    if (selections && Array.isArray(selections)) {
      // Multi-selection with individual contexts
      if (selections.length === 0) {
        return Response.json(
          { error: "No selections provided" },
          { status: 400 }
        );
      }
    } else {
      // Single selection format
      if (!selection) {
        return Response.json(
          { error: "No selection provided" },
          { status: 400 }
        );
      }
    }

    if (!workspaceId) {
      return Response.json(
        { error: "No workspace ID provided" },
        { status: 400 }
      );
    }

    // Initialize Supermemory client
    const client = new Supermemory({
      apiKey: process.env.SUPERMEMORY_API_KEY!,
    });

    // Build content with full message context, highlighted selection, and optional annotation
    // This format helps the AI understand user preferences and thought patterns
    let content = "";
    let isMultiSelection = false;
    
    if (selections && Array.isArray(selections)) {
      // New multi-selection format with individual message contexts
      isMultiSelection = true;
      content = `# User Highlighted Multiple Selections\n\n`;
      
      // Add user prompt if available (use the first one found, or check if all are the same)
      const firstUserPrompt = selections.find((sel: {userPrompt?: string}) => sel.userPrompt)?.userPrompt;
      if (firstUserPrompt) {
        content += `## User's Original Prompt:\n${firstUserPrompt}\n\n`;
        content += `The user asked this question or made this request, and then highlighted ${selections.length} different portions from the AI's response. `;
      } else {
        content += `The user intentionally highlighted ${selections.length} different portions from AI-generated content. `;
      }
      content += `These highlights reveal their interests, preferences, and what they found valuable or relevant to their goals.\n\n`;
      
      selections.forEach((sel: {text: string; messageContext?: string; userPrompt?: string}, index: number) => {
        if (sel.messageContext) {
          content += `## Full AI Message for Selection ${index + 1}:\n${sel.messageContext}\n\n`;
        }
        content += `## User's Highlighted Selection ${index + 1}:\n${sel.text}\n\n`;
      });
      
      content += `**Note:** The user specifically chose to highlight these ${selections.length} portions together, indicating they are all important, useful, or aligned with their objectives. `;
      content += `This should inform understanding of their train of thought, preferences, and what they're trying to achieve.`;
    } else if (messageContext) {
      // Single selection with message context
      content = `# User Highlighted Content\n\n`;
      
      // Add user prompt if available
      if (userPrompt) {
        content += `## User's Original Prompt:\n${userPrompt}\n\n`;
        content += `The user asked this question or made this request, and then highlighted a specific portion from the AI's response. `;
      } else {
        content += `The user received this AI-generated message and intentionally highlighted a specific portion. `;
      }
      content += `This highlight reveals their interests, preferences, and what they found valuable or relevant to their goals.\n\n`;
      content += `## Full AI Message:\n${messageContext}\n\n`;
      content += `## User's Highlighted Selection:\n${selection}\n\n`;
      content += `**Note:** The user specifically chose to highlight this portion, indicating that it may be particularly important, useful, or aligned with their objectives. `;
      content += `This should inform understanding of their train of thought, preferences, and what they're trying to achieve.`;
    } else {
      // Fallback if no message context available
      content = `# User Highlighted Content\n\n`;
      if (userPrompt) {
        content += `## User's Original Prompt:\n${userPrompt}\n\n`;
      }
      content += `The user marked this content as useful:\n\n${selection}\n\n`;
      content += `This indicates their interest and preferences.`;
    }
    
    if (annotation) {
      content += `\n\n## User's Personal Notes on the Highlighted Content.:\n${annotation}`;
    }

    // Add to Supermemory
    const result = await client.memories.add({
      content: content,
      containerTags: [userId],
      metadata: {
        type: "highlight",
        uploadedBy: userId,
        workspaceId: workspaceId,
        uploadedAt: new Date().toISOString(),
        hasAnnotation: !!annotation,
        hasMessageContext: !!(messageContext || (selections && selections.some((s: any) => s.messageContext))),
        hasUserPrompt: !!(userPrompt || (selections && selections.some((s: any) => s.userPrompt))),
        isMultiSelection: isMultiSelection,
        ...(isMultiSelection && selections && { selectionCount: selections.length }),
        ...(selection && { originalSelection: selection }),
        ...(userPrompt && { userPrompt }),
        ...(annotation && { annotation }),
      },
    });

    return Response.json({
      success: true,
      message: `Selection marked as useful and saved`,
      memoryId: result.id,
      status: result.status,
    });
  } catch (error) {
    console.error('Error adding useful selection:', error);
    return Response.json(
      { 
        error: "Failed to add selection",
        details: error instanceof Error ? error.message : String(error)
      },
      { status: 500 }
    );
  }
}
