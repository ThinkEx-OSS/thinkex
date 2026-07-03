import { createDbContext } from "#/db/server";
import type { WorkspaceSummary } from "#/features/workspaces/contracts";
import {
	assertAccountCapabilityScope,
	type AccountCapabilityContext,
} from "#/features/workspaces/capabilities/account-capability-context";
import { listWorkspacesForUser } from "#/features/workspaces/server/queries";

export interface ListAccountCapabilityWorkspacesResult {
	workspaces: WorkspaceSummary[];
}

export async function listAccountCapabilityWorkspaces(
	context: AccountCapabilityContext,
): Promise<ListAccountCapabilityWorkspacesResult> {
	assertAccountCapabilityScope(context, "workspaces:read");
	const dbContext = await createDbContext();

	try {
		return {
			workspaces: await listWorkspacesForUser(dbContext.db, context.actor.userId),
		};
	} finally {
		await dbContext.dispose();
	}
}
