import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db/client";
import { chatThreads, chatMessages } from "@/lib/db/schema";
import {
  requireAuth,
  verifyWorkspaceAccess,
  verifyThreadOwnership,
} from "@/lib/api/workspace-helpers";
import { eq, and, asc } from "drizzle-orm";
import { withServerObservability } from "@/lib/with-server-observability";
import { logger } from "@/lib/utils/logger";
import {
  CHAT_DEBUG_TAG,
  summarizeMessage,
  summarizeRoster,
} from "@/lib/chat/debug";
import { CHAT_MESSAGE_FORMAT, hasMeaningfulContent } from "@/lib/chat/types";

async function getThreadAndVerify(id: string, userId: string) {
  const [thread] = await db
    .select()
    .from(chatThreads)
    .where(eq(chatThreads.id, id))
    .limit(1);

  if (!thread) {
    throw NextResponse.json({ error: "Thread not found" }, { status: 404 });
  }

  await verifyWorkspaceAccess(thread.workspaceId, userId);
  verifyThreadOwnership(thread, userId);

  return thread;
}

/**
 * GET /api/threads/[id]/messages
 * Loads the persisted UIMessage history for the new chat runtime. Only rows
 * written by the post-migration chat API (`format = 'ai-sdk-ui/v1'`) are
 * returned. Legacy `ai-sdk/v6` rows stay on disk and are intentionally hidden
 * from the new UI until a backfill script rewrites them.
 */
export const GET = withServerObservability(
  async function GET(
    _req: NextRequest,
    { params }: { params: Promise<{ id: string }> },
  ) {
    try {
      const userId = await requireAuth();
      const { id } = await params;

      await getThreadAndVerify(id, userId);

      // Pull `messageId` and `format` too so the debug log can show the full
      // row identity if hydration ever returns something unexpected.
      const rows = await db
        .select({
          messageId: chatMessages.messageId,
          format: chatMessages.format,
          content: chatMessages.content,
          createdAt: chatMessages.createdAt,
        })
        .from(chatMessages)
        .where(
          and(
            eq(chatMessages.threadId, id),
            eq(chatMessages.format, CHAT_MESSAGE_FORMAT),
          ),
        )
        .orderBy(asc(chatMessages.createdAt));

      // content is a stored UIMessage object; no reshaping required.
      // Drop any pre-existing rows whose stored content has no meaningful
      // parts (empty or `step-start`-only) so corrupted history from before
      // the persistence guard never poisons hydrated `useChat` state.
      const messages = rows
        .map((r) => r.content)
        .filter((content) => hasMeaningfulContent(content));

      // [chat-debug] Snapshot what's actually in the DB for this thread so
      // we can correlate against what the client receives. If the assistant
      // rows here have `partCount=0`, the bug is in /api/chat onFinish; if
      // they look correct, the bug is downstream (transport, hydration,
      // render).
      logger.info(`${CHAT_DEBUG_TAG} GET /api/threads/[id]/messages`, {
        threadId: id,
        rowCount: rows.length,
        roster: summarizeRoster(messages as unknown[]),
        rows: rows.map((r) => ({
          messageId: r.messageId,
          format: r.format,
          createdAt: r.createdAt,
          content: summarizeMessage(r.content),
        })),
      });

      return NextResponse.json({ messages });
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

// NOTE: a DELETE handler used to live here for the edit-user-message flow.
// It was removed once the chat route started honoring the SDK's native
// `regenerate-message` trigger and truncating persisted history server-side
// in `onFinish`. See `src/app/api/chat/route.ts`.
