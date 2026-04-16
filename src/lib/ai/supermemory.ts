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
    return withSupermemory(model as never, userId, {
      apiKey,
      mode: "full",
      addMemory: "always",
      ...(threadId &&
      typeof threadId === "string" &&
      threadId !== "DEFAULT_THREAD_ID"
        ? { conversationId: threadId }
        : {}),
      verbose: process.env.NODE_ENV === "development",
    }) as unknown as T;
  } catch (error) {
    logger.error("🧠 [SUPERMEMORY] Failed to apply middleware:", {
      error: error instanceof Error ? error.message : String(error),
    });
    return model;
  }
}
