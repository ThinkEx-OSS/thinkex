import { sql } from "drizzle-orm";
import { db } from "@/lib/db/client";

export type WorkspaceProjectionLockClient = Pick<typeof db, "execute">;

export async function acquireWorkspaceProjectionLock(
  client: WorkspaceProjectionLockClient,
  workspaceId: string,
): Promise<void> {
  await client.execute(sql`
    SELECT pg_advisory_xact_lock(hashtextextended(${workspaceId}::text, 0))
  `);
}
