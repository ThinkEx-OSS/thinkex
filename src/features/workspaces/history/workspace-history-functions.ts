import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import type { WorkspaceHistoryEntry } from "#/features/workspaces/history/workspace-history-contract";
import { getDocumentSessionFromEnv } from "#/features/workspaces/document-session-access";
import type { DocumentEditReceiptUndoResult } from "#/features/workspaces/documents/document-edit-receipt";
import { getWorkspaceKernel } from "#/features/workspaces/kernel/workspace-kernel-access";
import { listWorkspaceMembers } from "#/features/workspaces/members/workspace-members.server";
import { withWorkspaceDb } from "#/features/workspaces/server/workspace-db";
import {
	assertCanMutateWorkspace,
	assertCanReadWorkspace,
} from "#/features/workspaces/server/permissions";

const workspaceHistoryInputSchema = z.strictObject({
	beforeRevision: z.number().int().positive().optional(),
	limit: z.number().int().min(1).max(100).optional(),
	workspaceId: z.string().trim().min(1),
});

export const listWorkspaceHistoryFn = createServerFn({ method: "GET" })
	.validator(workspaceHistoryInputSchema)
	.handler(async ({ data }): Promise<WorkspaceHistoryEntry[]> => {
		const members = await withWorkspaceDb(async ({ db, userId }) => {
			return await listWorkspaceMembers(db, { userId, workspaceId: data.workspaceId });
		});
		const kernel = await getWorkspaceKernel(data.workspaceId);
		const history = await kernel.listHistory({
			beforeRevision: data.beforeRevision,
			limit: data.limit,
		});
		const membersById = new Map(members.map((member) => [member.userId, member]));

		return history.map((entry) => ({
			...entry,
			actor: getHistoryActor(entry.actorUserId, entry.origin, membersById),
		}));
	});

const workspaceHistoryVersionInputSchema = z.strictObject({
	itemId: z.string().trim().min(1),
	versionId: z.string().trim().min(1).max(512),
	workspaceId: z.string().trim().min(1),
});

export const getWorkspaceHistoryVersionFn = createServerFn({ method: "GET" })
	.validator(workspaceHistoryVersionInputSchema)
	.handler(async ({ data }) => {
		await withWorkspaceDb(({ db, userId }) =>
			assertCanReadWorkspace(db, { userId, workspaceId: data.workspaceId }),
		);
		const kernel = await getWorkspaceKernel(data.workspaceId);
		return await kernel.readItemVersion({ itemId: data.itemId, versionId: data.versionId });
	});

export const restoreWorkspaceHistoryVersionFn = createServerFn({ method: "POST" })
	.validator(workspaceHistoryVersionInputSchema)
	.handler(async ({ data }): Promise<DocumentEditReceiptUndoResult> => {
		const userId = await withWorkspaceDb(async ({ db, userId }) => {
			await assertCanMutateWorkspace(db, { userId, workspaceId: data.workspaceId });
			return userId;
		});
		const kernel = await getWorkspaceKernel(data.workspaceId);
		const version = await kernel.readItemVersion({
			itemId: data.itemId,
			versionId: data.versionId,
		});
		if (version.status !== "ready") return version;
		if (version.itemType !== "document") return { status: "review_unavailable" };
		if (!version.canRestore) return { status: "not_found" };
		const { env } = await import("cloudflare:workers");
		const session = (await getDocumentSessionFromEnv(env, {
			itemId: data.itemId,
			workspaceId: data.workspaceId,
		})) as unknown as {
			restoreDocumentVersion(input: {
				actorUserId: string;
				versionId: string;
			}): Promise<DocumentEditReceiptUndoResult>;
		};
		return await session.restoreDocumentVersion({ actorUserId: userId, versionId: data.versionId });
	});

function getHistoryActor(
	actorUserId: string | null,
	origin: WorkspaceHistoryEntry["origin"],
	membersById: Map<string, { image: string | null; name: string }>,
): WorkspaceHistoryEntry["actor"] {
	if (!actorUserId) {
		return { image: null, name: origin === "system" ? "System" : "Unknown member" };
	}
	const member = membersById.get(actorUserId);
	return member
		? { image: member.image, name: member.name }
		: { image: null, name: "Former member" };
}
