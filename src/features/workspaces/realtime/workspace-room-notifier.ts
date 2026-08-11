import { workspaceKernelAgentName } from "#/features/workspaces/agent-routes";
import type { WorkspaceRevision } from "#/features/workspaces/realtime/messages";
import { recordOperationalFailure } from "#/integrations/observability/operational-events";

interface WorkspaceRoomClient {
	publishWorkspaceChange(change: WorkspaceRevision): Promise<void>;
	purgeDeletedItems(input: { documentItemIds: string[]; fileItemIds: string[] }): Promise<void>;
	disconnectMember(input: { userId: string; documentItemIds: string[] }): Promise<void>;
}

export async function notifyWorkspaceRoom(
	env: Cloudflare.Env,
	change: WorkspaceRevision,
): Promise<void> {
	try {
		await getWorkspaceRoom(env, change.workspaceId).publishWorkspaceChange(change);
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
		await getWorkspaceRoom(env, input.workspaceId).disconnectMember({
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
	for (let attempt = 1; attempt <= 3; attempt += 1) {
		try {
			await getWorkspaceRoom(env, input.workspaceId).purgeDeletedItems({
				documentItemIds: input.documentItemIds,
				fileItemIds: input.fileItemIds,
			});
			return;
		} catch (error) {
			if (attempt === 3) {
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
	const namespace: unknown = Reflect.get(env as object, workspaceKernelAgentName);
	if (!isWorkspaceRoomNamespace(namespace)) {
		throw new Error("Workspace room binding is unavailable.");
	}

	return namespace.getByName(workspaceId);
}

function isWorkspaceRoomNamespace(value: unknown): value is {
	getByName(name: string): WorkspaceRoomClient;
} {
	return (
		typeof value === "object" &&
		value !== null &&
		"getByName" in value &&
		typeof value.getByName === "function"
	);
}
