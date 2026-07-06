import { getAgentByName } from "agents";
import { eq } from "drizzle-orm";

import { workspaces } from "#/db/schema";
import { createDbContext } from "#/db/server";
import { userAIAgentName, workspaceKernelAgentName } from "#/features/workspaces/agent-routes";

interface UserAIStoreLifecycleAgent {
	mergeLinkedAnonymousUser(input: { anonymousUserId: string }): Promise<void>;
	purgeForDeletion(): Promise<void>;
}

interface WorkspaceKernelLifecycleAgent {
	purgeForDeletion(): Promise<void>;
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
		await store.purgeForDeletion();
	} catch (error) {
		console.warn("[DurableObjectLifecycle] UserAIStore purge failed", { userId, error });
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
	const { env } = await import("cloudflare:workers");

	try {
		const kernel = getWorkspaceKernelLifecycleAgent(env, workspaceId);
		await kernel.purgeForDeletion();
	} catch (error) {
		console.warn("[DurableObjectLifecycle] WorkspaceKernel purge failed", { workspaceId, error });
	}
}

export async function purgeUserAccountResources(userId: string) {
	const ownedWorkspaceIds = await listOwnedWorkspaceIds(userId);

	await Promise.all([
		purgeUserAIStore(userId),
		...ownedWorkspaceIds.map((workspaceId) => purgeWorkspaceResources(workspaceId)),
	]);
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
