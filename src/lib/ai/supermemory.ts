import "server-only";

import { withSupermemory } from "@supermemory/tools/ai-sdk";

import { logger } from "@/lib/utils/logger";

type SupermemoryWrapOptions = {
  userId: string;
  threadId?: string | null;
  memoryEnabled: boolean;
};

export function maybeWithSupermemory<T>(
  model: T,
  options: SupermemoryWrapOptions,
): T {
  const { userId, threadId, memoryEnabled } = options;

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

    return withSupermemory(model as never, {
      containerTag: userId,
      customId,
      apiKey,
      mode: "full",
      addMemory: "always",
      verbose: process.env.NODE_ENV === "development",
    }) as unknown as T;
  } catch (error) {
    logger.error("🧠 [SUPERMEMORY] Failed to apply middleware:", {
      error: error instanceof Error ? error.message : String(error),
    });
    return model;
  }
}
