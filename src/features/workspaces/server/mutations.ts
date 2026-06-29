import { and, eq, isNull } from "drizzle-orm";

import { workspaceMembers, workspaces } from "#/db/schema";
import { createDbContext } from "#/db/server";
import { purgeWorkspaceResources } from "#/features/workspaces/durable-object-lifecycle";
import type {
	CreateWorkspaceInput,
	DeleteWorkspaceInput,
	UpdateWorkspaceInput,
	WorkspaceSummary,
} from "#/features/workspaces/contracts";
import {
	DEFAULT_WORKSPACE_COLOR,
	DEFAULT_WORKSPACE_ICON,
	DEFAULT_WORKSPACE_NAME,
} from "#/features/workspaces/defaults";
import { mapWorkspaceRow } from "#/features/workspaces/server/mappers";
import {
	assertCanDeleteWorkspace,
	assertCanMutateWorkspace,
	assertCanReadWorkspace,
	getCurrentUserId,
} from "#/features/workspaces/server/permissions";
import { buildWorkspaceCreatedEventProperties } from "#/integrations/posthog/events";
import { capturePostHogServerEvent } from "#/integrations/posthog/server";

export async function createWorkspaceForCurrentUser(
	input: CreateWorkspaceInput,
): Promise<WorkspaceSummary> {
	const userId = await getCurrentUserId();
	const workspace = await insertWorkspaceForUser(input, userId);

	capturePostHogServerEvent({
		distinctId: userId,
		event: "workspace_created",
		properties: buildWorkspaceCreatedEventProperties(workspace),
		timestamp: new Date().toISOString(),
	});

	return workspace;
}

async function insertWorkspaceForUser(
	input: CreateWorkspaceInput,
	userId: string,
): Promise<WorkspaceSummary> {
	const dbContext = await createDbContext();
	const workspaceId = input.id ?? crypto.randomUUID();
	const openedAt = new Date();

	try {
		const [insertedWorkspaces] = await dbContext.db.batch([
			dbContext.db
				.insert(workspaces)
				.values({
					id: workspaceId,
					name: input.name?.trim() || DEFAULT_WORKSPACE_NAME,
					color: input.color ?? DEFAULT_WORKSPACE_COLOR,
					icon: DEFAULT_WORKSPACE_ICON,
					ownerId: userId,
				})
				.returning(),
			dbContext.db.insert(workspaceMembers).values({
				id: crypto.randomUUID(),
				workspaceId,
				userId,
				role: "owner",
				lastOpenedAt: openedAt,
			}),
		]);

		const row = insertedWorkspaces[0];

		if (!row) {
			throw new Error("Workspace was not created.");
		}

		return mapWorkspaceRow(
			{
				...row,
				lastOpenedAt: openedAt,
			},
			"owner",
		);
	} finally {
		await dbContext.dispose();
	}
}

export async function recordWorkspaceOpenedForCurrentUser(
	workspaceId: string,
): Promise<WorkspaceSummary | null> {
	const [userId, dbContext] = await Promise.all([getCurrentUserId(), createDbContext()]);
	const openedAt = new Date();

	try {
		await assertCanReadWorkspace(dbContext.db, { workspaceId, userId });

		const [[membership], [workspace]] = await Promise.all([
			dbContext.db
				.update(workspaceMembers)
				.set({ lastOpenedAt: openedAt })
				.where(
					and(eq(workspaceMembers.workspaceId, workspaceId), eq(workspaceMembers.userId, userId)),
				)
				.returning({
					lastOpenedAt: workspaceMembers.lastOpenedAt,
					role: workspaceMembers.role,
				}),
			dbContext.db
				.select()
				.from(workspaces)
				.where(and(eq(workspaces.id, workspaceId), isNull(workspaces.archivedAt)))
				.limit(1),
		]);

		if (!membership || !workspace) {
			return null;
		}

		return mapWorkspaceRow(
			{
				...workspace,
				lastOpenedAt: membership.lastOpenedAt,
			},
			membership.role,
		);
	} finally {
		await dbContext.dispose();
	}
}

export async function updateWorkspaceForCurrentUser(
	input: UpdateWorkspaceInput,
): Promise<WorkspaceSummary> {
	const [userId, dbContext] = await Promise.all([getCurrentUserId(), createDbContext()]);

	try {
		await assertCanMutateWorkspace(dbContext.db, {
			workspaceId: input.workspaceId,
			userId,
		});

		const [updatedWorkspaces, memberships] = await dbContext.db.batch([
			dbContext.db
				.update(workspaces)
				.set({
					name: input.name,
					icon: input.icon,
					color: input.color,
				})
				.where(and(eq(workspaces.id, input.workspaceId), isNull(workspaces.archivedAt)))
				.returning(),
			dbContext.db
				.select({
					lastOpenedAt: workspaceMembers.lastOpenedAt,
					role: workspaceMembers.role,
				})
				.from(workspaceMembers)
				.where(
					and(
						eq(workspaceMembers.workspaceId, input.workspaceId),
						eq(workspaceMembers.userId, userId),
					),
				)
				.limit(1),
		]);

		const updatedWorkspace = updatedWorkspaces[0];

		if (!updatedWorkspace) {
			throw new Error("Workspace was not updated.");
		}

		const membership = memberships[0];

		if (!membership) {
			throw new Error("Workspace membership was not found.");
		}

		const workspace = {
			...updatedWorkspace,
			lastOpenedAt: membership.lastOpenedAt,
			membershipRole: membership.role,
		};

		return mapWorkspaceRow(workspace, workspace.membershipRole);
	} finally {
		await dbContext.dispose();
	}
}

export async function deleteWorkspaceForCurrentUser(input: DeleteWorkspaceInput) {
	const [userId, dbContext] = await Promise.all([getCurrentUserId(), createDbContext()]);

	try {
		await assertCanDeleteWorkspace(dbContext.db, {
			workspaceId: input.workspaceId,
			userId,
		});

		const [workspace] = await dbContext.db
			.select()
			.from(workspaces)
			.where(and(eq(workspaces.id, input.workspaceId), isNull(workspaces.archivedAt)))
			.limit(1);

		if (!workspace) {
			return null;
		}

		if (workspace.name !== input.confirmationName.trim()) {
			throw new Error("Workspace name confirmation does not match.");
		}

		const [deletedWorkspace] = await dbContext.db
			.delete(workspaces)
			.where(eq(workspaces.id, input.workspaceId))
			.returning({ id: workspaces.id });

		if (deletedWorkspace) {
			await purgeWorkspaceResources(input.workspaceId);
		}

		return deletedWorkspace ?? null;
	} finally {
		await dbContext.dispose();
	}
}
