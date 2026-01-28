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
  error?: string;
}

/**
 * Atomically check rate limit and record usage in a single transaction.
 * Prevents race conditions where concurrent requests could bypass the limit.
 */
export async function checkAndRecordDeepResearchUsage(
  userId: string,
  workspaceId: string | null,
  interactionId: string
): Promise<RateLimitResult> {
  const windowStart = new Date(Date.now() - WINDOW_MS);

  try {
    return await db.transaction(async (tx) => {
      // Get usage count within the transaction
      const usages = await tx
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

      if (used >= LIMIT) {
        // Calculate reset time (ensure it's in the future)
        let resetAt: Date | null = null;
        if (usages.length > 0) {
          const oldest = new Date(usages[0].createdAt);
          const calculatedReset = new Date(oldest.getTime() + WINDOW_MS);
          // Ensure resetAt is always in the future (edge case protection)
          resetAt = calculatedReset > new Date()
            ? calculatedReset
            : new Date(Date.now() + 60000); // At least 1 min
        }
        return { allowed: false, remaining: 0, resetAt };
      }

      // Record usage within same transaction (atomic operation)
      await tx.insert(deepResearchUsage).values({
        userId,
        workspaceId: workspaceId ?? null,
        interactionId,
      });

      return { allowed: true, remaining: LIMIT - used - 1, resetAt: null };
    });
  } catch (error) {
    logger.error("❌ [RATE-LIMIT] Database error:", error);
    // Fail-closed: deny on error to prevent abuse during outages
    return {
      allowed: false,
      remaining: 0,
      resetAt: null,
      error: "Unable to verify usage limit. Please try again.",
    };
  }
}

/**
 * Read-only check for UI purposes (showing remaining count without recording).
 */
export async function getDeepResearchUsageStatus(
  userId: string
): Promise<{ remaining: number; resetAt: Date | null }> {
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

    const remaining = Math.max(0, LIMIT - usages.length);
    let resetAt: Date | null = null;

    if (remaining === 0 && usages.length > 0) {
      const oldest = new Date(usages[0].createdAt);
      const calculatedReset = new Date(oldest.getTime() + WINDOW_MS);
      resetAt = calculatedReset > new Date() ? calculatedReset : new Date(Date.now() + 60000);
    }

    return { remaining, resetAt };
  } catch {
    return { remaining: 0, resetAt: null };
  }
}
