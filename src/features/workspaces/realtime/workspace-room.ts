import { Agent, type Connection, type ConnectionContext } from "agents";
import { getDocumentSessionStubFromEnv } from "#/features/workspaces/document-session-access";
import {
	getWorkspaceRoomPresenceUsers,
	getWorkspaceRoomUserFromHeaders,
	setWorkspaceRoomUserHeaders,
} from "#/features/workspaces/realtime/workspace-room-presence";
import type { ResourcePurgeResult } from "#/features/workspaces/resource-purge-result";
import {
	purgeDeletedWorkspaceItems,
	purgeWorkspaceStorage,
} from "#/features/workspaces/realtime/workspace-cleanup";
import type {
	WorkspaceConnectionState,
	WorkspacePageChange,
	WorkspaceRealtimeServerMessage,
} from "#/features/workspaces/realtime/messages";
import { recordOperationalFailure } from "#/integrations/observability/operational-events";

const workspacePurgeMaximumAttempts = 5;

export { setWorkspaceRoomUserHeaders };

/** Workspace-scoped coordination for presence, tree deltas, and cleanup retries. */
export class WorkspaceRoom extends Agent<Cloudflare.Env> {
	onConnect(connection: Connection<WorkspaceConnectionState>, context: ConnectionContext) {
		const user = getWorkspaceRoomUserFromHeaders(context.request);

		if (!user) {
			connection.close(1008, "Unauthorized");
			return;
		}

		connection.setState({ user });
		this.broadcastPresenceSnapshot();
	}

	onClose() {
		this.broadcastPresenceSnapshot();
	}

	async publishWorkspacePageChange(change: WorkspacePageChange): Promise<void> {
		if (change.workspaceId !== this.name) {
			throw new Error("Workspace change was routed to the wrong room.");
		}

		this.broadcastRealtimeMessage(change);
	}

	async disconnectMember(input: { userId: string; documentItemIds: string[] }): Promise<void> {
		for (const connection of this.getConnections<WorkspaceConnectionState>()) {
			if (connection.state?.user.id === input.userId) {
				connection.close(1008, "Workspace access changed");
			}
		}
		await Promise.all(
			input.documentItemIds.map((itemId) =>
				getDocumentSessionStubFromEnv(this.env, {
					workspaceId: this.name,
					itemId,
				}).disconnectMember({ userId: input.userId }),
			),
		);
		this.broadcastPresenceSnapshot();
	}

	async purgeDeletedItems(input: {
		documentItemIds: string[];
		fileItemIds: string[];
		attempt?: number;
	}): Promise<void> {
		if (input.documentItemIds.length === 0 && input.fileItemIds.length === 0) {
			return;
		}

		const result = await purgeDeletedWorkspaceItems(this.env, {
			...input,
			workspaceId: this.name,
		});
		if (result.failed > 0) {
			recordOperationalFailure({
				error: new Error("Workspace item cleanup was incomplete."),
				event: "workspace_item_cleanup_incomplete",
				fields: { ...result, workspace_id: this.name },
			});
			this.scheduleCleanupRetry("purgeDeletedItems", input, input.attempt);
		}
	}

	async purgeForDeletion(
		input: {
			documentItemIds?: string[];
			attempt?: number;
		} = {},
	): Promise<ResourcePurgeResult> {
		const result = await purgeWorkspaceStorage(this.env, {
			documentItemIds: input.documentItemIds ?? [],
			workspaceId: this.name,
		});

		if (result.failed > 0) {
			this.scheduleCleanupRetry("purgeForDeletion", input, input.attempt);
		} else {
			for (const connection of this.getConnections()) {
				connection.close(1008, "Workspace deleted");
			}
			await this.ctx.storage.deleteAll();
		}

		return result;
	}

	private scheduleCleanupRetry(
		method: "purgeDeletedItems" | "purgeForDeletion",
		input: { documentItemIds?: string[]; fileItemIds?: string[] },
		previousAttempt = 0,
	) {
		const attempt = previousAttempt + 1;
		if (attempt >= workspacePurgeMaximumAttempts) {
			recordOperationalFailure({
				error: new Error("Workspace cleanup retries exhausted."),
				event: "workspace_cleanup_retry_exhausted",
				fields: { attempt, method, workspace_id: this.name },
			});
			return;
		}

		this.ctx.waitUntil(
			this.schedule(attempt * 5, method, { ...input, attempt }, { idempotent: true }).catch(
				(error) => {
					recordOperationalFailure({
						error,
						event: "workspace_cleanup_retry_schedule",
						fields: { attempt, method, workspace_id: this.name },
					});
				},
			),
		);
	}

	private broadcastPresenceSnapshot() {
		this.broadcastRealtimeMessage({
			type: "presence.snapshot",
			workspaceId: this.name,
			users: getWorkspaceRoomPresenceUsers(this.getConnections<WorkspaceConnectionState>()),
		});
	}

	private broadcastRealtimeMessage(message: WorkspaceRealtimeServerMessage) {
		this.broadcast(JSON.stringify(message));
	}
}
