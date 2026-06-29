import { create } from "zustand";
import { devtools, persist } from "zustand/middleware";
import {
	insertWorkspaceTabByIndex,
	moveWorkspaceTabByIndex,
} from "#/features/workspaces/model/tab-primitives";
import {
	createRootWorkspaceTab,
	createWorkspaceItemTab,
	normalizeWorkspaceTabSession,
} from "#/features/workspaces/model/tab-state";
import type {
	WorkspaceTab,
	WorkspaceTabsState,
} from "#/features/workspaces/state/workspace-tabs-store-types";
import { zustandDevtoolsOptions } from "#/lib/zustand-devtools";

export type {
	WorkspaceTab,
	WorkspaceTabSession,
} from "#/features/workspaces/state/workspace-tabs-store-types";

export const useWorkspaceTabsStore = create<WorkspaceTabsState>()(
	devtools(
		persist(
			(set, get) => ({
				sessionsByWorkspaceId: {},
				ensureWorkspaceSession: ({ workspaceId, workspaceName, requestedTabId, validItemIds }) => {
					const currentSession = get().sessionsByWorkspaceId[workspaceId];
					const normalizedSession = normalizeWorkspaceTabSession(
						currentSession,
						workspaceName,
						validItemIds,
					);
					const requestedTabExists =
						requestedTabId && normalizedSession.tabs.some((tab) => tab.id === requestedTabId);
					const nextSession = requestedTabExists
						? { ...normalizedSession, activeTabId: requestedTabId }
						: normalizedSession;

					set((state) => ({
						sessionsByWorkspaceId: {
							...state.sessionsByWorkspaceId,
							[workspaceId]: nextSession,
						},
					}));

					return nextSession;
				},
				createRootTab: ({ workspaceId, workspaceName, insertIndex }) => {
					const rootTab = createRootWorkspaceTab(workspaceName);

					set((state) => {
						const session = normalizeWorkspaceTabSession(
							state.sessionsByWorkspaceId[workspaceId],
							workspaceName,
						);
						const nextSession = {
							activeTabId: rootTab.id,
							tabs: insertWorkspaceTabByIndex({
								tabs: session.tabs,
								tab: rootTab,
								insertIndex: insertIndex ?? Number.MAX_SAFE_INTEGER,
							}),
						};

						return {
							sessionsByWorkspaceId: {
								...state.sessionsByWorkspaceId,
								[workspaceId]: nextSession,
							},
						};
					});

					return rootTab;
				},
				duplicateTab: ({ workspaceId, workspaceName, tabId, insertIndex }) => {
					const session = get().sessionsByWorkspaceId[workspaceId];
					const tab = session?.tabs.find((item) => item.id === tabId);

					if (!session || !tab) {
						return undefined;
					}

					const duplicatedTab = tab.viewItemId
						? createWorkspaceItemTab({
								itemId: tab.viewItemId,
								title: tab.title,
							})
						: createRootWorkspaceTab(workspaceName);

					set((state) => ({
						sessionsByWorkspaceId: {
							...state.sessionsByWorkspaceId,
							[workspaceId]: {
								activeTabId: duplicatedTab.id,
								tabs: insertWorkspaceTabByIndex({
									tabs: session.tabs,
									tab: duplicatedTab,
									insertIndex,
								}),
							},
						},
					}));

					return duplicatedTab;
				},
				createItemTab: ({
					workspaceId,
					workspaceName,
					itemId,
					title,
					insertIndex,
					activate = true,
				}) => {
					const itemTab = createWorkspaceItemTab({ itemId, title });

					set((state) => {
						const session = normalizeWorkspaceTabSession(
							state.sessionsByWorkspaceId[workspaceId],
							workspaceName,
						);
						const nextTabs = insertWorkspaceTabByIndex({
							tabs: session.tabs,
							tab: itemTab,
							insertIndex,
						});

						return {
							sessionsByWorkspaceId: {
								...state.sessionsByWorkspaceId,
								[workspaceId]: {
									activeTabId: activate ? itemTab.id : session.activeTabId,
									tabs: nextTabs,
								},
							},
						};
					});

					return itemTab;
				},
				replaceTabView: ({ workspaceId, tabId, title, viewItemId }) => {
					const now = Date.now();
					let updatedTab: WorkspaceTab | undefined;

					set((state) => {
						const session = state.sessionsByWorkspaceId[workspaceId];

						if (!session) {
							return state;
						}

						const nextTabs = session.tabs.map((tab) => {
							if (tab.id !== tabId) {
								return tab;
							}

							updatedTab = {
								id: tab.id,
								title,
								viewItemId,
								createdAt: tab.createdAt,
								updatedAt: now,
							};

							return updatedTab;
						});

						return {
							sessionsByWorkspaceId: {
								...state.sessionsByWorkspaceId,
								[workspaceId]: {
									activeTabId: tabId,
									tabs: nextTabs,
								},
							},
						};
					});

					if (!updatedTab) {
						throw new Error(`Unable to replace missing tab view: ${tabId}`);
					}

					return updatedTab;
				},
				activateTab: ({ workspaceId, tabId }) => {
					set((state) => {
						const session = state.sessionsByWorkspaceId[workspaceId];

						if (!session?.tabs.some((tab) => tab.id === tabId)) {
							return state;
						}

						return {
							sessionsByWorkspaceId: {
								...state.sessionsByWorkspaceId,
								[workspaceId]: {
									...session,
									activeTabId: tabId,
								},
							},
						};
					});
				},
				reorderTabs: ({ workspaceId, activeTabId, overTabId }) => {
					if (activeTabId === overTabId) {
						return;
					}

					set((state) => {
						const session = state.sessionsByWorkspaceId[workspaceId];

						if (!session) {
							return state;
						}

						const activeIndex = session.tabs.findIndex((tab) => tab.id === activeTabId);
						const overIndex = session.tabs.findIndex((tab) => tab.id === overTabId);

						if (overIndex === -1) {
							return state;
						}

						const nextTabs = moveWorkspaceTabByIndex({
							tabs: session.tabs,
							fromIndex: activeIndex,
							toIndex: overIndex,
						});

						if (!nextTabs) {
							return state;
						}

						return {
							sessionsByWorkspaceId: {
								...state.sessionsByWorkspaceId,
								[workspaceId]: {
									...session,
									tabs: nextTabs,
								},
							},
						};
					});
				},
				moveTab: ({ workspaceId, tabId, toIndex }) => {
					set((state) => {
						const session = state.sessionsByWorkspaceId[workspaceId];

						if (!session) {
							return state;
						}

						const fromIndex = session.tabs.findIndex((tab) => tab.id === tabId);
						const nextTabs = moveWorkspaceTabByIndex({
							tabs: session.tabs,
							fromIndex,
							toIndex,
						});

						return nextTabs
							? {
									sessionsByWorkspaceId: {
										...state.sessionsByWorkspaceId,
										[workspaceId]: {
											...session,
											tabs: nextTabs,
										},
									},
								}
							: state;
					});
				},
				closeTab: ({ workspaceId, tabId }) => {
					const session = get().sessionsByWorkspaceId[workspaceId];

					if (!session || session.tabs.length <= 1) {
						return (
							session ?? {
								activeTabId: "",
								tabs: [],
							}
						);
					}

					const closedIndex = session.tabs.findIndex((tab) => tab.id === tabId);

					if (closedIndex === -1) {
						return session;
					}

					const nextTabs = session.tabs.filter((tab) => tab.id !== tabId);
					const nextActiveTabId =
						session.activeTabId === tabId
							? nextTabs[Math.max(0, closedIndex - 1)].id
							: session.activeTabId;
					const nextSession = {
						activeTabId: nextActiveTabId,
						tabs: nextTabs,
					};

					set((state) => ({
						sessionsByWorkspaceId: {
							...state.sessionsByWorkspaceId,
							[workspaceId]: nextSession,
						},
					}));

					return nextSession;
				},
				closeOtherTabs: ({ workspaceId, tabId }) => {
					const session = get().sessionsByWorkspaceId[workspaceId];
					const tab = session?.tabs.find((item) => item.id === tabId);

					if (!session || !tab) {
						return session;
					}

					const nextSession = {
						activeTabId: tab.id,
						tabs: [tab],
					};

					set((state) => ({
						sessionsByWorkspaceId: {
							...state.sessionsByWorkspaceId,
							[workspaceId]: nextSession,
						},
					}));

					return nextSession;
				},
				closeTabsToRight: ({ workspaceId, tabId }) => {
					const session = get().sessionsByWorkspaceId[workspaceId];
					const tabIndex = session?.tabs.findIndex((item) => item.id === tabId) ?? -1;

					if (!session || tabIndex === -1) {
						return session;
					}

					const nextTabs = session.tabs.slice(0, tabIndex + 1);
					const activeTabStillOpen = nextTabs.some((tab) => tab.id === session.activeTabId);
					const nextSession = {
						activeTabId: activeTabStillOpen ? session.activeTabId : tabId,
						tabs: nextTabs,
					};

					set((state) => ({
						sessionsByWorkspaceId: {
							...state.sessionsByWorkspaceId,
							[workspaceId]: nextSession,
						},
					}));

					return nextSession;
				},
				getSession: (workspaceId) => get().sessionsByWorkspaceId[workspaceId],
			}),
			{
				name: "thinkex.workspace-tabs.v2",
				skipHydration: true,
				partialize: (state) => ({
					sessionsByWorkspaceId: state.sessionsByWorkspaceId,
				}),
			},
		),
		zustandDevtoolsOptions("WorkspaceTabsStore"),
	),
);
