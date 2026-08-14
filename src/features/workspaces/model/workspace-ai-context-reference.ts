import type { WorkspaceTab } from "#/features/workspaces/model/tab-types";
import { getWorkspaceItemPath } from "#/features/workspaces/model/tree";
import { getActiveWorkspaceViewInstanceId } from "#/features/workspaces/model/workspace-ui";
import { type WorkspaceItem, getWorkspaceItemRegistryEntry } from "#/features/workspaces/contracts";
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
	viewInstanceId?: string;
	visibleItemIds: ReadonlySet<string>;
}): WorkspaceAiContextItemReference {
	const { context, item, openTabItemIds, viewInstanceId, visibleItemIds } = input;
	const isVisible = visibleItemIds.has(item.id);
	const viewState = isVisible
		? getWorkspaceItemViewState(context, item.id, viewInstanceId)
		: undefined;

	return {
		name: item.name,
		path: getWorkspaceItemPath(item, context.itemsById),
		type: getWorkspaceItemRegistryEntry(item.type).menuLabel,
		state: {
			activeVisible: isVisible,
			viewState: viewState
				? getWorkspaceAiContextItemViewState({
						viewState,
						itemId: item.id,
					})
				: undefined,
			openInTabs: openTabItemIds.get(item.id) ?? [],
		},
	};
}

function getWorkspaceItemViewState(
	context: WorkspaceAiContextScope,
	itemId: string,
	viewInstanceId?: string,
) {
	if (viewInstanceId) {
		const state = context.itemViewStatesByViewInstanceId[viewInstanceId];
		return state?.itemId === itemId ? state : undefined;
	}

	const activeViewInstanceId = getActiveWorkspaceViewInstanceId(
		context.presentation,
		context.activeTabId,
	);
	const activeState = activeViewInstanceId
		? context.itemViewStatesByViewInstanceId[activeViewInstanceId]
		: undefined;
	if (activeState?.itemId === itemId) return activeState;

	return Object.values(context.itemViewStatesByViewInstanceId).find(
		(state) => state?.itemId === itemId,
	);
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
