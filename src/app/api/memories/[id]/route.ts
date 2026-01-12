import Supermemory from 'supermemory';
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { NextRequest } from 'next/server';

export const maxDuration = 10;

export async function DELETE(
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
        { error: "No memory ID provided" },
        { status: 400 }
      );
    }

    // Initialize Supermemory client
    const client = new Supermemory({
      apiKey: process.env.SUPERMEMORY_API_KEY!,
    });

    // Delete the memory
    await client.memories.delete(id);

    return Response.json({
      success: true,
      message: 'Memory deleted successfully',
    });
  } catch (error) {
    console.error('Error deleting memory:', error);
    return Response.json(
      { 
        error: "Failed to delete memory",
        details: error instanceof Error ? error.message : String(error)
      },
      { status: 500 }
    );
  }
}
