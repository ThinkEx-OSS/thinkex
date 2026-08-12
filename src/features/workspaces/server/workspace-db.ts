import { createDbContext, withDb } from "#/db/server";

import { getCurrentUserId } from "#/features/workspaces/server/permissions";

type Db = Awaited<ReturnType<typeof createDbContext>>["db"];

export type WorkspaceDbContext = {
	db: Db;
	userId: string;
};

export async function withWorkspaceDb<T>(
	handler: (context: WorkspaceDbContext) => Promise<T>,
): Promise<T> {
	const userId = await getCurrentUserId();
	return await withDb((db) => handler({ db, userId }));
}

export { withDb };
