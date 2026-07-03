import { createDbContext } from "#/db/server";
import type { WorkspaceSummary } from "#/features/workspaces/contracts";
import {
	assertAccountAccessScope,
	type AccountAccessContext,
} from "#/features/workspaces/operations/account-access-context";
import { listWorkspacesForUser } from "#/features/workspaces/server/queries";

export interface ListAccountWorkspacesOperationResult {
	workspaces: WorkspaceSummary[];
}

export async function listAccountWorkspacesOperation(
	context: AccountAccessContext,
): Promise<ListAccountWorkspacesOperationResult> {
	assertAccountAccessScope(context, "workspaces:read");
	const dbContext = await createDbContext();

	try {
		return {
			workspaces: await listWorkspacesForUser(dbContext.db, context.actor.userId),
		};
	} finally {
		await dbContext.dispose();
	}
}
