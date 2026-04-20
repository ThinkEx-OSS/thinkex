import { NextRequest, NextResponse } from "next/server";
import { and, asc, eq, isNull } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { chatMessages, chatThreads } from "@/lib/db/schema";
import { requireAuth, verifyThreadOwnership, verifyWorkspaceAccess } from "@/lib/api/workspace-helpers";
import { withServerObservability } from "@/lib/with-server-observability";

async function getThreadAndMessage(threadId: string, messageId: string, userId: string) {
  const [thread] = await db.select().from(chatThreads).where(eq(chatThreads.id, threadId)).limit(1);
  if (!thread) throw NextResponse.json({ error: "Thread not found" }, { status: 404 });
  await verifyWorkspaceAccess(thread.workspaceId, userId);
  verifyThreadOwnership(thread, userId);

  const [message] = await db.select().from(chatMessages).where(and(eq(chatMessages.threadId, threadId), eq(chatMessages.messageId, messageId))).limit(1);
  if (!message) throw NextResponse.json({ error: "Message not found" }, { status: 404 });

  return { thread, message };
}

async function findLeaf(threadId: string, messageId: string): Promise<string> {
  let currentId = messageId;
  while (true) {
    const [child] = await db.select({ messageId: chatMessages.messageId }).from(chatMessages).where(and(eq(chatMessages.threadId, threadId), eq(chatMessages.parentId, currentId))).orderBy(asc(chatMessages.createdAt)).limit(1);
    if (!child) return currentId;
    currentId = child.messageId;
  }
}

export const GET = withServerObservability(async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string; messageId: string }> }) {
  try {
    const userId = await requireAuth();
    const { id, messageId } = await params;
    const { message } = await getThreadAndMessage(id, messageId, userId);
    const siblings = await db
      .select({ id: chatMessages.messageId, parentId: chatMessages.parentId, createdAt: chatMessages.createdAt })
      .from(chatMessages)
      .where(
        and(
          eq(chatMessages.threadId, id),
          message.parentId == null
            ? isNull(chatMessages.parentId)
            : eq(chatMessages.parentId, message.parentId),
        ),
      )
      .orderBy(asc(chatMessages.createdAt));
    return NextResponse.json({
      siblings,
      currentIndex: siblings.findIndex((candidate) => candidate.id === messageId),
    });
  } catch (error) {
    if (error instanceof Response) return error;
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}, { routeName: "GET /api/threads/[id]/messages/[messageId]/branches" });

export const POST = withServerObservability(async function POST(req: NextRequest, { params }: { params: Promise<{ id: string; messageId: string }> }) {
  try {
    const userId = await requireAuth();
    const { id, messageId } = await params;
    const body = await req.json().catch(() => ({})) as { targetBranchId?: string };
    if (!body.targetBranchId) {
      return NextResponse.json({ error: "targetBranchId is required" }, { status: 400 });
    }

    const { message } = await getThreadAndMessage(id, messageId, userId);
    const [target] = await db
      .select()
      .from(chatMessages)
      .where(and(eq(chatMessages.threadId, id), eq(chatMessages.messageId, body.targetBranchId)))
      .limit(1);
    if (!target) {
      return NextResponse.json({ error: "Target branch not found" }, { status: 404 });
    }
    if (target.parentId !== message.parentId) {
      return NextResponse.json(
        { error: "Target is not a sibling of the anchor message" },
        { status: 400 },
      );
    }

    const leafId = await findLeaf(id, body.targetBranchId);
    await db.update(chatThreads).set({ headMessageId: leafId, updatedAt: new Date().toISOString() }).where(eq(chatThreads.id, id));
    return NextResponse.json({ headMessageId: leafId });
  } catch (error) {
    if (error instanceof Response) return error;
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}, { routeName: "POST /api/threads/[id]/messages/[messageId]/branches" });
