import type {
	CreateWorkspaceItemInput,
	MoveWorkspaceItemsInput,
	WorkspaceItem,
	WorkspacePage,
} from "#/features/workspaces/contracts";
import {
	getAvailableWorkspaceItemName,
	WORKSPACE_ITEM_SORT_STEP,
} from "#/features/workspaces/defaults";
import { buildWorkspaceItemCreateBootstrap } from "#/features/workspaces/documents/document-item-content";
import {
	getWorkspaceRootItems,
	getWorkspaceSubtreeItemIds,
} from "#/features/workspaces/model/tree";

export function createWorkspaceItemInPage(
	page: WorkspacePage,
	input: CreateWorkspaceItemInput & { id: string },
): WorkspacePage {
	const parentId = input.parentId ?? null;
	const now = new Date().toISOString();
	const name = getAvailableWorkspaceItemNameInPage({
		items: page.items,
		type: input.type,
		parentId,
		requestedName: input.name,
	});

	const { metadataJson } = buildWorkspaceItemCreateBootstrap({
		type: input.type,
		initialContent: input.initialContent,
	});

	return upsertWorkspaceItemInPage(page, {
		id: input.id,
		workspaceId: input.workspaceId,
		parentId,
		type: input.type,
		name,
		color: input.color ?? null,
		metadataJson,
		sortOrder: getNextWorkspaceItemSortOrder(page.items, parentId),
		createdAt: now,
		updatedAt: now,
	});
}

function moveWorkspaceItemInPage(
	page: WorkspacePage,
	input: {
		itemId: string;
		parentId?: string | null;
		sortOrder?: number;
	},
): WorkspacePage | null {
	const previousItem = page.items.find((item) => item.id === input.itemId);

	if (!previousItem) {
		return null;
	}

	const nextParentId = input.parentId ?? null;
	const name = getAvailableWorkspaceItemNameInPage({
		items: page.items,
		type: previousItem.type,
		parentId: nextParentId,
		requestedName: previousItem.name,
		excludeItemId: previousItem.id,
	});

	return upsertWorkspaceItemInPage(page, {
		...previousItem,
		parentId: nextParentId,
		name,
		sortOrder:
			input.sortOrder ??
			getNextWorkspaceItemSortOrder(
				page.items.filter((candidate) => candidate.id !== input.itemId),
				nextParentId,
			),
		updatedAt: new Date().toISOString(),
	});
}

export function moveWorkspaceItemsInPage(
	page: WorkspacePage,
	input: MoveWorkspaceItemsInput,
): WorkspacePage | null {
	const movesByItemId = new Map(input.items.map((item) => [item.itemId, item]));
	const items = getWorkspaceRootItems(
		page.items,
		input.items.map((item) => item.itemId),
	);

	if (items.length === 0) {
		return null;
	}

	let nextPage = page;
	const parentId = input.parentId ?? null;

	for (const item of items) {
		const movedPage = moveWorkspaceItemInPage(nextPage, {
			itemId: item.id,
			parentId,
			sortOrder: movesByItemId.get(item.id)?.sortOrder,
		});

		if (movedPage) {
			nextPage = movedPage;
		}
	}

	return nextPage;
}

export function upsertWorkspaceItemInPage(
	page: WorkspacePage,
	item: WorkspaceItem,
	revision = page.revision,
): WorkspacePage {
	const exists = page.items.some((candidate) => candidate.id === item.id);
	const items = exists
		? page.items.map((candidate) => (candidate.id === item.id ? item : candidate))
		: [...page.items, item];

	return {
		...page,
		revision: Math.max(page.revision, revision),
		items: items.sort(compareWorkspaceItems),
	};
}

export function removeWorkspaceItemsFromPage(
	page: WorkspacePage,
	itemIds: string[],
	revision = page.revision,
): WorkspacePage {
	const deletedIds = getWorkspaceSubtreeItemIds(page.items, itemIds);

	return {
		...page,
		revision: Math.max(page.revision, revision),
		items: page.items.filter((item) => !deletedIds.has(item.id)),
	};
}

function compareWorkspaceItems(left: WorkspaceItem, right: WorkspaceItem) {
	return (
		(left.parentId ?? "").localeCompare(right.parentId ?? "") ||
		left.sortOrder - right.sortOrder ||
		left.name.localeCompare(right.name)
	);
}

function getNextWorkspaceItemSortOrder(items: WorkspaceItem[], parentId: string | null) {
	let maxSortOrder = 0;

	for (const item of items) {
		if (item.parentId === parentId) {
			maxSortOrder = Math.max(maxSortOrder, item.sortOrder);
		}
	}

	return maxSortOrder + WORKSPACE_ITEM_SORT_STEP;
}

function getAvailableWorkspaceItemNameInPage(input: {
	items: WorkspaceItem[];
	type: WorkspaceItem["type"];
	parentId: string | null;
	requestedName?: string;
	excludeItemId?: string;
}) {
	const existingNames: string[] = [];

	for (const item of input.items) {
		if (item.parentId === input.parentId && item.id !== input.excludeItemId) {
			existingNames.push(item.name);
		}
	}

	return getAvailableWorkspaceItemName({
		type: input.type,
		requestedName: input.requestedName,
		existingNames,
	});
}
