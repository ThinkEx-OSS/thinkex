import {
  db,
  workspaceItemContent,
  workspaceItemExtracted,
  workspaceItemProjectionState,
  workspaceItems,
  workspaceItemUserState,
  workspaces,
} from "@/lib/db/client";
import { asc, eq } from "drizzle-orm";
import {
  getLatestWorkspaceEventVersion,
  syncWorkspaceProjectionToVersion,
  type WorkspaceProjectionClient,
} from "./workspace-items-projector";

export interface WorkspaceProjectionBackfillResult {
  workspaceId: string;
  lastAppliedVersion: number;
}

async function resetWorkspaceProjection(
  client: WorkspaceProjectionClient,
  workspaceId: string,
): Promise<void> {
  await client
    .delete(workspaceItemUserState)
    .where(eq(workspaceItemUserState.workspaceId, workspaceId));
  await client
    .delete(workspaceItemContent)
    .where(eq(workspaceItemContent.workspaceId, workspaceId));
  await client
    .delete(workspaceItemExtracted)
    .where(eq(workspaceItemExtracted.workspaceId, workspaceId));
  await client
    .delete(workspaceItems)
    .where(eq(workspaceItems.workspaceId, workspaceId));
  await client
    .delete(workspaceItemProjectionState)
    .where(eq(workspaceItemProjectionState.workspaceId, workspaceId));
}

export async function backfillWorkspaceProjection(
  workspaceId: string,
): Promise<WorkspaceProjectionBackfillResult> {
  return db.transaction(async (tx: any) => {
    await resetWorkspaceProjection(tx, workspaceId);
    const latestEventVersion = await getLatestWorkspaceEventVersion(
      tx,
      workspaceId,
    );
    const lastAppliedVersion = await syncWorkspaceProjectionToVersion(
      tx,
      workspaceId,
      latestEventVersion,
    );

    return {
      workspaceId,
      lastAppliedVersion,
    };
  });
}

export async function listWorkspaceIdsForProjectionBackfill(): Promise<
  string[]
> {
  const rows = await db
    .select({ id: workspaces.id })
    .from(workspaces)
    .orderBy(asc(workspaces.createdAt), asc(workspaces.id));

  return rows.map((row) => row.id);
}

export async function backfillAllWorkspaceProjections(
  options: {
    workspaceIds?: string[];
  } = {},
): Promise<WorkspaceProjectionBackfillResult[]> {
  const workspaceIds =
    options.workspaceIds ?? (await listWorkspaceIdsForProjectionBackfill());
  const results: WorkspaceProjectionBackfillResult[] = [];

  for (const workspaceId of workspaceIds) {
    results.push(await backfillWorkspaceProjection(workspaceId));
  }

  return results;
}
