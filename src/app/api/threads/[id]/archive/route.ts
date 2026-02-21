import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db/client";
import { chatThreads } from "@/lib/db/schema";
import {
  requireAuth,
  verifyWorkspaceAccess,
} from "@/lib/api/workspace-helpers";
import { eq } from "drizzle-orm";

/**
 * POST /api/threads/[id]/archive
 * Archive a thread
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const userId = await requireAuth();
    const { id } = await params;

    const [thread] = await db
      .select()
      .from(chatThreads)
      .where(eq(chatThreads.id, id))
      .limit(1);

    if (!thread) {
      return NextResponse.json({ error: "Thread not found" }, { status: 404 });
    }

    await verifyWorkspaceAccess(thread.workspaceId, userId, "editor");

    await db
      .update(chatThreads)
      .set({
        isArchived: true,
        updatedAt: new Date().toISOString(),
      })
      .where(eq(chatThreads.id, id));

    return new Response(null, { status: 204 });
  } catch (error) {
    if (error instanceof Response) return error;
    console.error("[threads] archive error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
