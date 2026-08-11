import type { Workspace as ShellWorkspace } from "@cloudflare/shell";

import type { WorkspaceItemSummary } from "#/features/workspaces/contracts";
import { workspaceItemTypeSchema } from "#/features/workspaces/contracts";
import {
	buildWorkspaceItemCreateBootstrap,
	persistDocumentItemContentUpdate,
} from "#/features/workspaces/documents/document-item-content";
import type { WorkspaceKernelEventBus } from "#/features/workspaces/kernel/workspace-kernel-events";
import type { WorkspaceKernelHistory } from "#/features/workspaces/history/workspace-kernel-history";
import {
	getInitialWorkspaceKernelContent,
	getWorkspaceKernelContentMimeType,
	getWorkspaceKernelShellPath,
} from "#/features/workspaces/kernel/workspace-kernel-files";
import {
	type KernelItemRow,
	mapKernelItemRow,
} from "#/features/workspaces/kernel/workspace-kernel-rows";
import type { WorkspaceKernelRelations } from "#/features/workspaces/kernel/workspace-kernel-relations";
import type { WorkspaceKernelSql } from "#/features/workspaces/kernel/workspace-kernel-schema";
import type { WorkspaceKernelStore } from "#/features/workspaces/kernel/workspace-kernel-store";
import type {
	CreateWorkspaceKernelItemArgs,
	DeleteWorkspaceKernelItemsArgs,
	MoveWorkspaceKernelItemsArgs,
	MoveWorkspaceKernelItemsResult,
	ReadWorkspaceItemContentArgs,
	RenameWorkspaceKernelItemArgs,
	UpdateWorkspaceKernelItemColorArgs,
	CommitWorkspaceItemContentArgs,
	WorkspaceKernelMutationOutcome,
	WorkspaceKernelContentCommitOutcome,
} from "#/features/workspaces/kernel/workspace-kernel-types";
import {
	resolveWorkspaceItemColorForCreate,
	workspaceItemSupportsCustomColor,
} from "#/features/workspaces/model/workspace-item-colors";
import type { WorkspaceCommandResult } from "#/features/workspaces/realtime/messages";
import { recordOperationalFailure } from "#/integrations/observability/operational-events";

export class WorkspaceKernelItemCommands {
	private readonly events: WorkspaceKernelEventBus;
	private readonly history: WorkspaceKernelHistory;
	private readonly relations: WorkspaceKernelRelations;
	private readonly sql: WorkspaceKernelSql;
	private readonly store: WorkspaceKernelStore;
	private readonly workspace: ShellWorkspace;
	private readonly workspaceId: () => string;

	constructor(input: {
		events: WorkspaceKernelEventBus;
		history: WorkspaceKernelHistory;
		relations: WorkspaceKernelRelations;
		sql: WorkspaceKernelSql;
		store: WorkspaceKernelStore;
		workspace: ShellWorkspace;
		workspaceId: () => string;
	}) {
		this.events = input.events;
		this.history = input.history;
		this.relations = input.relations;
		this.sql = input.sql;
		this.store = input.store;
		this.workspace = input.workspace;
		this.workspaceId = input.workspaceId;
	}

	async createItem(
		input: CreateWorkspaceKernelItemArgs,
	): Promise<WorkspaceKernelMutationOutcome<WorkspaceItemSummary>> {
		const type = workspaceItemTypeSchema.parse(input.type);

		if (type === "file") {
			throw new Error("Binary workspace files must be created through the upload flow.");
		}

		const id = input.id;
		const parentId = input.parentId ?? null;

		const color = resolveWorkspaceItemColorForCreate({
			type,
			color: input.color,
		});
		const now = Date.now();

		if (this.store.getItemRowIncludingDeleted(id)) {
			throw new Error("Workspace item id already exists.");
		}

		this.store.assertParentIsValid(parentId);
		const nameResolution = this.store.resolveItemName({
			itemId: id,
			type,
			parentId,
			requestedName: input.name,
			onNameConflict: input.onNameConflict,
		});

		if (nameResolution.status === "conflict") {
			return nameResolution;
		}

		const name = nameResolution.name;
		const initialRelations = input.initialRelations ?? [];

		for (const relation of initialRelations) {
			if (relation.fromItemId !== id) {
				throw new Error("Initial workspace relations must originate from the created item.");
			}

			this.store.assertActiveItem(relation.toItemId);
		}
		const shellPath = getWorkspaceKernelShellPath({ id, type });
		const { initialContent, metadataJson } = buildWorkspaceItemCreateBootstrap({
			type,
			metadataJson: input.metadataJson ?? {},
			initialContent: input.initialContent,
		});
		const contentType = getWorkspaceKernelContentMimeType(type);
		const preparedContent =
			type === "folder"
				? null
				: await this.history.prepareContent(
						id,
						initialContent ?? getInitialWorkspaceKernelContent(type),
						contentType,
					);

		await this.createWorkspaceFile({
			type,
			shellPath,
			initialContent,
		});

		// Keep these writes synchronous. SQLite-backed Durable Objects coalesce
		// writes without an intervening await into one atomic implicit transaction.
		this.sql`
			INSERT INTO kernel_items (
				id,
				parent_id,
				type,
				name,
				color,
				metadata_json,
				sort_order,
				shell_path,
				created_at,
				updated_at,
				deleted_at
			)
			VALUES (
				${id},
				${parentId},
				${type},
				${name},
				${color},
				${JSON.stringify(metadataJson)},
				${this.store.getNextSortOrder(parentId)},
				${shellPath},
				${now},
				${now},
				NULL
			)
		`;

		const item = this.store.requireItem(id);
		this.relations.createRelations(initialRelations);
		const factItemIds = Array.from(
			new Set([id, ...initialRelations.flatMap((relation) => [relation.toItemId])]),
		);
		const itemFacts = this.store.getItemFacts(
			factItemIds.map((itemId) => this.store.requireItem(itemId)),
		);
		const versionId = preparedContent ? (input.clientMutationId ?? crypto.randomUUID()) : null;
		const event = this.events.commit(
			{
				type: "workspace.item.created",
				actorUserId: input.actorUserId ?? null,
				clientMutationId: input.clientMutationId ?? null,
				payload: { item, itemFacts, versionId },
				provenance: input.provenance,
			},
			preparedContent && versionId
				? {
						onPersist: (persistedEvent) =>
							this.history.insertVersion({
								content: preparedContent,
								event: persistedEvent,
								itemId: id,
								itemType: type,
								previous: null,
								versionId,
							}),
					}
				: {},
		);

		return { command: { result: item, event }, status: "applied" };
	}

	async renameItem(
		input: RenameWorkspaceKernelItemArgs,
	): Promise<WorkspaceKernelMutationOutcome<WorkspaceItemSummary>> {
		if (!input.name.trim()) {
			throw new Error("Item name is required.");
		}

		const existingItem = this.store.assertActiveItem(input.itemId);
		const type = workspaceItemTypeSchema.parse(existingItem.type);
		const nameResolution = this.store.resolveItemName({
			itemId: existingItem.id,
			type,
			parentId: existingItem.parent_id,
			requestedName: input.name,
			excludeItemId: existingItem.id,
			onNameConflict: input.onNameConflict,
		});

		if (nameResolution.status === "conflict") {
			return nameResolution;
		}

		this.sql`
			UPDATE kernel_items
		SET name = ${nameResolution.name}, updated_at = ${Date.now()}
			WHERE id = ${input.itemId} AND deleted_at IS NULL
		`;

		return {
			command: this.commitItemEvent({
				type: "workspace.item.renamed",
				itemId: input.itemId,
				actorUserId: input.actorUserId,
				clientMutationId: input.clientMutationId,
				provenance: input.provenance,
			}),
			status: "applied",
		};
	}

	async moveItems(
		input: MoveWorkspaceKernelItemsArgs,
	): Promise<WorkspaceKernelMutationOutcome<MoveWorkspaceKernelItemsResult>> {
		const parentId = input.parentId ?? null;
		const movesByItemId = new Map(input.items.map((item) => [item.itemId, item]));
		const roots = this.getUniqueRootRows(input.items.map((item) => item.itemId));
		const movedItems: WorkspaceItemSummary[] = [];

		this.store.assertParentIsValid(parentId);

		for (const row of roots) {
			this.store.assertNotMovingIntoDescendant(row.id, parentId);
		}

		const plannedMoves = this.planMoveRows({
			movesByItemId,
			onNameConflict: input.onNameConflict,
			parentId,
			rows: roots,
		});

		if (plannedMoves.status === "conflict") {
			return plannedMoves;
		}

		for (const plannedMove of plannedMoves.rows) {
			movedItems.push(
				this.moveItemRow({
					name: plannedMove.name,
					parentId,
					row: plannedMove.row,
					sortOrder: plannedMove.sortOrder,
				}),
			);
		}

		const event = this.events.commit({
			type: "workspace.items.moved",
			actorUserId: input.actorUserId ?? null,
			clientMutationId: input.clientMutationId ?? null,
			payload: { items: movedItems },
			provenance: input.provenance,
		});

		return { command: { result: movedItems, event }, status: "applied" };
	}

	async updateItemColor(
		input: UpdateWorkspaceKernelItemColorArgs,
	): Promise<WorkspaceCommandResult<WorkspaceItemSummary>> {
		const item = this.store.assertActiveItem(input.itemId);
		const type = workspaceItemTypeSchema.parse(item.type);

		if (!workspaceItemSupportsCustomColor(type)) {
			throw new Error("Only folders support custom colors.");
		}

		this.sql`
			UPDATE kernel_items
			SET color = ${input.color}, updated_at = ${Date.now()}
			WHERE id = ${input.itemId} AND deleted_at IS NULL
		`;

		return this.commitItemEvent({
			type: "workspace.item.color.updated",
			itemId: input.itemId,
			actorUserId: input.actorUserId,
			clientMutationId: input.clientMutationId,
			provenance: input.provenance,
		});
	}

	tombstoneItems(input: DeleteWorkspaceKernelItemsArgs) {
		const roots = this.getActiveUniqueRootRows(input.itemIds);
		const rootIds = roots.map((root) => root.id);
		const deleteIds = this.getDeleteItemIds(roots);
		const rowsToRemove = deleteIds
			.map((id) => this.store.getItemRowIncludingDeleted(id))
			.filter((row): row is KernelItemRow => Boolean(row));
		const deletedItems = rowsToRemove.map((row) => mapKernelItemRow(row, this.workspaceId()));
		const relatedItemIds = this.relations.listRelatedItemIds(deleteIds);

		this.store.softDeleteItems(deleteIds, Date.now());
		this.relations.deleteRelationsForItems(deleteIds);
		const itemFacts = this.store.getItemFacts(
			relatedItemIds.map((itemId) => this.store.requireItem(itemId)),
		);
		const result = { itemIds: rootIds, deletedItemIds: deleteIds };
		const event = this.events.commit({
			type: "workspace.item.deleted",
			actorUserId: input.actorUserId ?? null,
			clientMutationId: input.clientMutationId ?? null,
			payload: { itemIds: rootIds, deletedItemIds: deleteIds, itemFacts, items: deletedItems },
			provenance: input.provenance,
		});

		return {
			command: { result, event },
			shellPaths: rowsToRemove.map((row) => row.shell_path),
		};
	}

	async deleteShellPaths(shellPaths: string[]) {
		try {
			await Promise.all(
				shellPaths.map((shellPath) =>
					this.workspace.rm(shellPath, {
						recursive: true,
						force: true,
					}),
				),
			);
		} catch (error) {
			recordOperationalFailure({
				error,
				event: "workspace_shell_cleanup",
				fields: {
					item_count: shellPaths.length,
					workspace_id: this.workspaceId(),
				},
			});
		}
	}

	async readItemContent(input: ReadWorkspaceItemContentArgs) {
		const item = this.store.assertActiveItem(input.itemId);
		if (item.type === "folder" || item.type === "file") {
			throw new Error("This workspace item does not store editable inline content.");
		}
		const itemSummary = mapKernelItemRow(item, this.workspaceId());
		return {
			item: itemSummary,
			content: await this.workspace.readFile(item.shell_path),
		};
	}

	async commitItemContent(
		input: CommitWorkspaceItemContentArgs,
	): Promise<WorkspaceKernelContentCommitOutcome> {
		const item = this.store.getActiveItemRow(input.itemId);
		if (!item) {
			return { status: "discarded" };
		}
		const type = workspaceItemTypeSchema.parse(item.type);

		if (type === "folder" || type === "file") {
			throw new Error("This workspace item does not store editable inline content.");
		}
		const contentType = getWorkspaceKernelContentMimeType(type);
		const previousContent = await this.workspace.readFile(item.shell_path);
		if (previousContent === null) {
			throw new Error("Workspace item content is missing.");
		}
		const contentChanged = input.content !== previousContent;
		if (!contentChanged && !input.createVersion) {
			return { eventId: null, status: "applied", versionId: null };
		}
		const versionPlan = input.createVersion
			? await this.history.planVersion({
					content: input.content,
					contentChanged,
					itemId: input.itemId,
				})
			: { shouldCreate: false as const };
		// Human versions summarize an editing window, not only the last shell
		// autosave. Their before-side is therefore the previous visible version.
		// Required AI and restore versions still use the exact live body they
		// replaced so their receipt can be reviewed and reversed precisely.
		const previousVisibleVersion =
			input.provenance?.origin === "human"
				? this.history.getLatestVersionContent(input.itemId)
				: null;
		const [preparedContent, previous] = versionPlan.shouldCreate
			? await Promise.all([
					this.history.prepareContent(
						input.itemId,
						input.content,
						contentType,
						versionPlan.contentHash,
					),
					previousVisibleVersion ??
						this.history.prepareContent(input.itemId, previousContent, contentType),
				])
			: [null, null];
		if (!contentChanged && !versionPlan.shouldCreate) {
			return { eventId: null, status: "applied", versionId: null };
		}

		if (contentChanged) {
			await this.workspace.writeFile(item.shell_path, input.content, contentType);
		}

		const currentItem = this.store.getActiveItemRow(input.itemId);
		if (!currentItem) {
			if (contentChanged) await this.workspace.rm(item.shell_path, { force: true });
			return { status: "discarded" };
		}
		if (contentChanged) {
			const updatedAt = Math.max(Date.now(), currentItem.updated_at + 1);
			if (type === "document") {
				persistDocumentItemContentUpdate({
					content: input.content,
					itemId: input.itemId,
					metadataJson: currentItem.metadata_json,
					sql: this.sql,
					updatedAt,
				});
			} else {
				this.sql`UPDATE kernel_items SET updated_at = ${updatedAt} WHERE id = ${input.itemId}`;
			}
		}

		const versionId = versionPlan.shouldCreate
			? (input.versionId ?? input.clientMutationId ?? crypto.randomUUID())
			: null;
		const command = this.commitItemEvent(
			{
				type: "workspace.item.content.updated",
				itemId: input.itemId,
				actorUserId: input.actorUserId,
				clientMutationId: input.clientMutationId,
				provenance: input.provenance,
				versionId,
			},
			versionPlan.shouldCreate && versionId && preparedContent && previous
				? {
						onPersist: (event) =>
							this.history.insertVersion({
								content: preparedContent,
								event,
								itemId: input.itemId,
								itemType: type,
								previous,
								versionId,
							}),
					}
				: { persist: false },
		);
		return { eventId: command.event.id, status: "applied", versionId };
	}

	private async createWorkspaceFile(input: {
		type: WorkspaceItemSummary["type"];
		shellPath: string;
		initialContent?: string;
	}) {
		if (input.type === "folder") {
			await this.workspace.mkdir(input.shellPath, { recursive: true });
			return;
		}

		await this.workspace.writeFile(
			input.shellPath,
			input.initialContent ?? getInitialWorkspaceKernelContent(input.type),
			getWorkspaceKernelContentMimeType(input.type),
		);
	}

	private commitItemEvent(
		input: {
			type:
				| "workspace.item.renamed"
				| "workspace.item.color.updated"
				| "workspace.item.content.updated";
			itemId: string;
			actorUserId?: string | null;
			clientMutationId?: string | null;
			provenance?: CreateWorkspaceKernelItemArgs["provenance"];
			versionId?: string | null;
		},
		options?: Parameters<WorkspaceKernelEventBus["commit"]>[1],
	) {
		const item = this.store.requireItem(input.itemId);
		const event = this.events.commit(
			{
				type: input.type,
				actorUserId: input.actorUserId ?? null,
				clientMutationId: input.clientMutationId ?? null,
				payload: { item, versionId: input.versionId },
				provenance: input.provenance,
			},
			options,
		);

		return { result: item, event };
	}

	private moveItemRow(input: {
		name: string;
		row: KernelItemRow;
		parentId: string | null;
		sortOrder?: number;
	}) {
		this.sql`
			UPDATE kernel_items
			SET
				parent_id = ${input.parentId},
				name = ${input.name},
				sort_order = ${input.sortOrder ?? this.store.getNextSortOrder(input.parentId)},
				updated_at = ${Date.now()}
			WHERE id = ${input.row.id} AND deleted_at IS NULL
		`;

		return this.store.requireItem(input.row.id);
	}

	private planMoveRows(input: {
		movesByItemId: ReadonlyMap<
			string,
			{
				itemId: string;
				sortOrder?: number;
			}
		>;
		onNameConflict?: "rename" | "error";
		parentId: string | null;
		rows: KernelItemRow[];
	}) {
		const reservedNames: string[] = [];

		const rows: Array<{
			name: string;
			row: KernelItemRow;
			sortOrder?: number;
		}> = [];

		for (const row of input.rows) {
			const type = workspaceItemTypeSchema.parse(row.type);
			const nameResolution = this.store.resolveItemName({
				itemId: row.id,
				type,
				parentId: input.parentId,
				requestedName: row.name,
				excludeItemId: row.id,
				onNameConflict: input.onNameConflict,
				reservedNames,
			});

			if (nameResolution.status === "conflict") {
				return nameResolution;
			}

			reservedNames.push(nameResolution.name);

			rows.push({
				name: nameResolution.name,
				row,
				sortOrder: input.movesByItemId.get(row.id)?.sortOrder,
			});
		}

		return { rows, status: "resolved" as const };
	}

	private getUniqueRootRows(itemIds: string[]) {
		const uniqueItemIds = Array.from(new Set(itemIds));

		if (uniqueItemIds.length === 0) {
			throw new Error("At least one workspace item is required.");
		}

		const selectedItemIds = new Set(uniqueItemIds);

		return uniqueItemIds
			.map((itemId) => this.store.assertActiveItem(itemId))
			.filter((row) => !this.hasSelectedAncestor(row, selectedItemIds));
	}

	private getActiveUniqueRootRows(itemIds: string[]) {
		const uniqueItemIds = Array.from(new Set(itemIds));

		if (uniqueItemIds.length === 0) {
			throw new Error("At least one workspace item is required.");
		}

		const rows = uniqueItemIds
			.map((itemId) => this.store.getActiveItemRow(itemId))
			.filter((row): row is KernelItemRow => Boolean(row));
		const selectedItemIds = new Set(rows.map((row) => row.id));

		return rows.filter((row) => !this.hasSelectedAncestor(row, selectedItemIds));
	}

	private hasSelectedAncestor(row: KernelItemRow, selectedItemIds: ReadonlySet<string>) {
		const seenItemIds = new Set<string>([row.id]);
		let parentId = row.parent_id;

		while (parentId) {
			if (selectedItemIds.has(parentId)) {
				return true;
			}

			if (seenItemIds.has(parentId)) {
				return false;
			}

			seenItemIds.add(parentId);
			const parent = this.store.getItemRowIncludingDeleted(parentId);

			if (!parent || parent.deleted_at) {
				return false;
			}

			parentId = parent.parent_id;
		}

		return false;
	}

	private getDeleteItemIds(roots: KernelItemRow[]) {
		const itemIds: string[] = [];
		const seenItemIds = new Set<string>();

		for (const root of roots) {
			for (const itemId of [root.id, ...this.store.getDescendantIds(root.id)]) {
				if (seenItemIds.has(itemId)) {
					continue;
				}

				seenItemIds.add(itemId);
				itemIds.push(itemId);
			}
		}

		return itemIds;
	}
}
