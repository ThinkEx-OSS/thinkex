import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db/client";
import { chatThreads, chatMessages } from "@/lib/db/schema";
import { requireAuth, getThreadAndVerify } from "@/lib/api/workspace-helpers";
import { eq, and, desc } from "drizzle-orm";
import { withServerObservability } from "@/lib/with-server-observability";

/**
 * GET /api/threads/[id]/messages?format=ai-sdk/v6
 * Load messages for a thread. Format filter is strict (ai-sdk/v6 only).
 */
export const GET = withServerObservability(
  async function GET(
    req: NextRequest,
    { params }: { params: Promise<{ id: string }> },
  ) {
    try {
      const userId = await requireAuth();
      const { id } = await params;
      const { searchParams } = new URL(req.url);
      const format = searchParams.get("format") ?? "ai-sdk/v6";

      const thread = await getThreadAndVerify(id, userId);

      const rows = await db
        .select()
        .from(chatMessages)
        .where(
          and(eq(chatMessages.threadId, id), eq(chatMessages.format, format)),
        )
        .orderBy(desc(chatMessages.createdAt));

      const messages = rows.map((r) => ({
        id: r.messageId,
        parent_id: r.parentId,
        format: r.format,
        content: r.content,
        created_at: r.createdAt,
      }));

      return NextResponse.json({
        messages,
        headId: thread.headMessageId ?? undefined,
      });
    } catch (error) {
      if (error instanceof Response) return error;
      console.error("[threads] messages GET error:", error);
      return NextResponse.json(
        { error: "Internal server error" },
        { status: 500 },
      );
    }
  },
  { routeName: "GET /api/threads/[id]/messages" },
);

/**
 * POST /api/threads/[id]/messages
 * Append a message to a thread
 */
export const POST = withServerObservability(
  async function POST(
    req: NextRequest,
    { params }: { params: Promise<{ id: string }> },
  ) {
    try {
      const userId = await requireAuth();
      const { id } = await params;
      const body = await req.json().catch(() => ({}));
      const { messageId, parentId, format, content } = body;

      if (!messageId || !format || content === undefined) {
        return NextResponse.json(
          { error: "messageId, format, and content are required" },
          { status: 400 },
        );
      }

      await getThreadAndVerify(id, userId);

      try {
        await db.transaction(async (tx) => {
          const [freshThread] = await tx
            .select({ headMessageId: chatThreads.headMessageId })
            .from(chatThreads)
            .where(eq(chatThreads.id, id))
            .limit(1);

          await tx.insert(chatMessages).values({
            threadId: id,
            messageId: String(messageId),
            parentId: parentId ?? null,
            format: String(format),
            content: typeof content === "object" ? content : { raw: content },
          });

          // Only update headMessageId when appending to the current head
          // (avoids overwriting explicit branch head set via PATCH)
          const shouldUpdateHead =
            freshThread?.headMessageId == null ||
            (parentId != null && parentId === freshThread?.headMessageId);
          const updates: {
            lastMessageAt: string;
            updatedAt: string;
            headMessageId?: string;
          } = {
            lastMessageAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          };
          if (shouldUpdateHead) updates.headMessageId = String(messageId);

          await tx
            .update(chatThreads)
            .set(updates)
            .where(eq(chatThreads.id, id));
        });
      } catch (txError: unknown) {
        const err = txError as { code?: string };
        if (err?.code === "23505") {
          return NextResponse.json(
            { error: "Message already exists (duplicate messageId)" },
            { status: 409 },
          );
        }
        throw txError;
      }

      return NextResponse.json({ ok: true });
    } catch (error) {
      if (error instanceof Response) return error;
      console.error("[threads] messages POST error:", error);
      return NextResponse.json(
        { error: "Internal server error" },
        { status: 500 },
      );
    }
  },
  { routeName: "POST /api/threads/[id]/messages" },
);
