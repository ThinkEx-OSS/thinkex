import { and, eq, isNull } from "drizzle-orm";

import { workspaceMembers, workspaces } from "#/db/schema";
import { createDbContext } from "#/db/server";
import type { AIThreadPromptScope } from "#/features/workspaces/ai/ai-thread-metadata";
import { getWorkspaceMemberCapabilities } from "#/features/workspaces/workspace-member-capabilities";

export async function getWorkspacePromptScope({
	userId,
	workspaceId,
}: {
	userId: string;
	workspaceId: string;
}): Promise<AIThreadPromptScope> {
	const dbContext = await createDbContext();

	try {
		const [membership] = await dbContext.db
			.select({
				name: workspaces.name,
				role: workspaceMembers.role,
			})
			.from(workspaceMembers)
			.innerJoin(workspaces, eq(workspaceMembers.workspaceId, workspaces.id))
			.where(
				and(
					eq(workspaceMembers.workspaceId, workspaceId),
					eq(workspaceMembers.userId, userId),
					isNull(workspaces.archivedAt),
				),
			)
			.limit(1);

		if (!membership) {
			throw new Error("Forbidden");
		}

		return {
			canMutate: getWorkspaceMemberCapabilities(membership.role).canMutateContent,
			workspaceName: membership.name,
		};
	} finally {
		await dbContext.dispose();
	}
}
