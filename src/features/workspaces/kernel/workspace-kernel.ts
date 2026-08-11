import { Agent, type Connection, type ConnectionContext } from "agents";
import { getChatAttachmentWorkspacePrefix } from "#/features/workspaces/ai/chat-attachment-storage";
import { getDocumentSessionStubFromEnv } from "#/features/workspaces/document-session-access";
import { getWorkspaceFileItemObjectPrefix } from "#/features/workspaces/files/workspace-file-object-keys";
import { migrateLegacyWorkspaceData } from "#/features/workspaces/migration/legacy-workspace-data";
import {
	getWorkspaceKernelPresenceUsers,
	getWorkspaceKernelUserFromHeaders,
	setWorkspaceKernelUserHeaders,
} from "#/features/workspaces/kernel/workspace-kernel-presence";
import type { ResourcePurgeResult } from "#/features/workspaces/resource-purge-result";
import type {
	WorkspaceConnectionState,
	WorkspaceRevision,
	WorkspaceRealtimeServerMessage,
} from "#/features/workspaces/realtime/messages";
import { recordOperationalFailure } from "#/integrations/observability/operational-events";
import { deleteR2Prefix } from "#/lib/r2";

const workspacePurgeMaximumAttempts = 5;

export { setWorkspaceKernelUserHeaders };

/**
 * The deployed class name is retained to avoid a destructive Durable Object
 * migration. Canonical workspace data lives in Postgres; this object is only a
 * live room for presence, revision notifications, and retryable remote cleanup.
 */
export class WorkspaceKernel extends Agent<Cloudflare.Env> {
	async migrateLegacyDataToPostgres() {
		return await migrateLegacyWorkspaceData({
			env: this.env,
			storage: this.ctx.storage,
			workspaceId: this.name,
			sql: (strings, ...values) => this.sql(strings, ...values),
		});
	}

	onConnect(connection: Connection<WorkspaceConnectionState>, context: ConnectionContext) {
		const user = getWorkspaceKernelUserFromHeaders(context.request);

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

	async publishWorkspaceChange(change: WorkspaceRevision): Promise<void> {
		if (change.workspaceId !== this.name) {
			throw new Error("Workspace change was routed to the wrong room.");
		}

		this.broadcastRealtimeMessage({
			type: "workspace.changed",
			workspaceId: this.name,
			revision: change.revision,
		});
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
		const documentItemIds = Array.from(new Set(input.documentItemIds));
		const fileItemIds = Array.from(new Set(input.fileItemIds));
		if (documentItemIds.length === 0 && fileItemIds.length === 0) {
			return;
		}

		const results = await Promise.allSettled([
			...documentItemIds.map((itemId) => this.purgeDocumentSession(itemId)),
			...fileItemIds.map((itemId) =>
				deleteR2Prefix(
					this.env.WORKSPACE_KERNEL_FILES,
					getWorkspaceFileItemObjectPrefix({ workspaceId: this.name, itemId }),
				),
			),
		]);

		if (results.some((result) => result.status === "rejected")) {
			this.scheduleCleanupRetry("purgeDeletedItems", input, input.attempt);
		}
	}

	async purgeForDeletion(
		input: {
			documentItemIds?: string[];
			attempt?: number;
		} = {},
	): Promise<ResourcePurgeResult> {
		const documentItemIds = Array.from(new Set(input.documentItemIds ?? []));
		const results = await Promise.allSettled([
			...documentItemIds.map((itemId) => this.purgeDocumentSession(itemId)),
			deleteR2Prefix(this.env.WORKSPACE_KERNEL_FILES, getChatAttachmentWorkspacePrefix(this.name)),
			deleteR2Prefix(this.env.WORKSPACE_KERNEL_FILES, `uploads/workspaces/${this.name}/`),
			deleteR2Prefix(this.env.WORKSPACE_KERNEL_FILES, `workspace_kernel_files/${this.name}/`),
			deleteR2Prefix(this.env.WORKSPACE_KERNEL_FILES, `workspace_file_objects/${this.name}/`),
			deleteR2Prefix(this.env.WORKSPACE_KERNEL_FILES, `workspace_file_uploads/${this.name}/`),
		]);
		const failed = results.filter((result) => result.status === "rejected").length;

		if (failed > 0) {
			this.scheduleCleanupRetry("purgeForDeletion", input, input.attempt);
		} else {
			for (const connection of this.getConnections()) {
				connection.close(1008, "Workspace deleted");
			}
			await this.ctx.storage.deleteAll();
		}

		return { attempted: results.length, failed };
	}

	private async purgeDocumentSession(itemId: string) {
		try {
			await getDocumentSessionStubFromEnv(this.env, {
				workspaceId: this.name,
				itemId,
			}).purgeForDeletion();
		} catch (error) {
			recordOperationalFailure({
				error,
				event: "workspace_document_purge",
				fields: { item_id: itemId, workspace_id: this.name },
			});
			throw error;
		}
	}

	private scheduleCleanupRetry(
		method: "purgeDeletedItems" | "purgeForDeletion",
		input: { documentItemIds?: string[]; fileItemIds?: string[] },
		previousAttempt = 0,
	) {
		const attempt = previousAttempt + 1;
		if (attempt >= workspacePurgeMaximumAttempts) {
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
			users: getWorkspaceKernelPresenceUsers(this.getConnections<WorkspaceConnectionState>()),
		});
	}

	private broadcastRealtimeMessage(message: WorkspaceRealtimeServerMessage) {
		this.broadcast(JSON.stringify(message));
	}
}
