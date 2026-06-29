import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import {
	workspaceIdInputSchema,
	workspaceMembershipRoleSchema,
} from "#/features/workspaces/contracts";
import {
	cancelWorkspaceEmailInvite,
	createWorkspaceEmailInvites,
	listWorkspaceEmailInvites,
} from "#/features/workspaces/invites/workspace-email-invites.server";
import {
	acceptWorkspaceInvite,
	getOrCreateWorkspaceInviteLink,
	getWorkspaceInvitePreview,
} from "#/features/workspaces/invites/workspace-invites.server";
import { withDb, withWorkspaceDb } from "#/features/workspaces/server/workspace-db";

const workspaceInviteLinkInputSchema = z.object({
	workspaceId: z.string().min(1),
	role: workspaceMembershipRoleSchema,
});

const workspaceInviteTokenSchema = z.object({
	token: z.string().min(1),
});

const workspaceEmailInviteInputSchema = z.object({
	workspaceId: z.string().min(1),
	role: workspaceMembershipRoleSchema,
	emails: z.array(z.string().min(1)).min(1).max(50),
});

const cancelWorkspaceEmailInviteInputSchema = z.object({
	workspaceId: z.string().min(1),
	inviteId: z.string().min(1),
});

export const getWorkspaceInvitePreviewFn = createServerFn({ method: "GET" })
	.validator(workspaceInviteTokenSchema)
	.handler(async ({ data }) => withDb((db) => getWorkspaceInvitePreview(db, data.token)));

export const acceptWorkspaceInviteFn = createServerFn({ method: "POST" })
	.validator(workspaceInviteTokenSchema)
	.handler(async ({ data }) =>
		withWorkspaceDb(({ db, userId }) =>
			acceptWorkspaceInvite(db, {
				token: data.token,
				userId,
			}),
		),
	);

export const getWorkspaceInviteLinkFn = createServerFn({ method: "POST" })
	.validator(workspaceInviteLinkInputSchema)
	.handler(async ({ data }) =>
		withWorkspaceDb(({ db, userId }) =>
			getOrCreateWorkspaceInviteLink(db, {
				workspaceId: data.workspaceId,
				userId,
				role: data.role,
			}),
		),
	);

export const listWorkspaceEmailInvitesFn = createServerFn({ method: "GET" })
	.validator(workspaceIdInputSchema)
	.handler(async ({ data }) =>
		withWorkspaceDb(({ db, userId }) =>
			listWorkspaceEmailInvites(db, {
				workspaceId: data.workspaceId,
				userId,
			}),
		),
	);

export const createWorkspaceEmailInvitesFn = createServerFn({ method: "POST" })
	.validator(workspaceEmailInviteInputSchema)
	.handler(async ({ data }) =>
		withWorkspaceDb(({ db, userId }) =>
			createWorkspaceEmailInvites(db, {
				workspaceId: data.workspaceId,
				userId,
				role: data.role,
				emails: data.emails,
			}),
		),
	);

export const cancelWorkspaceEmailInviteFn = createServerFn({ method: "POST" })
	.validator(cancelWorkspaceEmailInviteInputSchema)
	.handler(async ({ data }) =>
		withWorkspaceDb(({ db, userId }) =>
			cancelWorkspaceEmailInvite(db, {
				workspaceId: data.workspaceId,
				userId,
				inviteId: data.inviteId,
			}),
		),
	);
