import { NextResponse } from "next/server";
import { db } from "@/lib/db/client";
import { chatThreads } from "@/lib/db/schema";
import {
  requireAuth,
  verifyWorkspaceAccess,
} from "@/lib/api/workspace-helpers";
import { eq } from "drizzle-orm";

/**
 * Shared logic for archive/unarchive. Returns NextResponse or throws.
 */
export async function setThreadArchived(
  threadId: string,
  isArchived: boolean
): Promise<Response> {
  const userId = await requireAuth();

  const [thread] = await db
    .select()
    .from(chatThreads)
    .where(eq(chatThreads.id, threadId))
    .limit(1);

  if (!thread) {
    return NextResponse.json({ error: "Thread not found" }, { status: 404 });
  }

  await verifyWorkspaceAccess(thread.workspaceId, userId, "editor");

  await db
    .update(chatThreads)
    .set({
      isArchived,
      updatedAt: new Date().toISOString(),
    })
    .where(eq(chatThreads.id, threadId));

  return new Response(null, { status: 204 });
}
