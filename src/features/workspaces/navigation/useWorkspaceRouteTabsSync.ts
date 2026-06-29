import { useEffect } from "react";
import type { WorkspaceSummary } from "#/features/workspaces/contracts";
import type { WorkspaceTab } from "#/features/workspaces/model/tab-types";
import {
	findItemForTab,
	getActiveWorkspaceTab,
	getTabViewKey,
	getWorkspaceTabViewUpdate,
	getWorkspaceTabViewUpdateFromSearch,
} from "#/features/workspaces/model/tabs";
import type { WorkspaceItem } from "#/features/workspaces/model/types";
import { useWorkspaceTabsStore } from "#/features/workspaces/state/workspace-tabs-store";

type UseWorkspaceRouteTabsSyncInput = {
	workspace: WorkspaceSummary;
	itemsById: Map<string, WorkspaceItem>;
	validItemIds: ReadonlySet<string>;
	activeTabIdFromUrl?: string;
	activeViewFromUrl?: string;
	navigateToTab: (tab: WorkspaceTab, replace?: boolean) => void;
};

export function useWorkspaceRouteTabsSync({
	workspace,
	itemsById,
	validItemIds,
	activeTabIdFromUrl,
	activeViewFromUrl,
	navigateToTab,
}: UseWorkspaceRouteTabsSyncInput) {
	const ensureWorkspaceSession = useWorkspaceTabsStore((state) => state.ensureWorkspaceSession);
	const replaceTabView = useWorkspaceTabsStore((state) => state.replaceTabView);

	useEffect(() => {
		const nextSession = ensureWorkspaceSession({
			workspaceId: workspace.id,
			workspaceName: workspace.name,
			requestedTabId: activeTabIdFromUrl,
			validItemIds,
		});
		let nextActiveTab = getActiveWorkspaceTab(nextSession) ?? nextSession.tabs[0];
		const requestedTabExists =
			!activeTabIdFromUrl || nextSession.tabs.some((tab) => tab.id === activeTabIdFromUrl);
		const hasExplicitView = typeof activeViewFromUrl === "string";
		const shouldApplyView = hasExplicitView || Boolean(activeTabIdFromUrl);

		if (shouldApplyView) {
			const nextView = hasExplicitView
				? getWorkspaceTabViewUpdateFromSearch({
						view: activeViewFromUrl,
						itemsById,
						workspaceName: workspace.name,
					})
				: getWorkspaceTabViewUpdate({
						workspaceName: workspace.name,
						item: findItemForTab(nextActiveTab, itemsById),
					});

			if (nextActiveTab.viewItemId !== nextView.viewItemId) {
				nextActiveTab = replaceTabView({
					workspaceId: workspace.id,
					tabId: nextActiveTab.id,
					...nextView,
				});
			}
		}

		const shouldReplaceSearch =
			!activeTabIdFromUrl ||
			!requestedTabExists ||
			activeTabIdFromUrl !== nextActiveTab.id ||
			activeViewFromUrl !== getTabViewKey(nextActiveTab);

		if (shouldReplaceSearch) {
			navigateToTab(nextActiveTab, true);
		}
	}, [
		activeTabIdFromUrl,
		activeViewFromUrl,
		ensureWorkspaceSession,
		itemsById,
		navigateToTab,
		replaceTabView,
		validItemIds,
		workspace.id,
		workspace.name,
	]);
}
