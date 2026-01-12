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

    const formData = await request.formData();
    const file = formData.get('file') as File;
    const workspaceId = formData.get('workspaceId') as string;

    if (!file) {
      return Response.json(
        { error: "No file provided" },
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

    // Upload file to Supermemory using uploadFile method (RECOMMENDED)
    // This handles OCR for images, transcription for videos, and text extraction for documents
    // containerTags must be a string, not an array (per Supermemory docs)
    const result = await client.memories.uploadFile({
      file: file,
      containerTags: userId, // Use userId as container tag (string, not array)
      metadata: JSON.stringify({
        fileName: file.name,
        fileSize: file.size.toString(),
        fileType: file.type,
        uploadedBy: userId,
        workspaceId: workspaceId,
        uploadedAt: new Date().toISOString(),
      }),
    });

    return Response.json({
      success: true,
      message: `${file.name} uploaded and processed for research`,
      memoryId: result.id,
      fileName: file.name,
      status: result.status,
    });
  } catch (error) {
    console.error('Error uploading attachment:', error);
    return Response.json(
      { 
        error: "Failed to upload attachment",
        details: error instanceof Error ? error.message : String(error)
      },
      { status: 500 }
    );
  }
}
