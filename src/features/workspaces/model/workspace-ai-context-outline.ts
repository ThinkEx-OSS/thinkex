import { getWorkspaceItemTypeMeta } from "#/features/workspaces/defaults";
import { buildWorkspaceKernelItemPathIndex } from "#/features/workspaces/kernel/workspace-kernel-paths";
import type { WorkspaceItem } from "#/features/workspaces/model/types";
import { resolveWorkspaceFileTypeFromItem } from "#/features/workspaces/model/workspace-file";

import type {
	WorkspaceAiContextOutline,
	WorkspaceAiContextOutlineItem,
	WorkspaceAiContextScope,
} from "./workspace-ai-context-types";

export const WORKSPACE_AI_CONTEXT_OUTLINE_ITEM_LIMIT = 50;

type WorkspaceAiContextOutlineRow = {
	item: WorkspaceItem;
	outlineItem: WorkspaceAiContextOutlineItem;
};

export function buildWorkspaceAiContextOutline(
	context: WorkspaceAiContextScope,
): WorkspaceAiContextOutline {
	const rows = getWorkspaceAiContextOutlineRows(context);
	const totalItems = rows.length;

	if (totalItems <= WORKSPACE_AI_CONTEXT_OUTLINE_ITEM_LIMIT) {
		return {
			status: "included",
			totalItems,
			items: rows.map((row) => row.outlineItem),
		};
	}

	const items = summarizeWorkspaceAiContextOutlineRows({
		rows,
		limit: WORKSPACE_AI_CONTEXT_OUTLINE_ITEM_LIMIT,
	}).map((row) => row.outlineItem);

	return {
		status: "summarized",
		totalItems,
		limit: WORKSPACE_AI_CONTEXT_OUTLINE_ITEM_LIMIT,
		omittedItems: totalItems - items.length,
		items,
	};
}

function getWorkspaceAiContextOutlineRows(
	context: WorkspaceAiContextScope,
): WorkspaceAiContextOutlineRow[] {
	const items = Array.from(context.itemsById.values());
	const pathsByItemId = buildWorkspaceKernelItemPathIndex(items);
	const childCountsByItemId = getWorkspaceAiContextOutlineChildCounts(items);
	const descendantCountsByItemId = getWorkspaceAiContextOutlineDescendantCounts(items);

	return Array.from(pathsByItemId, ([itemId, path]) => {
		const item = context.itemsById.get(itemId);

		if (!item) {
			throw new Error("Workspace outline path index returned an unknown item.");
		}

		const facts = context.itemFactsById.get(item.id);

		return {
			item,
			outlineItem: {
				...(facts?.pageCount ? { pageCount: facts.pageCount } : {}),
				relationshipCount: facts?.relationshipCount ?? 0,
				...(item.type === "folder"
					? {
							childCount: childCountsByItemId.get(item.id) ?? 0,
							descendantCount: descendantCountsByItemId.get(item.id) ?? 0,
						}
					: {}),
				path,
				type: resolveWorkspaceFileTypeFromItem(item)?.label ?? getWorkspaceItemTypeMeta(item.type),
			},
		};
	});
}

function summarizeWorkspaceAiContextOutlineRows(input: {
	rows: WorkspaceAiContextOutlineRow[];
	limit: number;
}) {
	const rows: WorkspaceAiContextOutlineRow[] = [];
	const selectedItemIds = new Set<string>();

	const addRow = (row: WorkspaceAiContextOutlineRow) => {
		if (rows.length >= input.limit || selectedItemIds.has(row.item.id)) {
			return;
		}

		selectedItemIds.add(row.item.id);
		rows.push(row);
	};

	for (const row of input.rows) {
		if (row.item.type === "folder") {
			addRow(row);
		}
	}

	for (const row of input.rows) {
		if (row.item.parentId === null && row.item.type !== "folder") {
			addRow(row);
		}
	}

	for (const row of input.rows) {
		addRow(row);
	}

	return rows;
}

function getWorkspaceAiContextOutlineChildCounts(items: WorkspaceItem[]) {
	const childCountsByItemId = new Map<string, number>();

	for (const item of items) {
		if (!item.parentId) {
			continue;
		}

		childCountsByItemId.set(item.parentId, (childCountsByItemId.get(item.parentId) ?? 0) + 1);
	}

	return childCountsByItemId;
}

function getWorkspaceAiContextOutlineDescendantCounts(items: WorkspaceItem[]) {
	const childrenByParentId = new Map<string | null, WorkspaceItem[]>();
	const descendantCountsByItemId = new Map<string, number>();

	for (const item of items) {
		const children = childrenByParentId.get(item.parentId) ?? [];
		children.push(item);
		childrenByParentId.set(item.parentId, children);
	}

	const countDescendants = (itemId: string): number => {
		const cachedCount = descendantCountsByItemId.get(itemId);

		if (cachedCount !== undefined) {
			return cachedCount;
		}

		const count = (childrenByParentId.get(itemId) ?? []).reduce(
			(total, child) => total + 1 + countDescendants(child.id),
			0,
		);

		descendantCountsByItemId.set(itemId, count);
		return count;
	};

	for (const item of items) {
		if (item.type === "folder") {
			countDescendants(item.id);
		}
	}

	return descendantCountsByItemId;
}
