import type {
	CreateWorkspaceItemInput,
	MoveWorkspaceItemsInput,
	UpdateWorkspaceItemColorInput,
	WorkspaceItemSummary,
	WorkspacePage,
} from "#/features/workspaces/contracts";
import {
	getAvailableWorkspaceItemName,
	getWorkspaceItemTypeMeta,
	WORKSPACE_ITEM_SORT_STEP,
} from "#/features/workspaces/defaults";
import { buildWorkspaceItemCreateBootstrap } from "#/features/workspaces/documents/document-item-content";
import { getWorkspaceRootItems } from "#/features/workspaces/model/tree";
import type { WorkspaceRealtimeEvent } from "#/features/workspaces/realtime/messages";

export function applyWorkspaceEventToPage(
	page: WorkspacePage,
	event: WorkspaceRealtimeEvent,
): WorkspacePage {
	switch (event.type) {
		case "workspace.item.created":
		case "workspace.item.renamed":
		case "workspace.item.moved":
		case "workspace.item.color.updated":
		case "workspace.item.content.updated":
			return upsertWorkspaceItemInPage(page, event.payload.item, event.revision);
		case "workspace.items.moved":
			return upsertWorkspaceItemsInPage(page, event.payload.items, event.revision);
		case "workspace.item.deleted":
			return removeWorkspaceItemsFromPage(page, event.payload.deletedItemIds, event.revision);
	}
}

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
		name,
		initialContent: input.initialContent,
	});

	return upsertWorkspaceItemInPage(page, {
		id: input.id,
		workspaceId: input.workspaceId,
		parentId,
		type: input.type,
		title: name,
		name,
		meta: getWorkspaceItemTypeMeta(input.type),
		color: input.color ?? null,
		metadataJson,
		sortOrder: getNextWorkspaceItemSortOrder(page.items, parentId),
		createdAt: now,
		updatedAt: now,
		deletedAt: null,
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
		title: name,
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
): {
	page: WorkspacePage;
	previousItems: WorkspaceItemSummary[];
} | null {
	const movesByItemId = new Map(input.items.map((item) => [item.itemId, item]));
	const previousItems = getWorkspaceRootItems(
		page.items,
		input.items.map((item) => item.itemId),
	);

	if (previousItems.length === 0) {
		return null;
	}

	let nextPage = page;
	const parentId = input.parentId ?? null;

	for (const item of previousItems) {
		const movedPage = moveWorkspaceItemInPage(nextPage, {
			itemId: item.id,
			parentId,
			sortOrder: movesByItemId.get(item.id)?.sortOrder,
		});

		if (movedPage) {
			nextPage = movedPage;
		}
	}

	return { page: nextPage, previousItems };
}

export function updateWorkspaceItemColorInPage(
	page: WorkspacePage,
	input: UpdateWorkspaceItemColorInput,
): WorkspacePage | null {
	const previousItem = page.items.find((item) => item.id === input.itemId);

	if (!previousItem) {
		return null;
	}

	return upsertWorkspaceItemInPage(page, {
		...previousItem,
		color: input.color,
		updatedAt: new Date().toISOString(),
	});
}

export function upsertWorkspaceItemInPage(
	page: WorkspacePage,
	item: WorkspaceItemSummary,
	revision = page.revision,
): WorkspacePage {
	return upsertWorkspaceItemsInPage(page, [item], revision);
}

export function upsertWorkspaceItemsInPage(
	page: WorkspacePage,
	nextItems: readonly WorkspaceItemSummary[],
	revision = page.revision,
): WorkspacePage {
	const nextItemsById = new Map(nextItems.map((item) => [item.id, item]));
	const currentItemIds = new Set(page.items.map((item) => item.id));
	const items = [
		...page.items.map((candidate) => nextItemsById.get(candidate.id) ?? candidate),
		...nextItems.filter((item) => !currentItemIds.has(item.id)),
	];

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
	const deletedIds = new Set(itemIds);

	return {
		...page,
		revision: Math.max(page.revision, revision),
		items: page.items.filter((item) => !deletedIds.has(item.id)),
	};
}

function compareWorkspaceItems(left: WorkspaceItemSummary, right: WorkspaceItemSummary) {
	return (
		(left.parentId ?? "").localeCompare(right.parentId ?? "") ||
		left.sortOrder - right.sortOrder ||
		left.name.localeCompare(right.name)
	);
}

function getNextWorkspaceItemSortOrder(items: WorkspaceItemSummary[], parentId: string | null) {
	let maxSortOrder = 0;

	for (const item of items) {
		if (item.parentId === parentId) {
			maxSortOrder = Math.max(maxSortOrder, item.sortOrder);
		}
	}

	return maxSortOrder + WORKSPACE_ITEM_SORT_STEP;
}

function getAvailableWorkspaceItemNameInPage(input: {
	items: WorkspaceItemSummary[];
	type: WorkspaceItemSummary["type"];
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
