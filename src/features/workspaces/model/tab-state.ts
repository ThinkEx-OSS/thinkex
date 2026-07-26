import { createRootWorkspaceTab } from "#/features/workspaces/model/tab-primitives";
import type { WorkspaceTabSession } from "#/features/workspaces/model/tab-types";

export {
	createRootWorkspaceTab,
	createWorkspaceItemTab,
} from "#/features/workspaces/model/tab-primitives";

/**
 * Activates a tab and records its recency for automatic tab reuse.
 *
 * @param session - Current workspace tab session.
 * @param tabId - Existing tab to activate.
 * @param now - Activation timestamp.
 * @returns The updated session, or the original session when the tab is absent.
 */
export function activateWorkspaceTabSession(
	session: WorkspaceTabSession,
	tabId: string,
	now = Date.now(),
): WorkspaceTabSession {
	if (!session.tabs.some((tab) => tab.id === tabId)) {
		return session;
	}

	return {
		...session,
		activeTabId: tabId,
		tabs: session.tabs.map((tab) => (tab.id === tabId ? { ...tab, updatedAt: now } : tab)),
	};
}

export function normalizeWorkspaceTabSession(
	session: WorkspaceTabSession | undefined,
	workspaceName: string,
	validItemIds?: ReadonlySet<string>,
): WorkspaceTabSession {
	if (!session || session.tabs.length === 0) {
		const rootTab = createRootWorkspaceTab(workspaceName);

		return {
			activeTabId: rootTab.id,
			tabs: [rootTab],
		};
	}

	const now = Date.now();
	const tabs = validItemIds
		? session.tabs.map((tab) => {
				if (!tab.viewItemId) {
					return tab;
				}

				if (validItemIds.has(tab.viewItemId)) {
					return tab;
				}

				return {
					id: tab.id,
					title: workspaceName,
					createdAt: tab.createdAt,
					updatedAt: now,
				};
			})
		: session.tabs;

	if (tabs.some((tab) => tab.id === session.activeTabId)) {
		return {
			...session,
			tabs,
		};
	}

	return {
		...session,
		activeTabId: tabs[0].id,
		tabs,
	};
}
