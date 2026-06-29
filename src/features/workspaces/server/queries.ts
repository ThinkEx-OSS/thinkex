import { and, asc, desc, eq, isNull, sql } from "drizzle-orm";

import { workspaceMembers, workspaces } from "#/db/schema";
import { createDbContext } from "#/db/server";
import type { WorkspacePage, WorkspaceSummary } from "#/features/workspaces/contracts";
import { getWorkspaceKernelPage } from "#/features/workspaces/kernel/workspace-kernel-access";
import { mapWorkspaceDetailRow, mapWorkspaceRow } from "#/features/workspaces/server/mappers";
import { getCurrentUserId } from "#/features/workspaces/server/permissions";

type Db = Awaited<ReturnType<typeof createDbContext>>["db"];

export async function listWorkspacesForCurrentUser(): Promise<WorkspaceSummary[]> {
	const [userId, dbContext] = await Promise.all([getCurrentUserId(), createDbContext()]);

	try {
		return await listWorkspacesForUser(dbContext.db, userId);
	} finally {
		await dbContext.dispose();
	}
}

export async function listWorkspacesForUser(db: Db, userId: string): Promise<WorkspaceSummary[]> {
	const rows = await db
		.select({
			workspace: workspaces,
			lastOpenedAt: workspaceMembers.lastOpenedAt,
			membershipRole: workspaceMembers.role,
		})
		.from(workspaceMembers)
		.innerJoin(workspaces, eq(workspaceMembers.workspaceId, workspaces.id))
		.where(and(eq(workspaceMembers.userId, userId), isNull(workspaces.archivedAt)))
		.orderBy(
			desc(sql`coalesce(${workspaceMembers.lastOpenedAt}, ${workspaces.createdAt})`),
			asc(workspaces.name),
		);

	return rows.map((row) =>
		mapWorkspaceRow(
			{
				...row.workspace,
				lastOpenedAt: row.lastOpenedAt,
			},
			row.membershipRole,
		),
	);
}

export async function getWorkspacePageForCurrentUser(
	workspaceId: string,
): Promise<WorkspacePage | null> {
	const [userId, dbContext] = await Promise.all([getCurrentUserId(), createDbContext()]);

	try {
		const [workspaceRow] = await dbContext.db
			.select({
				lastOpenedAt: workspaceMembers.lastOpenedAt,
				membershipRole: workspaceMembers.role,
				workspace: workspaces,
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

		if (!workspaceRow) {
			return null;
		}

		const workspace = mapWorkspaceDetailRow(
			{
				...workspaceRow.workspace,
				lastOpenedAt: workspaceRow.lastOpenedAt,
			},
			workspaceRow.membershipRole,
		);

		return await getWorkspaceKernelPage({
			workspaceId,
			userId,
			workspace,
		});
	} finally {
		await dbContext.dispose();
	}
}
