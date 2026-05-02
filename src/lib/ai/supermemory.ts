import "server-only";

import { withSupermemory } from "@supermemory/tools/ai-sdk";

import { logger } from "@/lib/utils/logger";

/** Supermemory ingest constraint on `containerTag` (see SDK `DocumentAddParams`). */
const MAX_CONTAINER_TAG_LENGTH = 100;

type SupermemoryWrapOptions = {
  userId: string;
  workspaceId: string;
  threadId?: string | null;
  memoryEnabled: boolean;
};

export function maybeWithSupermemory<T>(
  model: T,
  options: SupermemoryWrapOptions,
): T {
  const { userId, workspaceId, threadId, memoryEnabled } = options;

  // Server-side kill switch. Neutralizes the wrapper without touching UI,
  // state, or transport plumbing — set the env to `false` to
  // disable if upstream regresses or we need to bisect prod issues.
  // History: disabled in ENG-061 when @supermemory/tools@1.4.1 broke AI SDK
  // v6 (see https://github.com/supermemoryai/supermemory/pull/854); re-enabled
  // in ENG-062 on @supermemory/tools@1.4.3+.
  if (process.env.SUPERMEMORY_ENABLED !== "true") {
    return model;
  }

  if (!memoryEnabled) return model;
  if (!userId) return model;
  if (!workspaceId?.trim()) {
    logger.warn(
      "🧠 [SUPERMEMORY] memoryEnabled=true but workspaceId is missing; skipping memory injection",
    );
    return model;
  }

  const apiKey = process.env.SUPERMEMORY_API_KEY;
  if (!apiKey) {
    logger.warn(
      "🧠 [SUPERMEMORY] memoryEnabled=true but SUPERMEMORY_API_KEY is not set; skipping memory injection",
    );
    return model;
  }

  try {
    const customId =
      threadId &&
      typeof threadId === "string" &&
      threadId !== "DEFAULT_THREAD_ID"
        ? threadId
        : `user:${userId}`;

    const containerTag = `${userId}_${workspaceId}`;
    if (containerTag.length > MAX_CONTAINER_TAG_LENGTH) {
      logger.warn(
        "🧠 [SUPERMEMORY] workspace-scoped containerTag exceeds limit; skipping memory injection",
        { length: containerTag.length },
      );
      return model;
    }

    return withSupermemory(model as never, {
      containerTag,
      customId,
      apiKey,
      mode: "full" as const,
      addMemory: "always" as const,
      verbose: process.env.NODE_ENV === "development",
    }) as unknown as T;
  } catch (error) {
    logger.error("🧠 [SUPERMEMORY] Failed to apply middleware:", {
      error: error instanceof Error ? error.message : String(error),
    });
    return model;
  }
}
