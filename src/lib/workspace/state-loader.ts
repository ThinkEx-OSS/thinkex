import { db } from "@/lib/db/client";
import type { Item } from "@/lib/workspace-state/types";
import { initialItems } from "@/lib/workspace-state/state";
import {
  getLatestWorkspaceEventVersion,
  loadWorkspaceProjectionSnapshot,
  syncWorkspaceProjectionToVersion,
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
  try {
    return await db.transaction(async (tx: any) => {
      const latestVersion = await getLatestWorkspaceEventVersion(
        tx,
        workspaceId,
      );
      await syncWorkspaceProjectionToVersion(tx, workspaceId, latestVersion);

      const snapshot = await loadWorkspaceProjectionSnapshot(tx, {
        workspaceId,
        userId: options.userId,
      });

      return {
        state: snapshot.items,
        version: snapshot.version,
      };
    });
  } catch (error) {
    console.error(
      "Error loading workspace state from projection tables:",
      error,
    );
    return {
      state: initialItems,
      version: 0,
    };
  }
}

export async function loadWorkspaceState(
  workspaceId: string,
  options: LoadWorkspaceStateOptions = {},
): Promise<Item[]> {
  const snapshot = await loadWorkspaceStateSnapshot(workspaceId, options);
  return snapshot.state;
}
