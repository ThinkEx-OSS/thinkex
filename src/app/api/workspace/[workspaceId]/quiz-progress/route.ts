import { NextRequest, NextResponse } from "next/server";
import { eq, and } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { workspaceItemUserState } from "@/lib/db/schema";
import {
  requireAuth,
  verifyWorkspaceAccess,
  withErrorHandling,
} from "@/lib/api/workspace-helpers";
import type { QuizProgressState } from "@/lib/workspace-state/quiz-progress-types";

const STATE_KEY = "quiz_progress";
const STATE_TYPE = "quiz_progress";

async function handleGET(
  _request: NextRequest,
  { params }: { params: Promise<{ workspaceId: string }> },
) {
  const userId = await requireAuth();
  const { workspaceId } = await params;

  await verifyWorkspaceAccess(workspaceId, userId);

  const itemId = _request.nextUrl.searchParams.get("itemId");
  if (!itemId) {
    return NextResponse.json({ error: "itemId is required" }, { status: 400 });
  }

  const [row] = await db
    .select({ state: workspaceItemUserState.state })
    .from(workspaceItemUserState)
    .where(
      and(
        eq(workspaceItemUserState.workspaceId, workspaceId),
        eq(workspaceItemUserState.itemId, itemId),
        eq(workspaceItemUserState.userId, userId),
        eq(workspaceItemUserState.stateKey, STATE_KEY),
      ),
    )
    .limit(1);

  return NextResponse.json({ state: (row?.state as QuizProgressState) ?? null });
}

async function handlePUT(
  request: NextRequest,
  { params }: { params: Promise<{ workspaceId: string }> },
) {
  const userId = await requireAuth();
  const { workspaceId } = await params;

  await verifyWorkspaceAccess(workspaceId, userId);

  const body = await request.json();
  const { itemId, state } = body as { itemId: string; state: QuizProgressState };

  if (!itemId || !state) {
    return NextResponse.json(
      { error: "itemId and state are required" },
      { status: 400 },
    );
  }

  await db
    .insert(workspaceItemUserState)
    .values({
      workspaceId,
      itemId,
      userId,
      stateKey: STATE_KEY,
      stateType: STATE_TYPE,
      stateSchemaVersion: 1,
      state: state as unknown as Record<string, unknown>,
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: [
        workspaceItemUserState.workspaceId,
        workspaceItemUserState.itemId,
        workspaceItemUserState.userId,
        workspaceItemUserState.stateKey,
      ],
      set: {
        state: state as unknown as Record<string, unknown>,
        stateSchemaVersion: 1,
        updatedAt: new Date(),
      },
    });

  return NextResponse.json({ success: true });
}

export const GET = withErrorHandling(handleGET, "GET /api/workspace/[workspaceId]/quiz-progress");

export const PUT = withErrorHandling(handlePUT, "PUT /api/workspace/[workspaceId]/quiz-progress");
