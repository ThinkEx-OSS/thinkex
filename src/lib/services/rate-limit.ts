import { db } from "@/lib/db/client";
import { deepResearchUsage } from "@/lib/db/schema";
import { and, gte, eq, asc } from "drizzle-orm";
import { logger } from "@/lib/utils/logger";

const LIMIT = 2;
const WINDOW_MS = 24 * 60 * 60 * 1000; // 24 hours

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: Date | null;
}

export async function checkDeepResearchRateLimit(userId: string): Promise<RateLimitResult> {
  try {
    const windowStart = new Date(Date.now() - WINDOW_MS);

    const usages = await db
      .select({ createdAt: deepResearchUsage.createdAt })
      .from(deepResearchUsage)
      .where(
        and(
          eq(deepResearchUsage.userId, userId),
          gte(deepResearchUsage.createdAt, windowStart.toISOString())
        )
      )
      .orderBy(asc(deepResearchUsage.createdAt));

    const used = usages.length;
    const allowed = used < LIMIT;

    let resetAt: Date | null = null;
    if (!allowed && usages.length > 0) {
      const oldest = new Date(usages[0].createdAt);
      resetAt = new Date(oldest.getTime() + WINDOW_MS);
    }

    return { allowed, remaining: Math.max(0, LIMIT - used), resetAt };
  } catch (error) {
    logger.error("❌ [RATE-LIMIT] Error checking rate limit:", error);
    // On error, allow the request to proceed (fail-open)
    return { allowed: true, remaining: LIMIT, resetAt: null };
  }
}

export async function recordDeepResearchUsage(
  userId: string,
  workspaceId: string | null,
  interactionId: string,
  prompt: string
): Promise<void> {
  try {
    await db.insert(deepResearchUsage).values({
      userId,
      workspaceId: workspaceId ?? null,
      interactionId,
      prompt: prompt.slice(0, 500),
    });
  } catch (error) {
    logger.error("❌ [RATE-LIMIT] Error recording usage:", error);
    // Don't throw - recording failure shouldn't block the research
  }
}
