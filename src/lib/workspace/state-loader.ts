import { db } from "@/lib/db/client";
import type { Item } from "@/lib/workspace-state/types";
import {
  assertWorkspaceProjectionReady,
  loadWorkspaceProjectionSnapshot,
} from "./workspace-items-projector";

export interface LoadWorkspaceStateOptions {
  userId?: string | null;
}

export interface WorkspaceStateSnapshot {
  state: Item[];
  version: number;
}

export async function loadWorkspaceStateSnapshot(
  workspaceId: string,
  options: LoadWorkspaceStateOptions = {},
): Promise<WorkspaceStateSnapshot> {
  return db.transaction(async (tx: any) => {
    await assertWorkspaceProjectionReady(tx, workspaceId);

    const snapshot = await loadWorkspaceProjectionSnapshot(tx, {
      workspaceId,
      userId: options.userId,
    });

    return {
      state: snapshot.items,
      version: snapshot.version,
    };
  });
}

export async function loadWorkspaceState(
  workspaceId: string,
  options: LoadWorkspaceStateOptions = {},
): Promise<Item[]> {
  const snapshot = await loadWorkspaceStateSnapshot(workspaceId, options);
  return snapshot.state;
}
