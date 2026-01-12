import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { db, workspaces } from "@/lib/db/client";
import { cloneDemoWorkspace } from "@/lib/workspace/clone-demo";
import { eq } from "drizzle-orm";

/**
 * POST /api/guest/create-welcome-workspace
 * Create a welcome workspace for anonymous users
 */
export async function POST() {
  try {
    const session = await auth.api.getSession({
      headers: await headers(),
    });

    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Only allow anonymous users
    if (!session.user.isAnonymous) {
      return NextResponse.json({ error: "This endpoint is for anonymous users only" }, { status: 403 });
    }

    const userId = session.user.id;

    // Check if user already has workspaces
    const existingWorkspaces = await db
      .select()
      .from(workspaces)
      .where(eq(workspaces.userId, userId))
      .limit(1);

    if (existingWorkspaces.length > 0) {
      // User already has a workspace, return the first one
      const workspace = existingWorkspaces[0];
      return NextResponse.json({
        workspaceId: workspace.id,
        slug: workspace.slug || workspace.id,
      });
    }

    // Clone demo workspace using shared utility
    const userName = session.user.name || session.user.email || undefined;
    const result = await cloneDemoWorkspace(userId, userName);

    return NextResponse.json(result);
  } catch (error) {
    console.error("Error creating welcome workspace for anonymous user:", error);
    return NextResponse.json(
      { error: "Failed to create welcome workspace" },
      { status: 500 }
    );
  }
}
