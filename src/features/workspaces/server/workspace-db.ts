import { createDbContext } from "#/db/server";

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
	const dbContext = await createDbContext();

	try {
		return await handler({ db: dbContext.db, userId });
	} finally {
		await dbContext.dispose();
	}
}

export async function withDb<T>(handler: (db: Db) => Promise<T>): Promise<T> {
	const dbContext = await createDbContext();

	try {
		return await handler(dbContext.db);
	} finally {
		await dbContext.dispose();
	}
}
