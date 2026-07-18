import { Workspace as ShellWorkspace } from "@cloudflare/shell";
import { Agent, type Connection, type ConnectionContext } from "agents";

import type { WorkspaceItemSummary } from "#/features/workspaces/contracts";
import { getDocumentSessionFromEnv } from "#/features/workspaces/document-session-access";
import type { ResourcePurgeResult } from "#/features/workspaces/resource-purge-result";
import { WorkspaceKernelEventBus } from "#/features/workspaces/kernel/workspace-kernel-events";
import { WorkspaceKernelFileCommands } from "#/features/workspaces/kernel/workspace-kernel-file-commands";
import { WorkspaceKernelItemCommands } from "#/features/workspaces/kernel/workspace-kernel-item-commands";
import {
	getWorkspaceKernelPresenceUsers,
	getWorkspaceKernelUserFromHeaders,
	setWorkspaceKernelUserHeaders,
} from "#/features/workspaces/kernel/workspace-kernel-presence";
import {
	initializeWorkspaceKernelStorage,
	type WorkspaceKernelSql,
} from "#/features/workspaces/kernel/workspace-kernel-schema";
import { WorkspaceKernelRelations } from "#/features/workspaces/kernel/workspace-kernel-relations";
import {
	listWorkspaceKernelTreeItems,
	type ListWorkspaceKernelItemsResult,
} from "#/features/workspaces/kernel/workspace-kernel-list";
import {
	buildWorkspaceKernelItemPathIndex,
	buildWorkspaceKernelTree,
	normalizeWorkspacePath,
	resolveWorkspaceKernelItemPath,
	WorkspaceKernelPathError,
} from "#/features/workspaces/kernel/workspace-kernel-paths";
import { WorkspaceKernelStore } from "#/features/workspaces/kernel/workspace-kernel-store";
import type {
	CreateWorkspaceKernelFileFromUploadArgs,
	CreateWorkspaceKernelItemArgs,
	DeleteWorkspaceKernelItemsArgs,
	DeleteWorkspaceKernelItemsResult,
	GetWorkspaceKernelItemPathsArgs,
	ListWorkspaceKernelEventsArgs,
	ListWorkspaceKernelItemRelationsArgs,
	ListWorkspaceKernelItemsArgs,
	LinkWorkspaceKernelItemsArgs,
	MoveWorkspaceKernelItemsArgs,
	MoveWorkspaceKernelItemsResult,
	ReadWorkspaceKernelFileSourceArgs,
	ReadWorkspaceKernelFileProjectionArgs,
	ReadWorkspaceDocumentCheckpointArgs,
	ResolveWorkspaceKernelPathsArgs,
	RenameWorkspaceKernelItemArgs,
	UpdateWorkspaceKernelItemColorArgs,
	UpsertWorkspaceKernelFileProjectionArgs,
	WorkspaceKernelPage,
	WorkspaceKernelMutationOutcome,
	CommitWorkspaceDocumentCheckpointArgs,
	WorkspaceKernelPathResolution,
} from "#/features/workspaces/kernel/workspace-kernel-types";
import { getChatAttachmentWorkspacePrefix } from "#/features/workspaces/ai/chat-attachment-storage";
import type {
	WorkspaceCommandResult,
	WorkspaceConnectionState,
	WorkspaceRealtimeEvent,
	WorkspaceRealtimeServerMessage,
} from "#/features/workspaces/realtime/messages";
import {
	recordOperationalFailure,
	recordOperationalOutcome,
} from "#/integrations/observability/operational-events";
import { deleteR2Prefix } from "#/lib/r2";

const workspaceKernelInlineThresholdBytes = 1_500_000;

export { setWorkspaceKernelUserHeaders };

export class WorkspaceKernel extends Agent<Cloudflare.Env> {
	private readonly kernelSql: WorkspaceKernelSql = (strings, ...values) =>
		this.sql(strings, ...values);
	private readonly workspace = new ShellWorkspace({
		sql: this.ctx.storage.sql,
		r2: this.env.WORKSPACE_KERNEL_FILES,
		inlineThreshold: workspaceKernelInlineThresholdBytes,
		namespace: "workspace_kernel_files",
		name: () => this.name,
	});
	private readonly store = new WorkspaceKernelStore({
		sql: this.kernelSql,
		workspaceId: () => this.name,
	});
	private readonly events = new WorkspaceKernelEventBus({
		sql: this.kernelSql,
		workspaceId: () => this.name,
		getNextRevision: () => this.store.getNextRevision(),
		broadcast: (message) => this.broadcastRealtimeMessage(message),
	});
	private readonly relations = new WorkspaceKernelRelations(this.kernelSql);
	private readonly itemCommands = new WorkspaceKernelItemCommands({
		events: this.events,
		relations: this.relations,
		sql: this.kernelSql,
		store: this.store,
		workspace: this.workspace,
		workspaceId: () => this.name,
	});
	private readonly fileCommands = new WorkspaceKernelFileCommands({
		events: this.events,
		r2: this.env.WORKSPACE_KERNEL_FILES,
		sql: this.kernelSql,
		store: this.store,
		workspaceId: () => this.name,
	});

	onStart() {
		initializeWorkspaceKernelStorage(this.kernelSql);
	}

	onConnect(connection: Connection<WorkspaceConnectionState>, context: ConnectionContext) {
		const user = getWorkspaceKernelUserFromHeaders(context.request);

		if (!user) {
			connection.close(1008, "Unauthorized");
			return;
		}

		connection.setState({
			user,
		});
		this.broadcastPresenceSnapshot();
	}

	onClose() {
		this.broadcastPresenceSnapshot();
	}

	async getPage(): Promise<WorkspaceKernelPage> {
		const items = this.store.getPageItems();

		return {
			workspaceId: this.name,
			items,
			itemFacts: this.store.getItemFacts(items),
			revision: this.store.getCurrentRevision(),
		};
	}

	async listTreeItems(
		input: ListWorkspaceKernelItemsArgs = {},
	): Promise<ListWorkspaceKernelItemsResult> {
		const items = this.store.getPageItems();
		return listWorkspaceKernelTreeItems({
			tree: buildWorkspaceKernelTree(items),
			itemFactsById: new Map(this.store.getItemFacts(items).map((facts) => [facts.itemId, facts])),
			...input,
		});
	}

	async resolvePaths(
		input: ResolveWorkspaceKernelPathsArgs,
	): Promise<WorkspaceKernelPathResolution[]> {
		const tree = buildWorkspaceKernelTree(this.store.getPageItems());

		return input.paths.map((path) => {
			try {
				const normalizedPath = normalizeWorkspacePath(path);
				if (normalizedPath === "/") {
					return { path: normalizedPath, status: "root" };
				}

				const item = resolveWorkspaceKernelItemPath(normalizedPath, tree);
				return item
					? { item, path: normalizedPath, status: "item" }
					: { path: normalizedPath, status: "not_found" };
			} catch (error) {
				if (error instanceof WorkspaceKernelPathError && error.code === "path_not_absolute") {
					return { code: error.code, path, status: "invalid_path" };
				}
				throw error;
			}
		});
	}

	async getItemPaths(input: GetWorkspaceKernelItemPathsArgs) {
		const pathsByItemId = buildWorkspaceKernelItemPathIndex(this.store.getPageItems());
		return input.itemIds.flatMap((itemId) => {
			const path = pathsByItemId.get(itemId);
			return path ? [{ itemId, path }] : [];
		});
	}

	async linkItems(input: LinkWorkspaceKernelItemsArgs) {
		for (const relation of input.relations) {
			this.store.assertActiveItem(relation.fromItemId);
			this.store.assertActiveItem(relation.toItemId);
		}

		this.relations.createRelations(input.relations);
		const itemIds = Array.from(
			new Set(input.relations.flatMap((relation) => [relation.fromItemId, relation.toItemId])),
		);
		const itemFacts = this.store.getItemFacts(
			itemIds.map((itemId) => this.store.requireItem(itemId)),
		);
		const event = this.events.commit({
			type: "workspace.relations.updated",
			actorUserId: input.actorUserId ?? null,
			clientMutationId: input.clientMutationId ?? null,
			payload: { itemFacts },
		});
		return { event, result: itemFacts };
	}

	async listItemRelations(input: ListWorkspaceKernelItemRelationsArgs) {
		this.store.assertActiveItem(input.itemId);
		return this.relations.listItemRelations(input.itemId, input.limit);
	}

	async createItem(
		input: CreateWorkspaceKernelItemArgs,
	): Promise<WorkspaceKernelMutationOutcome<WorkspaceItemSummary>> {
		return this.runMutation("create_item", input, 1, () => this.itemCommands.createItem(input));
	}

	async createFileFromUpload(
		input: CreateWorkspaceKernelFileFromUploadArgs,
	): Promise<WorkspaceCommandResult<WorkspaceItemSummary>> {
		return await this.fileCommands.createFileFromUpload(input);
	}

	async getFileSource(input: ReadWorkspaceKernelFileSourceArgs) {
		return await this.fileCommands.getFileSource(input);
	}

	async readFilePreview(input: ReadWorkspaceKernelFileSourceArgs) {
		return await this.fileCommands.readFilePreview(input);
	}

	async upsertFileProjection(input: UpsertWorkspaceKernelFileProjectionArgs) {
		return await this.runMutation("upsert_file_projection", input, 1, () =>
			this.fileCommands.upsertFileProjection(input),
		);
	}

	async readFileProjection(input: ReadWorkspaceKernelFileProjectionArgs) {
		return await this.fileCommands.readFileProjection(input);
	}

	async renameItem(
		input: RenameWorkspaceKernelItemArgs,
	): Promise<WorkspaceKernelMutationOutcome<WorkspaceItemSummary>> {
		return this.runMutation("rename_item", input, 1, () => this.itemCommands.renameItem(input));
	}

	async moveItems(
		input: MoveWorkspaceKernelItemsArgs,
	): Promise<WorkspaceKernelMutationOutcome<MoveWorkspaceKernelItemsResult>> {
		return this.runMutation("move_items", input, input.items.length, () =>
			this.itemCommands.moveItems(input),
		);
	}

	async updateItemColor(
		input: UpdateWorkspaceKernelItemColorArgs,
	): Promise<WorkspaceCommandResult<WorkspaceItemSummary>> {
		return this.runMutation("update_item_color", input, 1, () =>
			this.itemCommands.updateItemColor(input),
		);
	}

	async deleteItems(
		input: DeleteWorkspaceKernelItemsArgs,
	): Promise<WorkspaceCommandResult<DeleteWorkspaceKernelItemsResult>> {
		return this.runMutation("delete_items", input, input.itemIds.length, async () => {
			const command = await this.itemCommands.deleteItems(input);
			await this.fileCommands.deleteObjects(command.result.deletedItemIds);
			return command;
		});
	}

	async readDocumentCheckpoint(input: ReadWorkspaceDocumentCheckpointArgs) {
		return await this.itemCommands.readDocumentCheckpoint(input);
	}

	async commitDocumentCheckpoint(
		input: CommitWorkspaceDocumentCheckpointArgs,
	): Promise<WorkspaceCommandResult<WorkspaceItemSummary>> {
		return this.runMutation("commit_document_checkpoint", input, 1, () =>
			this.itemCommands.commitDocumentCheckpoint(input),
		);
	}

	private async runMutation<T>(
		operation: string,
		input: { actorUserId?: string | null; clientMutationId?: string | null },
		requestedCount: number,
		run: () => Promise<T>,
	): Promise<T> {
		const startedAt = Date.now();
		let failure: unknown;

		try {
			return await run();
		} catch (error) {
			failure = error;
			throw error;
		} finally {
			recordOperationalOutcome({
				distinctId: input.actorUserId ?? undefined,
				error: failure,
				event: "workspace_mutation",
				fields: {
					duration_ms: Date.now() - startedAt,
					operation,
					operation_id: input.clientMutationId,
					requested_count: requestedCount,
					user_id: input.actorUserId,
					workspace_id: this.name,
				},
			});
		}
	}

	async getEventsSince({
		afterRevision,
		limit = 100,
	}: ListWorkspaceKernelEventsArgs): Promise<WorkspaceRealtimeEvent[]> {
		return this.events.getEventsSince({ afterRevision, limit });
	}

	async purgeForDeletion(): Promise<ResourcePurgeResult> {
		const workspaceId = this.name;
		const documentItemIds = this.store.getAllDocumentItemIds();
		let failed = 0;

		for (const itemId of documentItemIds) {
			try {
				await getDocumentSessionFromEnv(this.env, {
					workspaceId,
					itemId,
				}).purgeForDeletion();
			} catch (error) {
				failed += 1;
				recordOperationalFailure({
					error,
					event: "workspace_document_purge",
					fields: {
						item_id: itemId,
						workspace_id: workspaceId,
					},
				});
			}
		}

		await Promise.all([
			deleteR2Prefix(
				this.env.WORKSPACE_KERNEL_FILES,
				getChatAttachmentWorkspacePrefix(workspaceId),
			),
			deleteR2Prefix(this.env.WORKSPACE_KERNEL_FILES, `uploads/workspaces/${workspaceId}/`),
			deleteR2Prefix(this.env.WORKSPACE_KERNEL_FILES, `workspace_kernel_files/${workspaceId}/`),
			deleteR2Prefix(this.env.WORKSPACE_KERNEL_FILES, `workspace_file_objects/${workspaceId}/`),
			deleteR2Prefix(this.env.WORKSPACE_KERNEL_FILES, `workspace_file_uploads/${workspaceId}/`),
		]);

		await this.ctx.storage.deleteAll();
		return { attempted: documentItemIds.length + 1, failed };
	}

	private broadcastPresenceSnapshot() {
		this.broadcastRealtimeMessage({
			type: "presence.snapshot",
			workspaceId: this.name,
			users: this.getPresenceUsers(),
		});
	}

	private broadcastRealtimeMessage(message: WorkspaceRealtimeServerMessage) {
		this.broadcast(JSON.stringify(message));
	}

	private getPresenceUsers() {
		return getWorkspaceKernelPresenceUsers(this.getConnections<WorkspaceConnectionState>());
	}
}
