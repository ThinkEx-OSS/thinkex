import { AssistantCloud } from "@assistant-ui/react";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  try {
    const session = await auth.api.getSession({
      headers: await headers(),
    });
    
    if (!session) {
      return NextResponse.json(
        { error: "User not authenticated" },
        { status: 401 }
      );
    }
    
    const userId = session.user.id;

    const body = await req.json().catch(() => ({}));
    const { workspaceId } = body;

    if (!workspaceId) {
      return NextResponse.json(
        { error: "workspaceId is required" },
        { status: 400 }
      );
    }

    // Create AssistantCloud instance with API key
    const assistantCloud = new AssistantCloud({
      apiKey: process.env.ASSISTANT_API_KEY!,
      userId,
      workspaceId, // This scopes threads to the specific workspace
    });

    // Generate auth token for this user and workspace
    const { token } = await assistantCloud.auth.tokens.create();

    return NextResponse.json({ token });
  } catch (error) {
    console.error("Failed to generate assistant token:", error);
    return NextResponse.json(
      { error: "Failed to generate token" },
      { status: 500 }
    );
  }
}

