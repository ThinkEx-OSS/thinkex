import { and, asc, eq } from "drizzle-orm";

import { user, workspaceMembers } from "#/db/schema";
import type { createDbContext } from "#/db/server";
import type { WorkspaceMemberSummary } from "#/features/workspaces/contracts";
import {
	canManageMember,
	type WorkspaceRole,
} from "#/features/workspaces/invites/workspace-invite-rules";
import {
	assertCanReadWorkspace,
	getWorkspaceMemberRole,
	WorkspaceForbiddenError,
} from "#/features/workspaces/server/permissions";

type Db = Awaited<ReturnType<typeof createDbContext>>["db"];

export async function listWorkspaceMembers(
	db: Db,
	input: { workspaceId: string; userId: string },
): Promise<WorkspaceMemberSummary[]> {
	await assertCanReadWorkspace(db, input);

	const rows = await db
		.select({
			userId: user.id,
			name: user.name,
			image: user.image,
			role: workspaceMembers.role,
		})
		.from(workspaceMembers)
		.innerJoin(user, eq(workspaceMembers.userId, user.id))
		.where(eq(workspaceMembers.workspaceId, input.workspaceId))
		.orderBy(asc(user.name));

	return rows;
}

export async function updateWorkspaceMemberRole(
	db: Db,
	input: {
		workspaceId: string;
		actorUserId: string;
		targetUserId: string;
		role: WorkspaceRole;
	},
) {
	if (input.role === "owner") {
		throw new WorkspaceForbiddenError();
	}

	await assertCanReadWorkspace(db, {
		workspaceId: input.workspaceId,
		userId: input.actorUserId,
	});

	const [actorRole, targetRole] = await Promise.all([
		getWorkspaceMemberRole(db, {
			workspaceId: input.workspaceId,
			userId: input.actorUserId,
		}),
		getWorkspaceMemberRole(db, {
			workspaceId: input.workspaceId,
			userId: input.targetUserId,
		}),
	]);

	if (
		!actorRole ||
		!targetRole ||
		!canManageMember(actorRole, targetRole) ||
		!canManageMember(actorRole, input.role)
	) {
		throw new WorkspaceForbiddenError();
	}

	await db
		.update(workspaceMembers)
		.set({ role: input.role })
		.where(
			and(
				eq(workspaceMembers.workspaceId, input.workspaceId),
				eq(workspaceMembers.userId, input.targetUserId),
			),
		);
}

export async function removeWorkspaceMember(
	db: Db,
	input: {
		workspaceId: string;
		actorUserId: string;
		targetUserId: string;
	},
) {
	await assertCanReadWorkspace(db, {
		workspaceId: input.workspaceId,
		userId: input.actorUserId,
	});

	const [actorRole, targetRole] = await Promise.all([
		getWorkspaceMemberRole(db, {
			workspaceId: input.workspaceId,
			userId: input.actorUserId,
		}),
		getWorkspaceMemberRole(db, {
			workspaceId: input.workspaceId,
			userId: input.targetUserId,
		}),
	]);

	if (!actorRole || !targetRole || !canManageMember(actorRole, targetRole)) {
		throw new WorkspaceForbiddenError();
	}

	await db
		.delete(workspaceMembers)
		.where(
			and(
				eq(workspaceMembers.workspaceId, input.workspaceId),
				eq(workspaceMembers.userId, input.targetUserId),
			),
		);
}
