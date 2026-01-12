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
    const { selection, messageContext, userPrompt, annotation, workspaceId } = body;

    if (!selection) {
      return Response.json(
        { error: "No selection provided" },
        { status: 400 }
      );
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

    // Build content for negative feedback
    // This helps the AI learn what outputs were unhelpful or incorrect
    let content = "";
    
    if (messageContext) {
      content = `# User Reported Unhelpful Content\n\n`;
      
      // Add user prompt if available
      if (userPrompt) {
        content += `## User's Original Prompt:\n${userPrompt}\n\n`;
        content += `The user asked this question or made this request, and then flagged the AI's response as unhelpful, incorrect, or problematic. `;
      } else {
        content += `The user flagged this AI-generated content as unhelpful, incorrect, or problematic. `;
      }
      content += `This negative feedback is crucial for understanding what to avoid and improving future responses.\n\n`;
      content += `## Full AI Message (Flagged as Unhelpful):\n${messageContext}\n\n`;
      content += `## User's Flagged Selection:\n${selection}\n\n`;
      content += `**Important:** The user specifically flagged this content as problematic. `;
      content += `This should inform what types of responses or information to avoid in the future.`;
    } else {
      // Fallback if no message context available
      content = `# User Reported Unhelpful Content\n\n`;
      if (userPrompt) {
        content += `## User's Original Prompt:\n${userPrompt}\n\n`;
      }
      content += `The user flagged this content as unhelpful:\n\n${selection}\n\n`;
      content += `This indicates content that should be avoided.`;
    }
    
    if (annotation) {
      content += `\n\n## User's Explanation of the Problem:\n${annotation}`;
    }

    // Add to Supermemory
    const result = await client.memories.add({
      content: content,
      containerTags: [userId],
      metadata: {
        type: "negative_feedback",
        uploadedBy: userId,
        workspaceId: workspaceId,
        uploadedAt: new Date().toISOString(),
        hasAnnotation: !!annotation,
        hasMessageContext: !!messageContext,
        hasUserPrompt: !!userPrompt,
        flaggedSelection: selection,
        ...(userPrompt && { userPrompt }),
        ...(annotation && { feedbackNote: annotation }),
      },
    });

    return Response.json({
      success: true,
      message: `Negative feedback saved`,
      memoryId: result.id,
      status: result.status,
    });
  } catch (error) {
    console.error('Error adding negative feedback:', error);
    return Response.json(
      { 
        error: "Failed to add negative feedback",
        details: error instanceof Error ? error.message : String(error)
      },
      { status: 500 }
    );
  }
}
