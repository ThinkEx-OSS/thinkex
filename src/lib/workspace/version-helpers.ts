import type { EventResponse } from "./events";

/**
 * Compute the effective base version for a new mutation, accounting for:
 * 1. The cache's stored version field
 * 2. The max version from individual events (may be higher after tool events)
 * 3. Pending optimistic events that will increment the server version
 */
export function computeBaseVersion(
  cacheData: EventResponse | undefined,
): { baseVersion: number; currentVersion: number; optimisticCount: number } {
  const events = cacheData?.events ?? [];

  const optimisticCount = events.filter(
    (e) => typeof e.version !== "number",
  ).length;

  const maxEventVersion = events
    .filter((e) => typeof e.version === "number")
    .reduce((max, e) => Math.max(max, e.version!), cacheData?.version ?? 0);

  const currentVersion = Math.max(cacheData?.version ?? 0, maxEventVersion);

  const baseVersion = currentVersion + Math.max(0, optimisticCount - 1);

  return { baseVersion, currentVersion, optimisticCount };
}

/**
 * Remove a single optimistic event from the cache by ID.
 */
export function removeOptimisticEvent(
  cache: EventResponse | undefined,
  eventId: string,
  newVersion?: number,
): EventResponse | undefined {
  if (!cache) return cache;
  return {
    ...cache,
    events: cache.events.filter((e) => e.id !== eventId),
    ...(newVersion !== undefined && { version: newVersion }),
  };
}

/**
 * Confirm an optimistic event by stamping its server-assigned version.
 */
export function confirmOptimisticEvent(
  cache: EventResponse | undefined,
  eventId: string,
  serverVersion: number,
): EventResponse | undefined {
  if (!cache) return cache;
  return {
    ...cache,
    events: cache.events.map((e) =>
      e.id === eventId ? { ...e, version: serverVersion } : e,
    ),
    version: serverVersion,
  };
}
