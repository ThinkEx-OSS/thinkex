import { loadWorkspaceState } from "@/lib/workspace/state-loader";
import type { AgentState } from "@/lib/workspace-state/types";

const stateCache = new Map<string, { state: AgentState; expiresAt: number }>();
const CACHE_TTL_MS = 30_000;

export async function getCachedState(workspaceId: string): Promise<AgentState> {
  const cached = stateCache.get(workspaceId);
  if (cached && cached.expiresAt > Date.now()) return cached.state;

  const state = await loadWorkspaceState(workspaceId);
  stateCache.set(workspaceId, { state, expiresAt: Date.now() + CACHE_TTL_MS });
  return state;
}

export function invalidateWorkspaceCache(workspaceId: string) {
  stateCache.delete(workspaceId);
}
