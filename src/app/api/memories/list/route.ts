import Supermemory from 'supermemory';
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { NextRequest } from 'next/server';

export const maxDuration = 10;

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
    const { limit = 50, page = 1, sort = 'createdAt', order = 'desc' } = body;

    // Initialize Supermemory client
    const client = new Supermemory({
      apiKey: process.env.SUPERMEMORY_API_KEY!,
    });

    // List memories filtered by userId
    const result = await client.memories.list({
      limit: Number(limit),
      page: Number(page),
      containerTags: [userId], // Filter by user's memories
      sort: sort as 'createdAt' | 'updatedAt',
      order: order as 'asc' | 'desc',
    });

    return Response.json(result);
  } catch (error) {
    console.error('Error listing memories:', error);
    return Response.json(
      { 
        error: "Failed to list memories",
        details: error instanceof Error ? error.message : String(error)
      },
      { status: 500 }
    );
  }
}
