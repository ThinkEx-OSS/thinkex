import { getAgentByName } from "agents";
import { eq } from "drizzle-orm";

import { workspaces } from "#/db/schema";
import { createDbContext } from "#/db/server";
import { userAIAgentName, workspaceKernelAgentName } from "#/features/workspaces/agent-routes";
import type { ResourcePurgeResult } from "#/features/workspaces/resource-purge-result";
import {
	recordOperationalFailure,
	recordOperationalOutcome,
} from "#/integrations/observability/operational-events";

interface UserAIStoreLifecycleAgent {
	mergeLinkedAnonymousUser(input: { anonymousUserId: string }): Promise<void>;
	purgeForDeletion(): Promise<ResourcePurgeResult>;
}

interface WorkspaceKernelLifecycleAgent {
	purgeForDeletion(): Promise<ResourcePurgeResult>;
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

async function purgeUserAIStore(userId: string) {
	const { env } = await import("cloudflare:workers");

	try {
		const store = getUserAIStoreLifecycleAgent(env, userId);
		return await store.purgeForDeletion();
	} catch (error) {
		recordPurgeAgentFailure("user", userId, error);
		return { attempted: 1, failed: 1 };
	}
}

export async function transferLinkedAccountResources(input: {
	anonymousUserId: string;
	newUserId: string;
}) {
	if (input.anonymousUserId === input.newUserId) {
		return;
	}

	const { env } = await import("cloudflare:workers");
	const store = getUserAIStoreLifecycleAgent(env, input.newUserId);

	await store.mergeLinkedAnonymousUser({ anonymousUserId: input.anonymousUserId });
}

export async function purgeWorkspaceResources(workspaceId: string) {
	const startedAt = Date.now();
	const result = await purgeWorkspaceResourcesResult(workspaceId);
	recordPurgeOutcome("workspace", workspaceId, result, Date.now() - startedAt);
}

async function purgeWorkspaceResourcesResult(workspaceId: string): Promise<ResourcePurgeResult> {
	const { env } = await import("cloudflare:workers");

	try {
		const kernel = getWorkspaceKernelLifecycleAgent(env, workspaceId);
		return await kernel.purgeForDeletion();
	} catch (error) {
		recordPurgeAgentFailure("workspace", workspaceId, error);
		return { attempted: 1, failed: 1 };
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
		purgeUserAIStore(userId),
		...ownedWorkspaceIds.map(purgeWorkspaceResourcesResult),
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

function getUserAIStoreLifecycleAgent(env: Cloudflare.Env, userId: string) {
	return getAgentByName(env[userAIAgentName], userId) as unknown as UserAIStoreLifecycleAgent;
}

function getWorkspaceKernelLifecycleAgent(env: Cloudflare.Env, workspaceId: string) {
	return getAgentByName(
		env[workspaceKernelAgentName],
		workspaceId,
	) as unknown as WorkspaceKernelLifecycleAgent;
}
