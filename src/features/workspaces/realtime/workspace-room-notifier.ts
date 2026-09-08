import { getAgentByName } from "agents";

import { workspaceRoomAgentName } from "#/features/workspaces/agent-routes";
import type { WorkspacePageChange } from "#/features/workspaces/realtime/messages";
import { recordOperationalFailure } from "#/integrations/observability/operational-events";

const workspaceCleanupDeliveryAttempts = 3;

export async function notifyWorkspaceRoom(
	env: Cloudflare.Env,
	change: WorkspacePageChange,
): Promise<void> {
	try {
		const room = await getWorkspaceRoom(env, change.workspaceId);
		await room.publishWorkspacePageChange(change);
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
	input: {
		workspaceId: string;
		documentItemIds: string[];
		fileItemIds: string[];
		recordingItemIds: string[];
	},
): Promise<void> {
	// Delivery retries end once the room accepts the RPC. The room separately owns
	// durable retries for individual document-session and R2 cleanup failures.
	for (let attempt = 1; attempt <= workspaceCleanupDeliveryAttempts; attempt += 1) {
		try {
			const room = await getWorkspaceRoom(env, input.workspaceId);
			await room.purgeDeletedItems({
				documentItemIds: input.documentItemIds,
				fileItemIds: input.fileItemIds,
				recordingItemIds: input.recordingItemIds,
			});
			return;
		} catch (error) {
			if (attempt === workspaceCleanupDeliveryAttempts) {
				recordOperationalFailure({
					error,
					event: "workspace_item_cleanup_request",
					fields: {
						attempt,
						item_count:
							input.documentItemIds.length +
							input.fileItemIds.length +
							input.recordingItemIds.length,
						workspace_id: input.workspaceId,
					},
				});
			}
		}
	}
}

function getWorkspaceRoom(env: Cloudflare.Env, workspaceId: string) {
	return getAgentByName(env[workspaceRoomAgentName], workspaceId);
}
