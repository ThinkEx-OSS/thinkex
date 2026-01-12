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
    const { url, workspaceId } = body;

    if (!url) {
      return Response.json(
        { error: "No URL provided" },
        { status: 400 }
      );
    }

    if (!workspaceId) {
      return Response.json(
        { error: "No workspace ID provided" },
        { status: 400 }
      );
    }

    // Validate URL format
    try {
      new URL(url);
    } catch {
      return Response.json(
        { error: "Invalid URL format" },
        { status: 400 }
      );
    }

    // Initialize Supermemory client
    const client = new Supermemory({
      apiKey: process.env.SUPERMEMORY_API_KEY!,
    });

    // Add URL to Supermemory using memories.add() method
    // Supermemory will automatically extract content from the URL
    const result = await client.memories.add({
      content: url,
      containerTags: [userId], // Use userId as container tag
      metadata: {
        url: url,
        uploadedBy: userId,
        workspaceId: workspaceId,
        uploadedAt: new Date().toISOString()
      },
    });

    return Response.json({
      success: true,
      message: `URL added successfully`,
      memoryId: result.id,
      url: url,
      status: result.status,
    });
  } catch (error) {
    console.error('Error uploading URL:', error);
    return Response.json(
      { 
        error: "Failed to add URL",
        details: error instanceof Error ? error.message : String(error)
      },
      { status: 500 }
    );
  }
}
