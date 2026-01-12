import Supermemory from 'supermemory';
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { NextRequest } from 'next/server';

export const maxDuration = 10;

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
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

    const { id } = await params;

    if (!id) {
      return Response.json(
        { error: "No document ID provided" },
        { status: 400 }
      );
    }

    // Initialize Supermemory client
    const client = new Supermemory({
      apiKey: process.env.SUPERMEMORY_API_KEY!,
    });

    // Get document status
    try {
      const document = await client.memories.get(id);

      return Response.json({
        id: document.id,
        status: document.status,
        updatedAt: new Date().toISOString(),
      });
    } catch (memoryError: any) {
      // If document not found (404), return failed status instead of error
      if (memoryError?.status === 404) {
        return Response.json({
          id: id,
          status: 'failed',
          error: 'Document not found',
          updatedAt: new Date().toISOString(),
        });
      }
      throw memoryError;
    }
  } catch (error) {
    console.error('Error fetching attachment status:', error);
    return Response.json(
      { 
        error: "Failed to fetch attachment status",
        details: error instanceof Error ? error.message : String(error)
      },
      { status: 500 }
    );
  }
}
