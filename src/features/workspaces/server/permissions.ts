import { getRequestHeaders } from "@tanstack/react-start/server";
import { and, eq, isNull } from "drizzle-orm";

import { workspaceMembers, workspaces } from "#/db/schema";
import type { createDbContext } from "#/db/server";
import type { WorkspaceMembershipRole } from "#/features/workspaces/contracts";
import { canGrantRole } from "#/features/workspaces/invites/workspace-invite-rules";
import { getWorkspaceMemberCapabilities } from "#/features/workspaces/workspace-member-capabilities";
import { getSessionFromHeaders } from "#/lib/auth-queries.server";

type Db = Awaited<ReturnType<typeof createDbContext>>["db"];
type WorkspaceRole = WorkspaceMembershipRole;

export class WorkspaceAuthError extends Error {
	constructor() {
		super("Unauthorized");
		this.name = "WorkspaceAuthError";
	}
}

export class WorkspaceForbiddenError extends Error {
	constructor() {
		super("Forbidden");
		this.name = "WorkspaceForbiddenError";
	}
}

export async function getCurrentUserId() {
	const session = await getSessionFromHeaders(getRequestHeaders());
	const userId = session?.user.id;

	if (!userId) {
		throw new WorkspaceAuthError();
	}

	return userId;
}

export async function getWorkspaceMemberRole(
	db: Db,
	input: { workspaceId: string; userId: string },
): Promise<WorkspaceMembershipRole | null> {
	const [membership] = await db
		.select({ role: workspaceMembers.role })
		.from(workspaceMembers)
		.innerJoin(workspaces, eq(workspaceMembers.workspaceId, workspaces.id))
		.where(
			and(
				eq(workspaceMembers.workspaceId, input.workspaceId),
				eq(workspaceMembers.userId, input.userId),
				isNull(workspaces.archivedAt),
			),
		)
		.limit(1);

	return membership?.role ?? null;
}

export async function canReadWorkspace(db: Db, input: { workspaceId: string; userId: string }) {
	const role = await getWorkspaceMemberRole(db, input);
	return role !== null;
}

export async function assertCanReadWorkspace(
	db: Db,
	input: { workspaceId: string; userId: string },
) {
	if (!(await canReadWorkspace(db, input))) {
		throw new WorkspaceForbiddenError();
	}
}

export async function assertCanMutateWorkspace(
	db: Db,
	input: { workspaceId: string; userId: string },
) {
	const role = await getWorkspaceMemberRole(db, input);

	if (!role || !getWorkspaceMemberCapabilities(role).canMutateContent) {
		throw new WorkspaceForbiddenError();
	}
}

export async function assertCanDeleteWorkspace(
	db: Db,
	input: { workspaceId: string; userId: string },
) {
	const role = await getWorkspaceMemberRole(db, input);

	if (role !== "owner") {
		throw new WorkspaceForbiddenError();
	}
}

export async function assertCanGrantWorkspaceRole(
	db: Db,
	input: { workspaceId: string; userId: string; role: WorkspaceRole },
) {
	const memberRole = await getWorkspaceMemberRole(db, input);

	if (!memberRole || !canGrantRole(memberRole, input.role)) {
		throw new WorkspaceForbiddenError();
	}

	return memberRole;
}
