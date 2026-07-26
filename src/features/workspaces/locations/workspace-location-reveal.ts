import type { WorkspaceTabSession } from "#/features/workspaces/model/tab-types";
import type { WorkspaceLocation } from "#/features/workspaces/locations/workspace-location";

/** Input for the canonical workspace-location reveal operation. */
export type WorkspaceRevealRequest = {
	readonly location: WorkspaceLocation;
};

/** Expected result of handing a location to workspace navigation. */
export type WorkspaceRevealResult =
	| { readonly status: "item_unavailable" }
	| { readonly status: "revealed" };

export type WorkspaceRevealTabPlan =
	| { readonly action: "activate"; readonly tabId: string }
	| { readonly action: "create" }
	| { readonly action: "replace"; readonly tabId: string };

/**
 * Selects the tab action for a location without mutating navigation state.
 *
 * Reveals reuse the active matching tab, then the most recently used matching
 * tab, then an active root tab. Explicit human duplication remains a separate
 * existing tab action.
 *
 * @param input - Current tab session and reveal request.
 * @returns The single tab action the navigation adapter should perform.
 */
export function planWorkspaceRevealTab(input: {
	readonly request: WorkspaceRevealRequest;
	readonly session: WorkspaceTabSession | undefined;
}): WorkspaceRevealTabPlan {
	const session = input.session;
	const activeTab = session?.tabs.find((tab) => tab.id === session.activeTabId);
	const itemId = input.request.location.itemId;

	if (activeTab?.viewItemId === itemId) {
		return { action: "activate", tabId: activeTab.id };
	}

	let matchingTab: WorkspaceTabSession["tabs"][number] | undefined;
	for (const tab of session?.tabs ?? []) {
		if (tab.viewItemId === itemId && (!matchingTab || tab.updatedAt > matchingTab.updatedAt)) {
			matchingTab = tab;
		}
	}

	if (matchingTab) {
		return { action: "activate", tabId: matchingTab.id };
	}

	if (activeTab && !activeTab.viewItemId) {
		return { action: "replace", tabId: activeTab.id };
	}

	return { action: "create" };
}
