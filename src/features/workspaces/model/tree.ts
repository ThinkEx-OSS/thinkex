import type { WorkspaceItem } from "#/features/workspaces/model/types";

interface WorkspaceTreeItem {
	id: string;
	parentId: string | null;
}

export function getWorkspaceChildren(items: WorkspaceItem[], parentId: string | null) {
	return items
		.filter((item) => item.parentId === parentId)
		.slice()
		.sort(compareWorkspaceItems);
}

export function getWorkspaceRootItems<TItem extends WorkspaceTreeItem>(
	items: readonly TItem[],
	itemIds: readonly string[],
) {
	const uniqueItemIds = Array.from(new Set(itemIds));
	const selectedItemIds = new Set(uniqueItemIds);
	const itemsById = new Map(items.map((item) => [item.id, item]));

	return uniqueItemIds
		.map((itemId) => itemsById.get(itemId))
		.filter((item): item is TItem => Boolean(item))
		.filter((item) => !hasSelectedWorkspaceAncestor(item, itemsById, selectedItemIds));
}

export function getWorkspaceSubtreeItemIds<TItem extends WorkspaceTreeItem>(
	items: readonly TItem[],
	itemIds: readonly string[],
) {
	const subtreeItemIds = new Set(itemIds);
	const parentIds = [...subtreeItemIds];

	for (let index = 0; index < parentIds.length; index += 1) {
		const parentId = parentIds[index];

		if (!parentId) {
			continue;
		}

		for (const item of items) {
			if (item.parentId !== parentId || subtreeItemIds.has(item.id)) {
				continue;
			}

			subtreeItemIds.add(item.id);
			parentIds.push(item.id);
		}
	}

	return subtreeItemIds;
}

export function getWorkspaceDescendantIds(items: readonly WorkspaceItem[], itemId: string) {
	const itemIds = getWorkspaceSubtreeItemIds(items, [itemId]);
	itemIds.delete(itemId);
	return Array.from(itemIds);
}

export function splitWorkspaceChildren(items: WorkspaceItem[]) {
	return {
		folders: items.filter((item) => item.type === "folder"),
		items: items.filter((item) => item.type !== "folder"),
	};
}

function hasSelectedWorkspaceAncestor<TItem extends WorkspaceTreeItem>(
	item: TItem,
	itemsById: ReadonlyMap<string, TItem>,
	selectedItemIds: ReadonlySet<string>,
) {
	const seenItemIds = new Set<string>([item.id]);
	let parentId = item.parentId;

	while (parentId) {
		if (selectedItemIds.has(parentId)) {
			return true;
		}

		if (seenItemIds.has(parentId)) {
			return false;
		}

		seenItemIds.add(parentId);
		const parent = itemsById.get(parentId);

		if (!parent) {
			return false;
		}

		parentId = parent.parentId;
	}

	return false;
}

export function getWorkspaceBreadcrumbItems(
	item: WorkspaceItem | undefined,
	itemsById: ReadonlyMap<string, WorkspaceItem>,
) {
	if (!item) {
		return [];
	}

	const ancestors: WorkspaceItem[] = [];
	const seen = new Set<string>([item.id]);
	let parentId = item.parentId;

	while (parentId) {
		if (seen.has(parentId)) {
			break;
		}

		seen.add(parentId);
		const parent = itemsById.get(parentId);

		if (!parent) {
			break;
		}

		ancestors.unshift(parent);
		parentId = parent.parentId;
	}

	return [...ancestors, item];
}

export function getWorkspaceItemMeta(item: WorkspaceItem, allItems: WorkspaceItem[]) {
	if (item.type !== "folder") {
		return item.meta;
	}

	const count = allItems.filter((child) => child.parentId === item.id).length;

	return `${count} ${count === 1 ? "item" : "items"}`;
}

function compareWorkspaceItems(a: WorkspaceItem, b: WorkspaceItem) {
	const orderDelta = a.sortOrder - b.sortOrder;

	if (orderDelta !== 0) {
		return orderDelta;
	}

	return a.name.localeCompare(b.name);
}
