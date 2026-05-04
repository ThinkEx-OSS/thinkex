import { db } from "@/lib/db/client";
import { workspaceItemUserState } from "@/lib/db/schema";
import { and, eq } from "drizzle-orm";
import type { QuizProgressState } from "@/lib/workspace-state/quiz-progress-types";

export async function loadQuizProgress(
  workspaceId: string,
  itemId: string,
  userId: string,
): Promise<QuizProgressState | null> {
  const rows = await db
    .select({ state: workspaceItemUserState.state })
    .from(workspaceItemUserState)
    .where(
      and(
        eq(workspaceItemUserState.workspaceId, workspaceId),
        eq(workspaceItemUserState.itemId, itemId),
        eq(workspaceItemUserState.userId, userId),
        eq(workspaceItemUserState.stateKey, "quiz_progress"),
      ),
    )
    .limit(1);

  if (rows.length === 0) return null;
  const state = rows[0].state as QuizProgressState;
  if (!state || !Array.isArray(state.answers)) return null;
  return state;
}
