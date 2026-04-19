import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/lib/db/client";
import { verifyThreadOwnership, verifyWorkspaceAccess } from "@/lib/api/workspace-helpers";
import { chatMessages, chatThreads } from "@/lib/db/schema";

export async function verifyThread(args: {
  threadId: string;
  userId: string;
}): Promise<{ thread: typeof chatThreads.$inferSelect }> {
  const [thread] = await db
    .select()
    .from(chatThreads)
    .where(eq(chatThreads.id, args.threadId))
    .limit(1);

  if (!thread) {
    throw NextResponse.json({ error: "Thread not found" }, { status: 404 });
  }

  await verifyWorkspaceAccess(thread.workspaceId, args.userId);
  verifyThreadOwnership(thread, args.userId);

  return { thread };
}

export async function upsertMessage(args: {
  threadId: string;
  messageId: string;
  parentId: string | null;
  content: Record<string, unknown>;
  updateHeadIfMatches: boolean;
}): Promise<void> {
  await db.transaction(async (tx) => {
    await tx
      .insert(chatMessages)
      .values({
        threadId: args.threadId,
        messageId: args.messageId,
        parentId: args.parentId,
        format: "ai-sdk/v6",
        content: args.content,
      })
      .onConflictDoNothing({
        target: [chatMessages.threadId, chatMessages.messageId],
      });

    const [thread] = await tx
      .select({ headMessageId: chatThreads.headMessageId })
      .from(chatThreads)
      .where(eq(chatThreads.id, args.threadId))
      .limit(1);

    const shouldUpdateHead =
      args.updateHeadIfMatches &&
      (args.parentId == null || thread?.headMessageId === args.parentId);

    const now = new Date().toISOString();
    await tx
      .update(chatThreads)
      .set({
        updatedAt: now,
        lastMessageAt: now,
        ...(shouldUpdateHead ? { headMessageId: args.messageId } : {}),
      })
      .where(eq(chatThreads.id, args.threadId));
  });
}
