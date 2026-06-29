import { getAgentByName } from "agents";
import { eq } from "drizzle-orm";

import { workspaces } from "#/db/schema";
import { createDbContext } from "#/db/server";
import { userAIAgentName } from "#/features/workspaces/agent-routes";
import { transferUserAIThreadsOnAccountLink } from "#/features/workspaces/ai/user-ai-agents";
import { getWorkspaceKernel } from "#/features/workspaces/kernel/workspace-kernel-access";

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
		const store = getAgentByName(env[userAIAgentName], userId) as unknown as {
			purgeForDeletion(): Promise<void>;
		};
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

	await transferUserAIThreadsOnAccountLink({ ...input, env });
}

export async function purgeWorkspaceResources(workspaceId: string) {
	try {
		const kernel = await getWorkspaceKernel(workspaceId);
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
