import type { WorkspaceItemSummary, WorkspaceItemType } from "#/features/workspaces/contracts";
import {
	getAvailableWorkspaceItemName,
	normalizeWorkspaceItemName,
} from "#/features/workspaces/defaults";
import {
	type KernelItemRow,
	mapKernelItemRow,
} from "#/features/workspaces/kernel/workspace-kernel-rows";
import {
	type WorkspaceKernelSql,
	workspaceItemSortStep,
	workspaceRevisionKey,
} from "#/features/workspaces/kernel/workspace-kernel-schema";
import type { WorkspaceKernelNameConflictPolicy } from "#/features/workspaces/kernel/workspace-kernel-types";

export class WorkspaceKernelNameConflictError extends Error {
	constructor(
		readonly itemId?: string,
		readonly requestedName?: string,
	) {
		super("Workspace item name already exists.");
		this.name = "WorkspaceKernelNameConflictError";
	}
}

export class WorkspaceKernelStore {
	private readonly sql: WorkspaceKernelSql;
	private readonly workspaceId: () => string;

	constructor(input: { sql: WorkspaceKernelSql; workspaceId: () => string }) {
		this.sql = input.sql;
		this.workspaceId = input.workspaceId;
	}

	getPageItems(): WorkspaceItemSummary[] {
		return this.sql<KernelItemRow>`
			SELECT *
			FROM kernel_items
			WHERE deleted_at IS NULL
			ORDER BY parent_id ASC, sort_order ASC, name ASC
		`.map((row) => mapKernelItemRow(row, this.workspaceId()));
	}

	getAllDocumentItemIds(): string[] {
		return this.sql<{ id: string }>`
			SELECT id
			FROM kernel_items
			WHERE type = 'document'
		`.map((row) => row.id);
	}

	listItems(input: { parentId?: string | null; limit?: number } = {}): WorkspaceItemSummary[] {
		const parentFilter = input.parentId ?? null;
		const rows = this.sql<KernelItemRow>`
			SELECT *
			FROM kernel_items
			WHERE deleted_at IS NULL
				AND (
					(${parentFilter} IS NULL AND parent_id IS NULL)
					OR parent_id = ${parentFilter}
				)
			ORDER BY sort_order ASC, name ASC
			LIMIT ${Math.max(1, Math.min(input.limit ?? 80, 500))}
		`;

		return rows.map((row) => mapKernelItemRow(row, this.workspaceId()));
	}

	getCurrentRevision() {
		const [row] = this.sql<{ value: string }>`
			SELECT value
			FROM kernel_meta
			WHERE key = ${workspaceRevisionKey}
			LIMIT 1
		`;

		return Number.parseInt(row?.value ?? "0", 10) || 0;
	}

	getNextRevision() {
		const nextRevision = this.getCurrentRevision() + 1;
		this.sql`
			INSERT INTO kernel_meta (key, value, updated_at)
			VALUES (${workspaceRevisionKey}, ${String(nextRevision)}, ${Date.now()})
			ON CONFLICT(key) DO UPDATE SET
				value = excluded.value,
				updated_at = excluded.updated_at
		`;

		return nextRevision;
	}

	getNextSortOrder(parentId: string | null) {
		const [row] = this.sql<{ max_sort_order: number | null }>`
			SELECT MAX(sort_order) AS max_sort_order
			FROM kernel_items
			WHERE deleted_at IS NULL
				AND (
					(${parentId} IS NULL AND parent_id IS NULL)
					OR parent_id = ${parentId}
				)
		`;

		return (row?.max_sort_order ?? 0) + workspaceItemSortStep;
	}

	assertParentIsValid(parentId: string | null) {
		if (!parentId) {
			return;
		}

		const parent = this.assertActiveItem(parentId);

		if (parent.type !== "folder") {
			throw new Error("Items can only be moved into folders.");
		}
	}

	assertNotMovingIntoDescendant(itemId: string, parentId: string | null) {
		if (!parentId) {
			return;
		}

		if (itemId === parentId || this.getDescendantIds(itemId).includes(parentId)) {
			throw new Error("An item cannot be moved into itself.");
		}
	}

	getDescendantIds(itemId: string) {
		const descendantIds: string[] = [];
		const parentIds = [itemId];

		for (let index = 0; index < parentIds.length; index += 1) {
			const parentId = parentIds[index];

			if (!parentId) {
				continue;
			}

			const rows = this.sql<{ id: string }>`
				SELECT id
				FROM kernel_items
				WHERE parent_id = ${parentId} AND deleted_at IS NULL
			`;

			for (const row of rows) {
				descendantIds.push(row.id);
				parentIds.push(row.id);
			}
		}

		return descendantIds;
	}

	softDeleteItems(itemIds: string[], deletedAt: number) {
		for (const itemId of itemIds) {
			this.sql`
				UPDATE kernel_items
				SET deleted_at = ${deletedAt}, updated_at = ${deletedAt}
				WHERE id = ${itemId} AND deleted_at IS NULL
			`;
		}
	}

	resolveItemName(input: {
		itemId?: string;
		type: WorkspaceItemType;
		parentId: string | null;
		requestedName?: string;
		excludeItemId?: string;
		onNameConflict?: WorkspaceKernelNameConflictPolicy;
		reservedNames?: string[];
	}) {
		const existingNames = [
			...this.getActiveSiblingNames(input.parentId, input.excludeItemId),
			...(input.reservedNames ?? []),
		];
		const requestedName = input.requestedName
			? normalizeWorkspaceItemName(input.requestedName, "")
			: "";

		if (input.onNameConflict === "error") {
			if (!requestedName) {
				throw new WorkspaceKernelNameConflictError(input.itemId, input.requestedName);
			}

			if (existingNames.includes(requestedName)) {
				throw new WorkspaceKernelNameConflictError(input.itemId, requestedName);
			}

			return requestedName;
		}

		return getAvailableWorkspaceItemName({
			type: input.type,
			requestedName: input.requestedName,
			existingNames,
		});
	}

	requireItem(itemId: string) {
		return mapKernelItemRow(this.assertActiveItem(itemId), this.workspaceId());
	}

	assertActiveItem(itemId: string) {
		const row = this.getItemRow(itemId);

		if (!row) {
			throw new Error("Workspace item not found.");
		}

		return row;
	}

	getItemRowIncludingDeleted(itemId: string) {
		return (
			this.sql<KernelItemRow>`
				SELECT *
				FROM kernel_items
				WHERE id = ${itemId}
				LIMIT 1
			`[0] ?? null
		);
	}

	private getActiveSiblingNames(parentId: string | null, excludeItemId?: string) {
		const rows = this.sql<{ name: string }>`
			SELECT name
			FROM kernel_items
			WHERE deleted_at IS NULL
				AND (${excludeItemId ?? null} IS NULL OR id != ${excludeItemId ?? null})
				AND (
					(${parentId} IS NULL AND parent_id IS NULL)
					OR parent_id = ${parentId}
				)
		`;

		return rows.map((row) => row.name);
	}

	private getItemRow(itemId: string) {
		return (
			this.sql<KernelItemRow>`
				SELECT *
				FROM kernel_items
				WHERE id = ${itemId} AND deleted_at IS NULL
				LIMIT 1
			`[0] ?? null
		);
	}
}
