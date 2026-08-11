import { and, asc, desc, eq, isNull, sql } from "drizzle-orm";

import { workspaceMembers, workspaces } from "#/db/schema";
import { createDbContext } from "#/db/server";
import type { WorkspacePage, WorkspaceSummary } from "#/features/workspaces/contracts";
import { getWorkspaceKernel } from "#/features/workspaces/kernel/workspace-kernel-access";
import { mapWorkspaceDetailRow, mapWorkspaceRow } from "#/features/workspaces/server/mappers";
import { getCurrentUserId } from "#/features/workspaces/server/permissions";

type Db = Awaited<ReturnType<typeof createDbContext>>["db"];

export async function listWorkspacesForCurrentUser(): Promise<WorkspaceSummary[]> {
	const userId = await getCurrentUserId();
	const dbContext = await createDbContext();

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
	const userId = await getCurrentUserId();
	return await getWorkspacePageForUser(workspaceId, userId);
}

export async function getWorkspacePageForUser(
	workspaceId: string,
	userId: string,
): Promise<WorkspacePage | null> {
	const dbContext = await createDbContext();
	let workspace: WorkspacePage["workspace"] | null;

	try {
		workspace = await getWorkspace(dbContext.db, workspaceId, userId);
	} finally {
		await dbContext.dispose();
	}

	if (!workspace) {
		return null;
	}

	const kernel = await getWorkspaceKernel(workspaceId);
	const page = await kernel.getPage({ userId });

	return {
		workspace,
		items: page.items,
		itemFacts: page.itemFacts,
		revision: page.revision,
	};
}

async function getWorkspace(
	db: Db,
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
