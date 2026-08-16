import { getAgentByName } from "agents";
import { and, eq } from "drizzle-orm";

import { workspaceItems, workspaces } from "#/db/schema";
import { createDbContext } from "#/db/server";
import { workspaceRoomAgentName } from "#/features/workspaces/agent-routes";
import { deleteUserThreads, transferUserThreads } from "#/features/workspaces/ai/chat/chat-store";
import type { ResourcePurgeResult } from "#/features/workspaces/resource-purge-result";
import {
	recordOperationalFailure,
	recordOperationalOutcome,
} from "#/integrations/observability/operational-events";

interface WorkspaceLifecycleAgent {
	purgeForDeletion(input?: { documentItemIds?: string[] }): Promise<ResourcePurgeResult>;
}

async function listOwnedWorkspaceIds(userId: string) {
	const dbContext = await createDbContext();

	try {
		const rows = await dbContext.db
			.select({ id: workspaces.id })
			.from(workspaces)
			.where(eq(workspaces.ownerId, userId));

		return rows.map((row) => row.id);
	} finally {
		await dbContext.dispose();
	}
}

// AI chat lives entirely in Postgres; messages and attachments cascade with
// their thread rows, so the purge is one delete.
async function purgeUserAiChat(userId: string): Promise<ResourcePurgeResult> {
	try {
		await deleteUserThreads({ userId });

		return { attempted: 1, failed: 0 };
	} catch (error) {
		recordPurgeAgentFailure("user", userId, error);
		return { attempted: 1, failed: 1 };
	}
}

// Anonymous → account linking: reassign chat threads; attachments follow their
// thread rows automatically.
export async function transferLinkedAccountResources(input: {
	anonymousUserId: string;
	newUserId: string;
}) {
	if (input.anonymousUserId === input.newUserId) {
		return;
	}

	await transferUserThreads({
		fromUserId: input.anonymousUserId,
		toUserId: input.newUserId,
	});
}

export async function purgeWorkspaceResources(workspaceId: string, documentItemIds: string[] = []) {
	const startedAt = Date.now();
	const result = await purgeWorkspaceResourcesResult(workspaceId, documentItemIds);
	recordPurgeOutcome("workspace", workspaceId, result, Date.now() - startedAt);
}

async function purgeWorkspaceResourcesResult(
	workspaceId: string,
	documentItemIds: string[] = [],
): Promise<ResourcePurgeResult> {
	const { env } = await import("cloudflare:workers");

	try {
		const itemIds =
			documentItemIds.length > 0
				? documentItemIds
				: await listWorkspaceDocumentItemIds(workspaceId);
		const room = await getWorkspaceRoomLifecycleAgent(env, workspaceId);
		return await room.purgeForDeletion({ documentItemIds: itemIds });
	} catch (error) {
		recordPurgeAgentFailure("workspace", workspaceId, error);
		return { attempted: 1, failed: 1 };
	}
}

async function listWorkspaceDocumentItemIds(workspaceId: string) {
	const dbContext = await createDbContext();

	try {
		const rows = await dbContext.db
			.select({ id: workspaceItems.id })
			.from(workspaceItems)
			.where(and(eq(workspaceItems.workspaceId, workspaceId), eq(workspaceItems.type, "document")));
		return rows.map((row) => row.id);
	} finally {
		await dbContext.dispose();
	}
}

function recordPurgeAgentFailure(scope: "user" | "workspace", scopeId: string, error: unknown) {
	recordOperationalFailure({
		distinctId: scope === "user" ? scopeId : undefined,
		error,
		event: "resource_purge_agent",
		fields: {
			scope,
			scope_id: scopeId,
		},
	});
}

export async function purgeUserAccountResources(userId: string) {
	const startedAt = Date.now();
	const ownedWorkspaceIds = await listOwnedWorkspaceIds(userId);
	const results = await Promise.all([
		purgeUserAiChat(userId),
		...ownedWorkspaceIds.map((workspaceId) => purgeWorkspaceResourcesResult(workspaceId)),
	]);
	const result = results.reduce(
		(total, current) => ({
			attempted: total.attempted + current.attempted,
			failed: total.failed + current.failed,
		}),
		{ attempted: 0, failed: 0 },
	);

	recordPurgeOutcome("user", userId, result, Date.now() - startedAt);
}

function recordPurgeOutcome(
	scope: "user" | "workspace",
	scopeId: string,
	result: ResourcePurgeResult,
	durationMs: number,
) {
	recordOperationalOutcome({
		event: "resource_purge",
		fields: {
			attempted_count: result.attempted,
			duration_ms: durationMs,
			failed_count: result.failed,
			scope,
			scope_id: scopeId,
		},
		outcome: result.failed === 0 ? "success" : "error",
	});
}

async function getWorkspaceRoomLifecycleAgent(
	env: Cloudflare.Env,
	workspaceId: string,
): Promise<WorkspaceLifecycleAgent> {
	return await getAgentByName(env[workspaceRoomAgentName], workspaceId);
}
