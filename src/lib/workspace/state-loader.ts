import { db } from "@/lib/db/client";
import { logger } from "@/lib/utils/logger";
import type { Item } from "@/lib/workspace-state/types";
import { loadWorkspaceProjectionState } from "./workspace-items-projector";

export interface LoadWorkspaceStateOptions {
  userId?: string | null;
}

export interface WorkspaceStatePayload {
  state: Item[];
  version: number;
}

export async function loadWorkspaceStatePayload(
  workspaceId: string,
  options: LoadWorkspaceStateOptions = {},
): Promise<WorkspaceStatePayload> {
  return db.transaction(async (tx: any) => {
    const projection = await loadWorkspaceProjectionState(tx, {
      workspaceId,
      userId: options.userId,
    });

    return {
      state: projection.items,
      version: projection.version,
    };
  });
}

export async function loadWorkspaceState(
  workspaceId: string,
  options: LoadWorkspaceStateOptions = {},
): Promise<Item[]> {
  const statePayload = await loadWorkspaceStatePayload(workspaceId, options);
  return statePayload.state;
}
