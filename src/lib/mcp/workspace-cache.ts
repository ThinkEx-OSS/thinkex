import { loadWorkspaceState } from "@/lib/workspace/state-loader";
import type { AgentState } from "@/lib/workspace-state/types";

const stateCache = new Map<string, { state: AgentState; expiresAt: number }>();
const CACHE_TTL_MS = 30_000;
const CACHE_MAX_SIZE = 200;
const PRUNE_INTERVAL_MS = 60_000;

/**
 * Removes expired entries from stateCache and, when the map still exceeds
 * CACHE_MAX_SIZE after TTL pruning, evicts the oldest-inserted entries first
 * (Map iteration order is insertion order in V8).
 */
function pruneStateCache(): void {
  const now = Date.now();
  for (const [key, entry] of stateCache) {
    if (entry.expiresAt < now) {
      stateCache.delete(key);
    }
  }
  // Evict oldest entries when the cache is still over its size cap
  if (stateCache.size > CACHE_MAX_SIZE) {
    const overflow = stateCache.size - CACHE_MAX_SIZE;
    let evicted = 0;
    for (const key of stateCache.keys()) {
      stateCache.delete(key);
      if (++evicted >= overflow) break;
    }
  }
}

// Run periodic cleanup; the interval is unref'd so it won't keep the process
// alive in test/serverless environments that track active handles.
if (typeof setInterval !== "undefined") {
  const timer = setInterval(pruneStateCache, PRUNE_INTERVAL_MS);
  if (typeof timer === "object" && timer !== null && "unref" in timer) {
    (timer as NodeJS.Timeout).unref();
  }
}

export async function getCachedState(workspaceId: string): Promise<AgentState> {
  const cached = stateCache.get(workspaceId);
  if (cached && cached.expiresAt > Date.now()) return cached.state;

  // loadWorkspaceState throws on DB error, so any state that reaches here is
  // a genuine result (including legitimately empty new workspaces).
  const state = await loadWorkspaceState(workspaceId);
  stateCache.set(workspaceId, { state, expiresAt: Date.now() + CACHE_TTL_MS });
  return state;
}

export function invalidateWorkspaceCache(workspaceId: string) {
  stateCache.delete(workspaceId);
}
