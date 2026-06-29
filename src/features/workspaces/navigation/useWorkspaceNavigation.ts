import { useNavigate } from "@tanstack/react-router";
import { useCallback, useMemo } from "react";
import type { WorkspaceSummary } from "#/features/workspaces/contracts";
import type { WorkspaceDragCommand } from "#/features/workspaces/model/drag";
import { getWorkspaceTabSearch } from "#/features/workspaces/model/tabs";
import type { WorkspaceItem } from "#/features/workspaces/model/types";
import { isWorkspaceItemView } from "#/features/workspaces/model/view";
import { useWorkspaceRouteTabsSync } from "#/features/workspaces/navigation/useWorkspaceRouteTabsSync";
import {
	useWorkspaceTabsStore,
	type WorkspaceTab,
} from "#/features/workspaces/state/workspace-tabs-store";

type OpenWorkspaceItemOptions = {
	background?: boolean;
};

interface UseWorkspaceNavigationInput {
	workspace: WorkspaceSummary;
	items: WorkspaceItem[];
	activeTabIdFromUrl?: string;
	activeViewFromUrl?: string;
}

export function useWorkspaceNavigation({
	workspace,
	items,
	activeTabIdFromUrl,
	activeViewFromUrl,
}: UseWorkspaceNavigationInput) {
	const navigate = useNavigate();
	const scopedItems = useMemo(
		() => items.filter((item) => item.workspaceId === workspace.id),
		[items, workspace.id],
	);
	const itemsById = useMemo(
		() => new Map(scopedItems.map((item) => [item.id, item])),
		[scopedItems],
	);
	const session = useWorkspaceTabsStore((state) => state.sessionsByWorkspaceId[workspace.id]);
	const createRootTab = useWorkspaceTabsStore((state) => state.createRootTab);
	const createItemTab = useWorkspaceTabsStore((state) => state.createItemTab);
	const duplicateTab = useWorkspaceTabsStore((state) => state.duplicateTab);
	const replaceTabView = useWorkspaceTabsStore((state) => state.replaceTabView);
	const activateTab = useWorkspaceTabsStore((state) => state.activateTab);
	const reorderTabs = useWorkspaceTabsStore((state) => state.reorderTabs);
	const moveTab = useWorkspaceTabsStore((state) => state.moveTab);
	const closeTab = useWorkspaceTabsStore((state) => state.closeTab);
	const closeOtherTabs = useWorkspaceTabsStore((state) => state.closeOtherTabs);
	const closeTabsToRight = useWorkspaceTabsStore((state) => state.closeTabsToRight);
	const activeTab = session?.tabs.find((tab) => tab.id === session.activeTabId);
	const activeItem = activeTab?.viewItemId ? itemsById.get(activeTab.viewItemId) : undefined;
	const validItemIds = useMemo(() => new Set(itemsById.keys()), [itemsById]);

	const navigateToTab = useCallback(
		(tab: WorkspaceTab, replace = false) => {
			void navigate({
				to: "/workspaces/$workspaceId",
				params: { workspaceId: workspace.id },
				search: getWorkspaceTabSearch(tab),
				replace,
			});
		},
		[navigate, workspace.id],
	);

	useWorkspaceRouteTabsSync({
		workspace,
		itemsById,
		validItemIds,
		activeTabIdFromUrl,
		activeViewFromUrl,
		navigateToTab,
	});

	const replaceActiveTabView = useCallback(
		(input: { item?: WorkspaceItem; tabId?: string }) =>
			replaceTabView({
				workspaceId: workspace.id,
				tabId: input.tabId ?? activeTab?.id ?? "",
				title: input.item?.name ?? workspace.name,
				viewItemId: input.item?.id,
			}),
		[activeTab?.id, replaceTabView, workspace.id, workspace.name],
	);

	const getInsertIndexAfterActiveTab = () => {
		const activeTabIndex = session?.tabs.findIndex((tab) => tab.id === activeTab?.id) ?? -1;

		return activeTabIndex >= 0 ? activeTabIndex + 1 : Number.MAX_SAFE_INTEGER;
	};
	const getTabIndex = (tab: WorkspaceTab) =>
		session?.tabs.findIndex((item) => item.id === tab.id) ?? -1;
	const createWorkspaceTab = (options?: { insertIndex?: number }) => {
		const tab = createRootTab({
			workspaceId: workspace.id,
			workspaceName: workspace.name,
			insertIndex: options?.insertIndex,
		});

		navigateToTab(tab);
	};
	const createWorkspaceTabAfter = (tab: WorkspaceTab) => {
		const tabIndex = getTabIndex(tab);

		createWorkspaceTab({
			insertIndex: tabIndex >= 0 ? tabIndex + 1 : Number.MAX_SAFE_INTEGER,
		});
	};
	const duplicateWorkspaceTab = (tab: WorkspaceTab) => {
		const tabIndex = getTabIndex(tab);
		const duplicatedTab = duplicateTab({
			workspaceId: workspace.id,
			workspaceName: workspace.name,
			tabId: tab.id,
			insertIndex: tabIndex >= 0 ? tabIndex + 1 : Number.MAX_SAFE_INTEGER,
		});

		if (duplicatedTab) {
			navigateToTab(duplicatedTab);
		}
	};
	const openItemInNewTab = (input: {
		item: WorkspaceItem;
		activate?: boolean;
		insertIndex?: number;
	}) => {
		const tab = createItemTab({
			workspaceId: workspace.id,
			workspaceName: workspace.name,
			itemId: input.item.id,
			title: input.item.name,
			insertIndex: input.insertIndex ?? getInsertIndexAfterActiveTab(),
			activate: input.activate,
		});

		if (input.activate !== false) {
			navigateToTab(tab);
		}

		return tab;
	};
	const activateWorkspaceTab = (tab: WorkspaceTab) => {
		activateTab({ workspaceId: workspace.id, tabId: tab.id });
		navigateToTab(tab);
	};
	const reorderWorkspaceTabs = (activeTabId: string, overTabId: string) => {
		reorderTabs({
			workspaceId: workspace.id,
			activeTabId,
			overTabId,
		});
	};
	const dispatchWorkspaceDragCommand = (command: WorkspaceDragCommand) => {
		switch (command.type) {
			case "move-tab-in-strip":
				moveTab({
					workspaceId: workspace.id,
					tabId: command.tabId,
					toIndex: command.toIndex,
				});
				break;
			case "reorder-tabs-over-tab":
				reorderWorkspaceTabs(command.activeTabId, command.overTabId);
				break;
			case "split-tab":
			case "move-tab-to-pane":
				break;
		}
	};
	const closeWorkspaceTab = (tab: WorkspaceTab) => {
		const nextSession = closeTab({ workspaceId: workspace.id, tabId: tab.id });
		const nextActiveTab =
			nextSession.tabs.find((item) => item.id === nextSession.activeTabId) ?? nextSession.tabs[0];

		if (nextActiveTab && nextActiveTab.id !== activeTab?.id) {
			navigateToTab(nextActiveTab);
		}
	};
	const closeOtherWorkspaceTabs = (tab: WorkspaceTab) => {
		const nextSession = closeOtherTabs({
			workspaceId: workspace.id,
			tabId: tab.id,
		});
		const nextActiveTab = nextSession?.tabs.find((item) => item.id === nextSession.activeTabId);

		if (nextActiveTab) {
			navigateToTab(nextActiveTab);
		}
	};
	const closeWorkspaceTabsToRight = (tab: WorkspaceTab) => {
		const nextSession = closeTabsToRight({
			workspaceId: workspace.id,
			tabId: tab.id,
		});
		const nextActiveTab = nextSession?.tabs.find((item) => item.id === nextSession.activeTabId);

		if (nextActiveTab && nextActiveTab.id !== activeTab?.id) {
			navigateToTab(nextActiveTab);
		}
	};
	const openItem = (item: WorkspaceItem, options?: OpenWorkspaceItemOptions) => {
		if (options?.background) {
			openItemInNewTab({ item, activate: false });
			return;
		}

		if (activeTab?.viewItemId === item.id) {
			return;
		}

		const tab = replaceActiveTabView({ item });

		navigateToTab(tab);
	};
	const openWorkspaceRoot = () => {
		if (!activeTab?.viewItemId) {
			return;
		}

		const tab = replaceActiveTabView({});

		navigateToTab(tab);
	};
	const closeItemView = () => {
		if (!isWorkspaceItemView(activeItem)) {
			return;
		}

		const parent = activeItem.parentId ? itemsById.get(activeItem.parentId) : undefined;
		const tab = replaceActiveTabView({ item: parent });

		navigateToTab(tab);
	};

	return {
		activeItem,
		activeTab,
		closeItemView,
		closeOtherWorkspaceTabs,
		closeWorkspaceTab,
		closeWorkspaceTabsToRight,
		createWorkspaceTab,
		createWorkspaceTabAfter,
		duplicateWorkspaceTab,
		itemsById,
		openItem,
		openWorkspaceRoot,
		scopedItems,
		session,
		validItemIds,
		activateWorkspaceTab,
		dispatchWorkspaceDragCommand,
		reorderWorkspaceTabs,
	};
}
