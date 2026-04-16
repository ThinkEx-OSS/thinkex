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

  // HOTFIX KILL SWITCH (see ENG-059 follow-up).
  //
  // Published `@supermemory/tools@1.4.1` wraps the language model with
  // `{ ...model, doGenerate, doStream }`. In AI SDK v6, `specificationVersion`,
  // `provider`, `modelId`, and `supportedUrls` live on the LanguageModelV3
  // prototype — spread drops them, so `streamText` throws
  // `AI_UnsupportedModelVersionError: ... specification version "v2"`.
  //
  // Upstream PR https://github.com/supermemoryai/supermemory/pull/854 (merged
  // into main as commit 76b0f27) replaces the spread with a Proxy. As of
  // April 16 2026 that fix is NOT yet published to npm — `latest` is still
  // 1.4.1 from March 19.
  //
  // Until a fixed version (expected 1.4.2+) is published:
  //   - Disabled/unset: wrapper is a no-op. UI toggle is cosmetic but all
  //     other plumbing (UI state, transport field, PostHog property, route
  //     body read) stays intact.
  //   - Enabled with the literal string "true": wrapper runs as before. Only
  //     set this AFTER bumping `@supermemory/tools` to a version containing
  //     PR #854.
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
