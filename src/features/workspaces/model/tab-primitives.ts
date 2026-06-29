import type { WorkspaceTab } from "#/features/workspaces/model/tab-types";

export function createTabId() {
	if (globalThis.crypto?.randomUUID) {
		return `tab-${globalThis.crypto.randomUUID()}`;
	}

	return `tab-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function createRootWorkspaceTab(workspaceName: string): WorkspaceTab {
	const now = Date.now();

	return {
		id: createTabId(),
		title: workspaceName,
		createdAt: now,
		updatedAt: now,
	};
}

export function createWorkspaceItemTab(input: { itemId: string; title: string }): WorkspaceTab {
	const now = Date.now();

	return {
		id: createTabId(),
		title: input.title,
		viewItemId: input.itemId,
		createdAt: now,
		updatedAt: now,
	};
}

export function moveWorkspaceTabByIndex(input: {
	tabs: WorkspaceTab[];
	fromIndex: number;
	toIndex: number;
}) {
	const { tabs, fromIndex, toIndex } = input;
	const boundedToIndex = Math.max(0, Math.min(toIndex, tabs.length - 1));

	if (fromIndex < 0 || fromIndex >= tabs.length || fromIndex === boundedToIndex) {
		return undefined;
	}

	const nextTabs = tabs.slice();
	const [movedTab] = nextTabs.splice(fromIndex, 1);

	if (!movedTab) {
		return undefined;
	}

	nextTabs.splice(boundedToIndex, 0, movedTab);

	return nextTabs;
}

export function insertWorkspaceTabByIndex(input: {
	tabs: WorkspaceTab[];
	tab: WorkspaceTab;
	insertIndex?: number;
}) {
	const boundedInsertIndex = Math.max(
		0,
		Math.min(input.insertIndex ?? input.tabs.length, input.tabs.length),
	);
	const nextTabs = input.tabs.slice();

	nextTabs.splice(boundedInsertIndex, 0, input.tab);

	return nextTabs;
}
