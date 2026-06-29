import { createDbContext } from "#/db/server";
import { getWorkspaceMemberRole } from "#/features/workspaces/server/permissions";
import { getWorkspaceMemberCapabilities } from "#/features/workspaces/workspace-member-capabilities";
import { getSessionFromRequest } from "#/lib/auth-queries.server";

export interface DocumentSessionConnectionState {
	canMutate: boolean;
	userId: string;
}

export async function resolveDocumentSessionConnectionAccess(
	request: Request,
	workspaceId: string,
): Promise<DocumentSessionConnectionState | null> {
	const session = await getSessionFromRequest(request);

	if (!session?.user) {
		return null;
	}

	const dbContext = await createDbContext();

	try {
		const role = await getWorkspaceMemberRole(dbContext.db, {
			workspaceId,
			userId: session.user.id,
		});

		if (!role) {
			return null;
		}

		return {
			userId: session.user.id,
			canMutate: getWorkspaceMemberCapabilities(role).canMutateContent,
		};
	} finally {
		await dbContext.dispose();
	}
}
