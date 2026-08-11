import { createServerFn } from "@tanstack/react-start";
import { env } from "cloudflare:workers";
import { and, eq } from "drizzle-orm";
import { z } from "zod";

import { workspaceItems } from "#/db/schema";
import {
	workspaceIdInputSchema,
	workspaceMembershipRoleSchema,
} from "#/features/workspaces/contracts";
import {
	listWorkspaceMembers,
	removeWorkspaceMember,
	updateWorkspaceMemberRole,
} from "#/features/workspaces/members/workspace-members.server";
import { disconnectWorkspaceRoomMember } from "#/features/workspaces/realtime/workspace-room-notifier";
import {
	type WorkspaceDbContext,
	withWorkspaceDb,
} from "#/features/workspaces/server/workspace-db";

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
	.handler(async ({ data }) => {
		const documentItemIds = await withWorkspaceDb(async ({ db, userId }) => {
			await updateWorkspaceMemberRole(db, {
				workspaceId: data.workspaceId,
				actorUserId: userId,
				targetUserId: data.userId,
				role: data.role,
			});
			return await listWorkspaceDocumentItemIds(db, data.workspaceId);
		});
		await disconnectWorkspaceRoomMember(env, { ...data, documentItemIds });
	});

export const removeWorkspaceMemberFn = createServerFn({ method: "POST" })
	.validator(workspaceMemberTargetSchema)
	.handler(async ({ data }) => {
		const documentItemIds = await withWorkspaceDb(async ({ db, userId }) => {
			await removeWorkspaceMember(db, {
				workspaceId: data.workspaceId,
				actorUserId: userId,
				targetUserId: data.userId,
			});
			return await listWorkspaceDocumentItemIds(db, data.workspaceId);
		});

		await disconnectWorkspaceRoomMember(env, { ...data, documentItemIds });
	});

async function listWorkspaceDocumentItemIds(db: WorkspaceDbContext["db"], workspaceId: string) {
	// ponytail: membership changes are rare; track active sessions only if large
	// workspaces make this full document-id scan measurably slow.
	return (
		await db
			.select({ id: workspaceItems.id })
			.from(workspaceItems)
			.where(and(eq(workspaceItems.workspaceId, workspaceId), eq(workspaceItems.type, "document")))
	).map((item) => item.id);
}
