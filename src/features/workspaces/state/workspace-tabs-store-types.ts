import type { WorkspaceTab, WorkspaceTabSession } from "#/features/workspaces/model/tab-types";

export type { WorkspaceTab, WorkspaceTabSession };

export type EnsureWorkspaceSessionInput = {
	workspaceId: string;
	workspaceName: string;
	requestedTabId?: string;
	validItemIds?: ReadonlySet<string>;
};

export type WorkspaceTabsState = {
	sessionsByWorkspaceId: Record<string, WorkspaceTabSession>;
	ensureWorkspaceSession: (input: EnsureWorkspaceSessionInput) => WorkspaceTabSession;
	createRootTab: (input: {
		workspaceId: string;
		workspaceName: string;
		insertIndex?: number;
	}) => WorkspaceTab;
	createItemTab: (input: {
		workspaceId: string;
		workspaceName: string;
		itemId: string;
		title: string;
		insertIndex?: number;
		activate?: boolean;
	}) => WorkspaceTab;
	duplicateTab: (input: {
		workspaceId: string;
		workspaceName: string;
		tabId: string;
		insertIndex?: number;
	}) => WorkspaceTab | undefined;
	replaceTabView: (input: {
		workspaceId: string;
		tabId: string;
		title: string;
		viewItemId?: string;
	}) => WorkspaceTab;
	activateTab: (input: { workspaceId: string; tabId: string }) => void;
	reorderTabs: (input: { workspaceId: string; activeTabId: string; overTabId: string }) => void;
	moveTab: (input: { workspaceId: string; tabId: string; toIndex: number }) => void;
	closeTab: (input: { workspaceId: string; tabId: string }) => WorkspaceTabSession;
	closeOtherTabs: (input: {
		workspaceId: string;
		tabId: string;
	}) => WorkspaceTabSession | undefined;
	closeTabsToRight: (input: {
		workspaceId: string;
		tabId: string;
	}) => WorkspaceTabSession | undefined;
	getSession: (workspaceId: string) => WorkspaceTabSession | undefined;
};
