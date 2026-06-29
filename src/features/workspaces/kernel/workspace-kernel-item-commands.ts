import type { Workspace as ShellWorkspace } from "@cloudflare/shell";

import type { WorkspaceItemSummary } from "#/features/workspaces/contracts";
import { workspaceItemTypeSchema } from "#/features/workspaces/contracts";
import {
	buildWorkspaceItemCreateBootstrap,
	persistDocumentItemContentUpdate,
	touchWorkspaceItemUpdatedAt,
} from "#/features/workspaces/documents/document-item-content";
import type { WorkspaceKernelEventBus } from "#/features/workspaces/kernel/workspace-kernel-events";
import {
	getInitialWorkspaceKernelContent,
	getWorkspaceKernelContentMimeType,
	getWorkspaceKernelShellPath,
} from "#/features/workspaces/kernel/workspace-kernel-files";
import {
	type KernelItemRow,
	mapKernelItemRow,
} from "#/features/workspaces/kernel/workspace-kernel-rows";
import type { WorkspaceKernelSql } from "#/features/workspaces/kernel/workspace-kernel-schema";
import type { WorkspaceKernelStore } from "#/features/workspaces/kernel/workspace-kernel-store";
import type {
	CreateWorkspaceKernelItemArgs,
	DeleteWorkspaceKernelItemsArgs,
	DeleteWorkspaceKernelItemsResult,
	MoveWorkspaceKernelItemsArgs,
	MoveWorkspaceKernelItemsResult,
	ReadWorkspaceKernelItemArgs,
	RenameWorkspaceKernelItemArgs,
	UpdateWorkspaceKernelItemColorArgs,
	WriteWorkspaceKernelItemArgs,
} from "#/features/workspaces/kernel/workspace-kernel-types";
import {
	resolveWorkspaceItemColorForCreate,
	workspaceItemSupportsCustomColor,
} from "#/features/workspaces/model/workspace-item-colors";
import type { WorkspaceCommandResult } from "#/features/workspaces/realtime/messages";

export class WorkspaceKernelItemCommands {
	private readonly events: WorkspaceKernelEventBus;
	private readonly sql: WorkspaceKernelSql;
	private readonly store: WorkspaceKernelStore;
	private readonly workspace: ShellWorkspace;
	private readonly workspaceId: () => string;

	constructor(input: {
		events: WorkspaceKernelEventBus;
		sql: WorkspaceKernelSql;
		store: WorkspaceKernelStore;
		workspace: ShellWorkspace;
		workspaceId: () => string;
	}) {
		this.events = input.events;
		this.sql = input.sql;
		this.store = input.store;
		this.workspace = input.workspace;
		this.workspaceId = input.workspaceId;
	}

	async createItem(
		input: CreateWorkspaceKernelItemArgs,
	): Promise<WorkspaceCommandResult<WorkspaceItemSummary>> {
		const type = workspaceItemTypeSchema.parse(input.type);
		const id = input.id ?? crypto.randomUUID();
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
		const name = this.store.resolveItemName({
			itemId: id,
			type,
			parentId,
			requestedName: input.name,
			onNameConflict: input.onNameConflict,
		});
		const shellPath = getWorkspaceKernelShellPath({ id, type });
		const { initialContent, metadataJson } = buildWorkspaceItemCreateBootstrap({
			type,
			name,
			metadataJson: input.metadataJson ?? {},
			initialContent: input.initialContent,
		});

		await this.createWorkspaceFile({
			type,
			name,
			shellPath,
			initialContent,
		});

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
		const event = this.events.commit({
			type: "workspace.item.created",
			actorUserId: input.actorUserId ?? null,
			clientMutationId: input.clientMutationId ?? null,
			payload: { item },
		});

		return { result: item, event };
	}

	async renameItem(
		input: RenameWorkspaceKernelItemArgs,
	): Promise<WorkspaceCommandResult<WorkspaceItemSummary>> {
		if (!input.name.trim()) {
			throw new Error("Item name is required.");
		}

		const existingItem = this.store.assertActiveItem(input.itemId);
		const type = workspaceItemTypeSchema.parse(existingItem.type);
		const name = this.store.resolveItemName({
			itemId: existingItem.id,
			type,
			parentId: existingItem.parent_id,
			requestedName: input.name,
			excludeItemId: existingItem.id,
			onNameConflict: input.onNameConflict,
		});

		this.sql`
			UPDATE kernel_items
			SET name = ${name}, updated_at = ${Date.now()}
			WHERE id = ${input.itemId} AND deleted_at IS NULL
		`;

		return this.commitItemEvent({
			type: "workspace.item.renamed",
			itemId: input.itemId,
			actorUserId: input.actorUserId,
			clientMutationId: input.clientMutationId,
		});
	}

	async moveItems(
		input: MoveWorkspaceKernelItemsArgs,
	): Promise<WorkspaceCommandResult<MoveWorkspaceKernelItemsResult>> {
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

		for (const plannedMove of plannedMoves) {
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
		});

		return { result: movedItems, event };
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
		});
	}

	async deleteItems(
		input: DeleteWorkspaceKernelItemsArgs,
	): Promise<WorkspaceCommandResult<DeleteWorkspaceKernelItemsResult>> {
		const roots = this.getUniqueRootRows(input.itemIds);
		const rootIds = roots.map((root) => root.id);
		const deleteIds = this.getDeleteItemIds(roots);
		const rowsToRemove = deleteIds
			.map((id) => this.store.getItemRowIncludingDeleted(id))
			.filter((row): row is KernelItemRow => Boolean(row));

		this.store.softDeleteItems(deleteIds, Date.now());
		await Promise.all(
			rowsToRemove.map((row) =>
				this.workspace.rm(row.shell_path, {
					recursive: true,
					force: true,
				}),
			),
		);

		const result = { itemIds: rootIds, deletedItemIds: deleteIds };
		const event = this.events.commit({
			type: "workspace.item.deleted",
			actorUserId: input.actorUserId ?? null,
			clientMutationId: input.clientMutationId ?? null,
			payload: { itemIds: rootIds, deletedItemIds: deleteIds },
		});

		return { result, event };
	}

	async readItem(input: ReadWorkspaceKernelItemArgs) {
		const item = this.store.assertActiveItem(input.itemId);
		const itemSummary = mapKernelItemRow(item, this.workspaceId());

		return item.type === "folder"
			? { item: itemSummary, content: null }
			: {
					item: itemSummary,
					content: await this.workspace.readFile(item.shell_path),
				};
	}

	async writeItem(
		input: WriteWorkspaceKernelItemArgs,
	): Promise<WorkspaceCommandResult<WorkspaceItemSummary>> {
		const item = this.store.assertActiveItem(input.itemId);
		const type = workspaceItemTypeSchema.parse(item.type);

		if (type === "folder") {
			throw new Error("Folders do not have writable content.");
		}

		await this.workspace.writeFile(
			item.shell_path,
			input.content,
			getWorkspaceKernelContentMimeType(type),
		);

		const now = Date.now();

		if (type === "document") {
			persistDocumentItemContentUpdate({
				content: input.content,
				itemId: input.itemId,
				metadataJson: item.metadata_json,
				sql: this.sql,
				updatedAt: now,
			});
		} else {
			touchWorkspaceItemUpdatedAt({
				itemId: input.itemId,
				sql: this.sql,
				updatedAt: now,
			});
		}

		return this.commitItemEvent({
			type: "workspace.item.content.updated",
			itemId: input.itemId,
			actorUserId: input.actorUserId,
			clientMutationId: input.clientMutationId,
		});
	}

	private async createWorkspaceFile(input: {
		type: WorkspaceItemSummary["type"];
		name: string;
		shellPath: string;
		initialContent?: string;
	}) {
		if (input.type === "folder") {
			await this.workspace.mkdir(input.shellPath, { recursive: true });
			return;
		}

		await this.workspace.writeFile(
			input.shellPath,
			input.initialContent ?? getInitialWorkspaceKernelContent(input.type, input.name),
			getWorkspaceKernelContentMimeType(input.type),
		);
	}

	private commitItemEvent(input: {
		type:
			| "workspace.item.renamed"
			| "workspace.item.color.updated"
			| "workspace.item.content.updated";
		itemId: string;
		actorUserId?: string | null;
		clientMutationId?: string | null;
	}) {
		const item = this.store.requireItem(input.itemId);
		const event = this.events.commit({
			type: input.type,
			actorUserId: input.actorUserId ?? null,
			clientMutationId: input.clientMutationId ?? null,
			payload: { item },
		});

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

		return input.rows.map((row) => {
			const type = workspaceItemTypeSchema.parse(row.type);
			const name = this.store.resolveItemName({
				itemId: row.id,
				type,
				parentId: input.parentId,
				requestedName: row.name,
				excludeItemId: row.id,
				onNameConflict: input.onNameConflict,
				reservedNames,
			});

			reservedNames.push(name);

			return {
				name,
				row,
				sortOrder: input.movesByItemId.get(row.id)?.sortOrder,
			};
		});
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
