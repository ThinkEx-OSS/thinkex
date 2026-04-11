import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db/client";
import { chatMessages } from "@/lib/db/schema";
import { requireAuth, getThreadAndVerify } from "@/lib/api/workspace-helpers";
import { eq, and } from "drizzle-orm";
import { withServerObservability } from "@/lib/with-server-observability";

/**
 * PATCH /api/threads/[id]/messages/[messageId]
 * Update an existing message (e.g. step timestamps/duration from useExternalHistory)
 */
export const PATCH = withServerObservability(
  async function PATCH(
    req: NextRequest,
    { params }: { params: Promise<{ id: string; messageId: string }> },
  ) {
    try {
      const userId = await requireAuth();
      const { id: threadId, messageId } = await params;
      const body = await req.json().catch(() => ({}));
      const { content } = body;

      if (content === undefined) {
        return NextResponse.json(
          { error: "content is required" },
          { status: 400 },
        );
      }

      await getThreadAndVerify(threadId, userId);

      const [updated] = await db
        .update(chatMessages)
        .set({
          content: typeof content === "object" ? content : { raw: content },
        })
        .where(
          and(
            eq(chatMessages.threadId, threadId),
            eq(chatMessages.messageId, messageId),
          ),
        )
        .returning({ messageId: chatMessages.messageId });

      if (!updated) {
        return NextResponse.json(
          { error: "Message not found" },
          { status: 404 },
        );
      }

      return NextResponse.json({ ok: true });
    } catch (error) {
      if (error instanceof Response) return error;
      console.error("[threads] messages PATCH error:", error);
      return NextResponse.json(
        { error: "Internal server error" },
        { status: 500 },
      );
    }
  },
  { routeName: "PATCH /api/threads/[id]/messages/[messageId]" },
);
