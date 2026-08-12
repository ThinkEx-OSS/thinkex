import { getAgentByName } from "agents";

import { workspaceKernelAgentName } from "#/features/workspaces/agent-routes";
import type { WorkspaceRevision } from "#/features/workspaces/realtime/messages";
import { recordOperationalFailure } from "#/integrations/observability/operational-events";

const workspaceCleanupDeliveryAttempts = 3;

export async function notifyWorkspaceRoom(
	env: Cloudflare.Env,
	change: WorkspaceRevision,
): Promise<void> {
	try {
		const room = await getWorkspaceRoom(env, change.workspaceId);
		await room.publishWorkspaceChange(change);
	} catch (error) {
		recordOperationalFailure({
			error,
			event: "workspace_room_notification",
			fields: {
				revision: change.revision,
				workspace_id: change.workspaceId,
			},
		});
	}
}

export async function disconnectWorkspaceRoomMember(
	env: Cloudflare.Env,
	input: { workspaceId: string; userId: string; documentItemIds: string[] },
): Promise<void> {
	try {
		const room = await getWorkspaceRoom(env, input.workspaceId);
		await room.disconnectMember({
			userId: input.userId,
			documentItemIds: input.documentItemIds,
		});
	} catch (error) {
		recordOperationalFailure({
			distinctId: input.userId,
			error,
			event: "workspace_room_member_disconnect",
			fields: { workspace_id: input.workspaceId },
		});
	}
}

export async function requestWorkspaceItemCleanup(
	env: Cloudflare.Env,
	input: { workspaceId: string; documentItemIds: string[]; fileItemIds: string[] },
): Promise<void> {
	// Delivery retries end once the room accepts the RPC. The room separately owns
	// durable retries for individual document-session and R2 cleanup failures.
	for (let attempt = 1; attempt <= workspaceCleanupDeliveryAttempts; attempt += 1) {
		try {
			const room = await getWorkspaceRoom(env, input.workspaceId);
			const result = await room.purgeDeletedItems({
				documentItemIds: input.documentItemIds,
				fileItemIds: input.fileItemIds,
			});
			if (result.failed > 0) {
				recordOperationalFailure({
					error: new Error("Workspace item cleanup was incomplete."),
					event: "workspace_item_cleanup_incomplete",
					fields: {
						attempted: result.attempted,
						failed: result.failed,
						workspace_id: input.workspaceId,
					},
				});
			}
			return;
		} catch (error) {
			if (attempt === workspaceCleanupDeliveryAttempts) {
				recordOperationalFailure({
					error,
					event: "workspace_item_cleanup_request",
					fields: {
						attempt,
						item_count: input.documentItemIds.length + input.fileItemIds.length,
						workspace_id: input.workspaceId,
					},
				});
			}
		}
	}
}

function getWorkspaceRoom(env: Cloudflare.Env, workspaceId: string) {
	return getAgentByName(env[workspaceKernelAgentName], workspaceId);
}
