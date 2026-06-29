import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import {
	workspaceIdInputSchema,
	workspaceMembershipRoleSchema,
} from "#/features/workspaces/contracts";
import {
	listWorkspaceMembers,
	removeWorkspaceMember,
	updateWorkspaceMemberRole,
} from "#/features/workspaces/members/workspace-members.server";
import { withWorkspaceDb } from "#/features/workspaces/server/workspace-db";

const workspaceMemberTargetSchema = z.object({
	workspaceId: z.string().min(1),
	userId: z.string().min(1),
});

const updateWorkspaceMemberRoleInputSchema = z.object({
	workspaceId: z.string().min(1),
	userId: z.string().min(1),
	role: workspaceMembershipRoleSchema,
});

export const listWorkspaceMembersFn = createServerFn({ method: "GET" })
	.validator(workspaceIdInputSchema)
	.handler(async ({ data }) =>
		withWorkspaceDb(({ db, userId }) =>
			listWorkspaceMembers(db, {
				workspaceId: data.workspaceId,
				userId,
			}),
		),
	);

export const updateWorkspaceMemberRoleFn = createServerFn({ method: "POST" })
	.validator(updateWorkspaceMemberRoleInputSchema)
	.handler(async ({ data }) =>
		withWorkspaceDb(({ db, userId }) =>
			updateWorkspaceMemberRole(db, {
				workspaceId: data.workspaceId,
				actorUserId: userId,
				targetUserId: data.userId,
				role: data.role,
			}),
		),
	);

export const removeWorkspaceMemberFn = createServerFn({ method: "POST" })
	.validator(workspaceMemberTargetSchema)
	.handler(async ({ data }) =>
		withWorkspaceDb(({ db, userId }) =>
			removeWorkspaceMember(db, {
				workspaceId: data.workspaceId,
				actorUserId: userId,
				targetUserId: data.userId,
			}),
		),
	);
