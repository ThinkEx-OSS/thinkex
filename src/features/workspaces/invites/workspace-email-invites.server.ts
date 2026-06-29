import { and, asc, eq, gt, inArray, isNotNull, isNull, or } from "drizzle-orm";

import { user, workspaceInvites, workspaceMembers, workspaces } from "#/db/schema";
import type { createDbContext } from "#/db/server";
import type { WorkspaceEmailInviteSummary } from "#/features/workspaces/contracts";
import {
	sendWorkspaceInviteEmails,
	type WorkspaceInviteEmailDeliveryFailure,
	type WorkspaceInviteEmailPayload,
} from "#/features/workspaces/invites/workspace-invite-email";
import type { WorkspaceRole } from "#/features/workspaces/invites/workspace-invite-rules";
import {
	canGrantRole,
	createInviteToken,
	getDefaultInviteLinkExpiresAt,
	isValidInviteEmail,
	normalizeInviteEmail,
} from "#/features/workspaces/invites/workspace-invite-rules";
import { WorkspaceInviteError } from "#/features/workspaces/invites/workspace-invites.server";
import {
	assertCanGrantWorkspaceRole,
	assertCanReadWorkspace,
	getWorkspaceMemberRole,
	WorkspaceForbiddenError,
} from "#/features/workspaces/server/permissions";
import { buildWorkspaceSharedEventProperties } from "#/integrations/posthog/events";
import { capturePostHogServerEvent } from "#/integrations/posthog/server";
import { getAppOrigin } from "#/lib/app-origin";

type Db = Awaited<ReturnType<typeof createDbContext>>["db"];

export interface CreateWorkspaceEmailInvitesResult {
	persisted: string[];
	delivered: string[];
	skipped: Array<{
		email: string;
		reason: "already_member" | "invalid_email";
	}>;
	failedToSend: WorkspaceInviteEmailDeliveryFailure[];
}

async function upsertEmailInviteRecords(
	db: Db,
	input: {
		workspaceId: string;
		userId: string;
		role: WorkspaceRole;
		emails: string[];
		expiresAt: Date;
		existingInviteByEmail: Map<string, string>;
	},
): Promise<WorkspaceInviteEmailPayload[]> {
	const invitesToEmail: WorkspaceInviteEmailPayload[] = [];

	for (const email of input.emails) {
		const existingInviteId = input.existingInviteByEmail.get(email);
		const token = createInviteToken();

		if (existingInviteId) {
			await db
				.update(workspaceInvites)
				.set({
					role: input.role,
					createdByUserId: input.userId,
					expiresAt: input.expiresAt,
					token,
				})
				.where(eq(workspaceInvites.id, existingInviteId));
		} else {
			await db.insert(workspaceInvites).values({
				id: crypto.randomUUID(),
				workspaceId: input.workspaceId,
				role: input.role,
				type: "email",
				status: "pending",
				email,
				token,
				createdByUserId: input.userId,
				expiresAt: input.expiresAt,
			});
		}

		invitesToEmail.push({
			email,
			token,
			role: input.role,
		});
	}

	return invitesToEmail;
}

export async function createWorkspaceEmailInvites(
	db: Db,
	input: {
		workspaceId: string;
		userId: string;
		role: WorkspaceRole;
		emails: string[];
	},
): Promise<CreateWorkspaceEmailInvitesResult> {
	await assertCanGrantWorkspaceRole(db, input);

	const skipped: CreateWorkspaceEmailInvitesResult["skipped"] = [];
	const uniqueEmails = [...new Set(input.emails.map((email) => normalizeInviteEmail(email)))];

	if (uniqueEmails.length === 0) {
		return { persisted: [], delivered: [], skipped, failedToSend: [] };
	}

	const validEmails = uniqueEmails.filter((email) => {
		if (!isValidInviteEmail(email)) {
			skipped.push({ email, reason: "invalid_email" });
			return false;
		}

		return true;
	});

	if (validEmails.length === 0) {
		return { persisted: [], delivered: [], skipped, failedToSend: [] };
	}

	const existingMembers = await db
		.select({ email: user.email })
		.from(workspaceMembers)
		.innerJoin(user, eq(workspaceMembers.userId, user.id))
		.where(eq(workspaceMembers.workspaceId, input.workspaceId));

	const memberEmails = new Set(existingMembers.map((row) => normalizeInviteEmail(row.email)));

	const emailsToInvite = validEmails.filter((email) => {
		if (memberEmails.has(email)) {
			skipped.push({ email, reason: "already_member" });
			return false;
		}

		return true;
	});

	if (emailsToInvite.length === 0) {
		return { persisted: [], delivered: [], skipped, failedToSend: [] };
	}

	const [inviteContext] = await db
		.select({
			inviterName: user.name,
			workspaceName: workspaces.name,
		})
		.from(workspaces)
		.innerJoin(user, eq(user.id, input.userId))
		.where(eq(workspaces.id, input.workspaceId))
		.limit(1);

	if (!inviteContext) {
		throw new WorkspaceInviteError("Workspace not found.");
	}

	const existingInvites = await db
		.select({
			id: workspaceInvites.id,
			email: workspaceInvites.email,
		})
		.from(workspaceInvites)
		.where(
			and(
				eq(workspaceInvites.workspaceId, input.workspaceId),
				eq(workspaceInvites.type, "email"),
				eq(workspaceInvites.status, "pending"),
				inArray(workspaceInvites.email, emailsToInvite),
			),
		);

	const existingInviteByEmail = new Map(
		existingInvites.flatMap((row) =>
			row.email ? [[normalizeInviteEmail(row.email), row.id] as const] : [],
		),
	);

	const expiresAt = getDefaultInviteLinkExpiresAt();
	const invitesToEmail = await upsertEmailInviteRecords(db, {
		workspaceId: input.workspaceId,
		userId: input.userId,
		role: input.role,
		emails: emailsToInvite,
		expiresAt,
		existingInviteByEmail,
	});

	const persisted = invitesToEmail.map((invite) => invite.email);
	const failedToSend = await sendWorkspaceInviteEmails({
		invites: invitesToEmail,
		inviterName: inviteContext.inviterName,
		workspaceName: inviteContext.workspaceName,
		appOrigin: getAppOrigin(),
	});
	const failedEmails = new Set(failedToSend.map((failure) => failure.email));
	const delivered = persisted.filter((email) => !failedEmails.has(email));

	if (persisted.length > 0) {
		capturePostHogServerEvent({
			distinctId: input.userId,
			event: "workspace_shared",
			properties: buildWorkspaceSharedEventProperties({
				workspaceId: input.workspaceId,
				role: input.role,
				requestedCount: input.emails.length,
				persistedCount: persisted.length,
				deliveredCount: delivered.length,
				failedCount: failedToSend.length,
				skippedCount: skipped.length,
			}),
			timestamp: new Date().toISOString(),
		});
	}

	return {
		persisted,
		delivered,
		skipped,
		failedToSend,
	};
}

export async function listWorkspaceEmailInvites(
	db: Db,
	input: { workspaceId: string; userId: string },
): Promise<WorkspaceEmailInviteSummary[]> {
	await assertCanReadWorkspace(db, input);

	const now = new Date();

	const rows = await db
		.select({
			id: workspaceInvites.id,
			email: workspaceInvites.email,
			role: workspaceInvites.role,
			createdAt: workspaceInvites.createdAt,
		})
		.from(workspaceInvites)
		.where(
			and(
				eq(workspaceInvites.workspaceId, input.workspaceId),
				eq(workspaceInvites.type, "email"),
				eq(workspaceInvites.status, "pending"),
				isNotNull(workspaceInvites.email),
				or(isNull(workspaceInvites.expiresAt), gt(workspaceInvites.expiresAt, now)),
			),
		)
		.orderBy(asc(workspaceInvites.createdAt));

	return rows.map((row) => ({
		id: row.id,
		email: row.email as string,
		role: row.role,
		createdAt: row.createdAt,
	}));
}

export async function cancelWorkspaceEmailInvite(
	db: Db,
	input: {
		workspaceId: string;
		userId: string;
		inviteId: string;
	},
) {
	await assertCanReadWorkspace(db, input);
	const memberRole = await getWorkspaceMemberRole(db, input);

	const [invite] = await db
		.select({
			id: workspaceInvites.id,
			role: workspaceInvites.role,
		})
		.from(workspaceInvites)
		.where(
			and(
				eq(workspaceInvites.id, input.inviteId),
				eq(workspaceInvites.workspaceId, input.workspaceId),
				eq(workspaceInvites.type, "email"),
				eq(workspaceInvites.status, "pending"),
			),
		)
		.limit(1);

	if (!invite) {
		throw new WorkspaceInviteError("Invite not found.");
	}

	if (!memberRole || !canGrantRole(memberRole, invite.role)) {
		throw new WorkspaceForbiddenError();
	}

	await db
		.update(workspaceInvites)
		.set({ status: "revoked" })
		.where(eq(workspaceInvites.id, invite.id));
}
