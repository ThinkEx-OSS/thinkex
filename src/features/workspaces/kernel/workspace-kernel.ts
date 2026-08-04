import { Workspace as ShellWorkspace } from "@cloudflare/shell";
import { Agent, type Connection, type ConnectionContext } from "agents";

import type { WorkspaceItemSummary } from "#/features/workspaces/contracts";
import { getDocumentSessionForDeletionFromEnv } from "#/features/workspaces/document-session-access";
import { reconcileWorkspaceFileExtractions } from "#/features/workspaces/extraction/workspace-file-extraction-reconciler";
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
	WorkspaceRealtimeServerMessage,
} from "#/features/workspaces/realtime/messages";
import {
	recordOperationalFailure,
	recordOperationalOutcome,
} from "#/integrations/observability/operational-events";
import { deleteR2Prefix } from "#/lib/r2";
import { WorkspaceSearchProjection } from "#/features/workspaces/search/workspace-search-projection";
import type { WorkspaceSearchInput } from "#/features/workspaces/search/workspace-search-contract";

const workspaceKernelInlineThresholdBytes = 1_500_000;
const workspaceExtractionHealingThrottleMs = 60_000;
const workspacePurgeMaximumAttempts = 5;
const documentSessionPurgeBatchSize = 6;

export { setWorkspaceKernelUserHeaders };

export class WorkspaceKernel extends Agent<Cloudflare.Env> {
	private lastExtractionHealingRequestAt = 0;
	// A purge empties storage without evicting this instance, so kernel queries
	// route through here rather than read a schema that no longer exists. The
	// file store holds its own handle on `ctx.storage.sql` and is not covered:
	// after a purge it fails on the missing table instead, which is the same
	// outcome with a worse message on an object that is being deleted anyway.
	private purged = false;
	private readonly kernelSql: WorkspaceKernelSql = (strings, ...values) => {
		if (this.purged) {
			throw new Error("Workspace deleted.");
		}

		return this.sql(strings, ...values);
	};
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
	private readonly search = new WorkspaceSearchProjection({
		ai: this.env.AI,
		bucket: this.env.WORKSPACE_KERNEL_FILES,
		getItems: () => this.store.getPageItems(),
		requestRun: () => this.ctx.waitUntil(this.scheduleWorkspaceSearchIndexing()),
		sql: this.kernelSql,
		vectorize: this.env.WORKSPACE_SEARCH,
		workspace: this.workspace,
		workspaceId: () => this.name,
	});
	private readonly events = new WorkspaceKernelEventBus({
		sql: this.kernelSql,
		workspaceId: () => this.name,
		getNextRevision: () => this.store.getNextRevision(),
		broadcast: (message) => this.broadcastRealtimeMessage(message),
		onCommit: (event) => {
			try {
				this.search.observe(event);
			} catch (error) {
				recordOperationalFailure({
					error,
					event: "workspace_search_projection",
					fields: {
						event_type: event.type,
						workspace_id: this.name,
					},
				});
			}
		},
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

	constructor(ctx: DurableObjectState, env: Cloudflare.Env) {
		super(ctx, env);
		// Constructor writes commit with whichever invocation constructed the
		// instance, so a canceled one rolls the schema back under a live object.
		void ctx.blockConcurrencyWhile(async () => {
			initializeWorkspaceKernelStorage(this.kernelSql);
			this.search.initialize();
		});
	}

	async onStart() {
		if (this.search.hasPending()) {
			await this.scheduleWorkspaceSearchIndexing();
		}
		this.requestWorkspaceFileExtractionHealing();
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
		this.requestWorkspaceFileExtractionHealing();
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
			getItemFacts: (listedItems) => this.store.getItemFacts(listedItems),
			tree: buildWorkspaceKernelTree(items),
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
			await this.purgeDeletedDocumentSessions({ itemIds: command.result.deletedItemIds });
			return command;
		});
	}

	async purgeDeletedDocumentSessions(input: {
		itemIds: string[];
		attempt?: number;
	}): Promise<void> {
		const documentItemIds = input.itemIds.filter(
			(itemId) => this.store.getItemRowIncludingDeleted(itemId)?.type === "document",
		);
		const failedItemIds: string[] = [];

		for (let offset = 0; offset < documentItemIds.length; offset += documentSessionPurgeBatchSize) {
			const batch = documentItemIds.slice(offset, offset + documentSessionPurgeBatchSize);
			const results = await Promise.allSettled(
				batch.map((itemId) =>
					getDocumentSessionForDeletionFromEnv(this.env, {
						workspaceId: this.name,
						itemId,
					}).purgeForDeletion(),
				),
			);

			for (const [index, result] of results.entries()) {
				if (result.status === "rejected") {
					const itemId = batch[index];
					if (!itemId) {
						continue;
					}
					failedItemIds.push(itemId);
					recordOperationalFailure({
						error: result.reason,
						event: "workspace_document_purge",
						fields: {
							item_id: itemId,
							reason: "item_deleted",
							workspace_id: this.name,
						},
					});
				}
			}
		}

		const attempt = input.attempt ?? 1;
		if (failedItemIds.length > 0 && attempt < workspacePurgeMaximumAttempts) {
			await this.schedule(
				attempt * 5,
				"purgeDeletedDocumentSessions",
				{ itemIds: failedItemIds, attempt: attempt + 1 },
				{ idempotent: false },
			);
		}
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

	async searchWorkspace(input: WorkspaceSearchInput) {
		this.requestWorkspaceFileExtractionHealing();
		if (this.search.hasPending()) {
			this.ctx.waitUntil(this.scheduleWorkspaceSearchIndexing());
		}
		return await this.search.search(input);
	}

	async processWorkspaceSearchIndex() {
		if (await this.search.processBatch()) {
			// The current one-shot schedule is removed after this callback returns,
			// so its successor must not deduplicate onto the executing row.
			await this.scheduleWorkspaceSearchIndexing(false);
		}
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

	async purgeForDeletion(input: { attempt?: number } = {}): Promise<ResourcePurgeResult> {
		const workspaceId = this.name;
		const documentItemIds = this.store.getAllDocumentItemIds();
		let failed = 0;

		try {
			await this.search.purgeVectors();
		} catch (error) {
			failed += 1;
			recordOperationalFailure({
				error,
				event: "workspace_search_purge",
				fields: { workspace_id: workspaceId },
			});
		}

		for (const itemId of documentItemIds) {
			try {
				await getDocumentSessionForDeletionFromEnv(this.env, {
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

		const r2PurgeResults = await Promise.allSettled([
			deleteR2Prefix(
				this.env.WORKSPACE_KERNEL_FILES,
				getChatAttachmentWorkspacePrefix(workspaceId),
			),
			deleteR2Prefix(this.env.WORKSPACE_KERNEL_FILES, `uploads/workspaces/${workspaceId}/`),
			deleteR2Prefix(this.env.WORKSPACE_KERNEL_FILES, `workspace_kernel_files/${workspaceId}/`),
			deleteR2Prefix(this.env.WORKSPACE_KERNEL_FILES, `workspace_file_objects/${workspaceId}/`),
			deleteR2Prefix(this.env.WORKSPACE_KERNEL_FILES, `workspace_file_uploads/${workspaceId}/`),
		]);
		const r2Failures = r2PurgeResults.filter((result) => result.status === "rejected");
		if (r2Failures.length > 0) {
			failed += 1;
			for (const result of r2Failures) {
				recordOperationalFailure({
					error: result.reason,
					event: "workspace_r2_purge",
					fields: { workspace_id: workspaceId },
				});
			}
		}

		// Keep the local inventory when a remote purge fails so cleanup can be retried.
		if (failed === 0) {
			for (const connection of this.getConnections()) {
				connection.close(1008, "Workspace deleted");
			}
			await this.ctx.storage.deleteAll();
			this.purged = true;
		} else {
			const attempt = input.attempt ?? 1;
			if (attempt < workspacePurgeMaximumAttempts) {
				await this.schedule(
					attempt * 5,
					"purgeForDeletion",
					{ attempt: attempt + 1 },
					{
						// A retry scheduled from the executing one-shot needs its own row.
						idempotent: false,
					},
				);
			}
		}
		return { attempted: documentItemIds.length + 2, failed };
	}

	private async scheduleWorkspaceSearchIndexing(idempotent = true) {
		await this.schedule(1, "processWorkspaceSearchIndex", undefined, {
			idempotent,
			retry: {
				baseDelayMs: 250,
				maxAttempts: 5,
				maxDelayMs: 3_000,
			},
		});
	}

	private requestWorkspaceFileExtractionHealing() {
		const now = Date.now();
		if (now - this.lastExtractionHealingRequestAt < workspaceExtractionHealingThrottleMs) {
			return;
		}
		this.lastExtractionHealingRequestAt = now;
		this.ctx.waitUntil(
			reconcileWorkspaceFileExtractions({
				sql: this.kernelSql,
				workflow: this.env.WORKSPACE_FILE_EXTRACTION_WORKFLOW,
				workspaceId: this.name,
			}).catch((error) => {
				recordOperationalFailure({
					error,
					event: "workspace_file_extraction_healing",
					fields: { workspace_id: this.name },
				});
			}),
		);
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
