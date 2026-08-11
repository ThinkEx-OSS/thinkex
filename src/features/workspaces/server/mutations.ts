import { and, eq, isNull } from "drizzle-orm";

import { workspaceItems, workspaceMembers, workspaces } from "#/db/schema";
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
	DEFAULT_WORKSPACE_THEME,
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
		const row = await dbContext.db.transaction(async (transaction) => {
			const [insertedWorkspace] = await transaction
				.insert(workspaces)
				.values({
					id: workspaceId,
					name: input.name?.trim() || DEFAULT_WORKSPACE_NAME,
					color: input.color ?? DEFAULT_WORKSPACE_COLOR,
					icon: DEFAULT_WORKSPACE_ICON,
					// Written explicitly so the column is never null: the picker and
					// the card both read it directly and neither guesses any more.
					theme: DEFAULT_WORKSPACE_THEME,
					ownerId: userId,
				})
				.returning();

			if (!insertedWorkspace) {
				throw new Error("Workspace was not created.");
			}

			await transaction.insert(workspaceMembers).values({
				id: crypto.randomUUID(),
				workspaceId,
				userId,
				role: "owner",
				lastOpenedAt: openedAt,
			});

			return insertedWorkspace;
		});

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
	const userId = await getCurrentUserId();
	const dbContext = await createDbContext();
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
	const userId = await getCurrentUserId();
	const dbContext = await createDbContext();

	try {
		await assertCanMutateWorkspace(dbContext.db, {
			workspaceId: input.workspaceId,
			userId,
		});

		const { membership, updatedWorkspace } = await dbContext.db.transaction(async (transaction) => {
			const [updatedWorkspace] = await transaction
				.update(workspaces)
				.set({
					name: input.name,
					icon: input.icon,
					color: input.color,
					theme: input.theme,
				})
				.where(and(eq(workspaces.id, input.workspaceId), isNull(workspaces.archivedAt)))
				.returning();

			if (!updatedWorkspace) {
				throw new Error("Workspace was not updated.");
			}

			const [membership] = await transaction
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
				.limit(1);

			if (!membership) {
				throw new Error("Workspace membership was not found.");
			}

			return { membership, updatedWorkspace };
		});

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
	const userId = await getCurrentUserId();
	const dbContext = await createDbContext();
	let deletedWorkspace: { id: string } | undefined;
	let documentItemIds: string[] = [];

	try {
		await assertCanDeleteWorkspace(dbContext.db, {
			workspaceId: input.workspaceId,
			userId,
		});

		const deletion = await dbContext.db.transaction(async (transaction) => {
			const [workspace] = await transaction
				.select()
				.from(workspaces)
				.where(and(eq(workspaces.id, input.workspaceId), isNull(workspaces.archivedAt)))
				.limit(1)
				.for("update");
			if (!workspace) return null;
			if (workspace.name !== input.confirmationName.trim()) {
				throw new Error("Workspace name confirmation does not match.");
			}

			const documents = await transaction
				.select({ id: workspaceItems.id })
				.from(workspaceItems)
				.where(
					and(
						eq(workspaceItems.workspaceId, input.workspaceId),
						eq(workspaceItems.type, "document"),
					),
				);
			const [deleted] = await transaction
				.delete(workspaces)
				.where(eq(workspaces.id, input.workspaceId))
				.returning({ id: workspaces.id });
			return { deleted, documentItemIds: documents.map((item) => item.id) };
		});
		if (!deletion) return null;
		deletedWorkspace = deletion.deleted;
		documentItemIds = deletion.documentItemIds;
	} finally {
		await dbContext.dispose();
	}

	if (deletedWorkspace) {
		await purgeWorkspaceResources(input.workspaceId, documentItemIds);
	}

	return deletedWorkspace ?? null;
}
