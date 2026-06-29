import { getWorkspaceItemTypeMeta } from "#/features/workspaces/defaults";
import { joinWorkspacePathSegment } from "#/features/workspaces/kernel/workspace-kernel-paths";
import type { WorkspaceTab } from "#/features/workspaces/model/tab-types";
import { getWorkspaceBreadcrumbItems } from "#/features/workspaces/model/tree";
import type { WorkspaceItem } from "#/features/workspaces/model/types";
import { getWorkspaceAiContextItemViewState } from "#/features/workspaces/model/workspace-item-view-state";
import type { WorkspacePane } from "#/features/workspaces/state/workspace-ui-store";

import type {
	WorkspaceAiContextItemReference,
	WorkspaceAiContextScope,
} from "./workspace-ai-context-types";

export function getWorkspaceAiContextItemReference(input: {
	context: WorkspaceAiContextScope;
	item: WorkspaceItem;
	openTabItemIds: ReadonlyMap<string, string[]>;
	visibleItemIds: ReadonlySet<string>;
}): WorkspaceAiContextItemReference {
	const { context, item, openTabItemIds, visibleItemIds } = input;
	const isVisible = visibleItemIds.has(item.id);

	return {
		name: item.name,
		path: getWorkspaceAiContextItemPath(item, context.itemsById),
		type: getWorkspaceItemTypeMeta(item.type),
		state: {
			activeVisible: isVisible,
			viewState: isVisible
				? getWorkspaceAiContextItemViewState({
						viewState: context.itemViewStatesByItemId[item.id],
						itemId: item.id,
					})
				: undefined,
			openInTabs: openTabItemIds.get(item.id) ?? [],
		},
	};
}

export function getWorkspaceAiContextVisibleItemIds(context: WorkspaceAiContextScope) {
	const itemIds = new Set<string>();

	if (context.presentation.mode === "standard") {
		if (context.activeItem) {
			itemIds.add(context.activeItem.id);
		}
	} else if (context.presentation.mode === "maximized") {
		addWorkspaceAiContextVisiblePaneItemId(itemIds, context.presentation.pane);
	} else {
		for (const pane of context.presentation.panes) {
			addWorkspaceAiContextVisiblePaneItemId(itemIds, pane);
		}
	}

	return itemIds;
}

function addWorkspaceAiContextVisiblePaneItemId(itemIds: Set<string>, pane: WorkspacePane) {
	if (pane.kind === "item") {
		itemIds.add(pane.itemId);
	}
}

export function getOpenTabItemIds(tabs: WorkspaceTab[]) {
	const itemTabTitles = new Map<string, string[]>();

	for (const tab of tabs) {
		if (!tab.viewItemId) {
			continue;
		}

		const titles = itemTabTitles.get(tab.viewItemId) ?? [];
		titles.push(tab.title);
		itemTabTitles.set(tab.viewItemId, titles);
	}

	return itemTabTitles;
}

function getWorkspaceAiContextItemPath(
	item: WorkspaceItem,
	itemsById: ReadonlyMap<string, WorkspaceItem>,
) {
	const breadcrumbItems = getWorkspaceBreadcrumbItems(item, itemsById);
	const relativePath = breadcrumbItems.reduce(
		(path, entry) => joinWorkspacePathSegment(path, entry.name),
		"",
	);

	return `/${relativePath}`;
}
