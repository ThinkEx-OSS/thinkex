import { and, asc, desc, eq, isNull, sql } from "drizzle-orm";

import { workspaceMembers, workspaces } from "#/db/schema";
import type { WorkspacePage, WorkspaceSummary } from "#/features/workspaces/contracts";
import {
	readWorkspacePageSnapshot,
	type QueryExecutor,
} from "#/features/workspaces/persistence/workspace-postgres-support";
import { mapWorkspaceDetailRow, mapWorkspaceRow } from "#/features/workspaces/server/mappers";
import { getCurrentUserId } from "#/features/workspaces/server/permissions";
import { withDb } from "#/features/workspaces/server/workspace-db";

export async function listWorkspacesForCurrentUser(): Promise<WorkspaceSummary[]> {
	const userId = await getCurrentUserId();
	return await withDb((db) => listWorkspacesForUser(db, userId));
}

export async function listWorkspacesForUser(
	db: QueryExecutor,
	userId: string,
): Promise<WorkspaceSummary[]> {
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
	const userId = await getCurrentUserId();
	return await getWorkspacePageForUser(workspaceId, userId);
}

export async function getWorkspacePageForUser(
	workspaceId: string,
	userId: string,
): Promise<WorkspacePage | null> {
	return await withDb((db) =>
		db.transaction(
			async (transaction) => {
				const workspace = await getWorkspace(transaction, workspaceId, userId);
				if (!workspace) return null;

				const page = await readWorkspacePageSnapshot(transaction, workspaceId);
				return {
					workspace,
					items: page.items,
					itemFacts: page.itemFacts,
					revision: page.revision,
				};
			},
			{ isolationLevel: "repeatable read" },
		),
	);
}

async function getWorkspace(
	db: QueryExecutor,
	workspaceId: string,
	userId: string,
): Promise<WorkspacePage["workspace"] | null> {
	const [workspaceRow] = await db
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

	return mapWorkspaceDetailRow(
		{
			...workspaceRow.workspace,
			lastOpenedAt: workspaceRow.lastOpenedAt,
		},
		workspaceRow.membershipRole,
	);
}
