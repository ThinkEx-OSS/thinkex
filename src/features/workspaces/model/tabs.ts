import type { WorkspaceTab, WorkspaceTabSession } from "#/features/workspaces/model/tab-types";
import type { WorkspaceItem } from "#/features/workspaces/model/types";

export const WORKSPACE_ROOT_VIEW = "root";

export type WorkspaceTabSearch = {
	tab: string | undefined;
	view: string;
};

export type WorkspaceTabViewUpdate = {
	title: string;
	viewItemId?: string;
};

export function getTabViewKey(tab: WorkspaceTab) {
	return tab.viewItemId ?? WORKSPACE_ROOT_VIEW;
}

export function getWorkspaceTabSearch(tab: WorkspaceTab): WorkspaceTabSearch {
	return {
		tab: tab.id,
		view: getTabViewKey(tab),
	};
}

export function getWorkspaceRootTabSearch(): WorkspaceTabSearch {
	return {
		tab: undefined,
		view: WORKSPACE_ROOT_VIEW,
	};
}

export function getWorkspaceSessionTab(
	session: WorkspaceTabSession | undefined,
	tabId: string | undefined,
) {
	return session?.tabs.find((tab) => tab.id === tabId);
}

export function getActiveWorkspaceTab(session: WorkspaceTabSession | undefined) {
	return getWorkspaceSessionTab(session, session?.activeTabId);
}

export function getWorkspaceSessionTabSearch(session: WorkspaceTabSession | undefined) {
	const activeTab = getActiveWorkspaceTab(session);

	return activeTab ? getWorkspaceTabSearch(activeTab) : getWorkspaceRootTabSearch();
}

export function findItemForTab(tab: WorkspaceTab, itemsById: Map<string, WorkspaceItem>) {
	return getWorkspaceItemForViewId(tab.viewItemId, itemsById);
}

export function getWorkspaceItemForViewId(
	viewItemId: string | undefined,
	itemsById: Map<string, WorkspaceItem>,
) {
	return viewItemId ? itemsById.get(viewItemId) : undefined;
}

export function getWorkspaceTabViewUpdate(input: {
	workspaceName: string;
	item?: WorkspaceItem;
}): WorkspaceTabViewUpdate {
	return {
		title: input.item?.name ?? input.workspaceName,
		viewItemId: input.item?.id,
	};
}

export function getWorkspaceTabViewUpdateFromSearch(input: {
	view: string | undefined;
	itemsById: Map<string, WorkspaceItem>;
	workspaceName: string;
}): WorkspaceTabViewUpdate {
	return getWorkspaceTabViewUpdate({
		workspaceName: input.workspaceName,
		item: getWorkspaceItemForViewId(
			input.view && input.view !== WORKSPACE_ROOT_VIEW ? input.view : undefined,
			input.itemsById,
		),
	});
}
