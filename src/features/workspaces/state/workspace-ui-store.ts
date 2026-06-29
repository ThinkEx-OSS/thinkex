import { useMemo } from "react";
import { create } from "zustand";
import { devtools, persist } from "zustand/middleware";
import {
	DEFAULT_WORKSPACE_AI_CHAT_MODEL_ID,
	resolveWorkspaceAiChatModelId,
	type WorkspaceAiChatModelId,
} from "#/features/workspaces/ai/models";
import {
	isSameWorkspaceItemViewState,
	normalizeWorkspaceItemViewState,
	type WorkspaceItemViewState,
} from "#/features/workspaces/model/workspace-item-view-state";
import {
	defaultWorkspaceUiSession,
	getUpdatedWorkspaceUiSession,
	getWorkspaceUiSession,
	maximizeItemSession,
	normalizeWorkspaceUiSession,
	restoreWorkspacePresentationSession,
	setActiveAiChatThreadSession,
	setChatSurfaceModeSession,
	splitWorkspacePresentationSession,
	toggleChatPanelSession,
} from "#/features/workspaces/model/workspace-ui";
import { zustandDevtoolsOptions } from "#/lib/zustand-devtools";

export type WorkspacePane =
	| { id: string; kind: "root" }
	| { id: string; kind: "item"; itemId: string };

export type WorkspaceAiChatSurfaceMode = "hidden" | "docked" | "fullscreen";

export type WorkspacePresentation =
	| { mode: "standard" }
	| {
			mode: "split";
			direction: "horizontal" | "vertical";
			panes: [WorkspacePane, WorkspacePane];
			activePaneId: string;
	  }
	| {
			mode: "maximized";
			pane: WorkspacePane;
			restorePresentation: RestorableWorkspacePresentation;
	  };

type RestorableWorkspacePresentation = Exclude<WorkspacePresentation, { mode: "maximized" }>;

export type WorkspaceUiSession = {
	activeAiChatThreadId?: string;
	chatSurfaceMode: WorkspaceAiChatSurfaceMode;
	presentation: WorkspacePresentation;
};

type EnsureWorkspaceUiSessionInput = {
	workspaceId: string;
	validItemIds?: ReadonlySet<string>;
};

type WorkspaceUiState = {
	aiChatModelId: WorkspaceAiChatModelId;
	itemViewStatesByWorkspaceId: Record<
		string,
		Record<string, WorkspaceItemViewState | undefined> | undefined
	>;
	sessionsByWorkspaceId: Record<string, WorkspaceUiSession>;
	ensureWorkspaceSession: (input: EnsureWorkspaceUiSessionInput) => WorkspaceUiSession;
	clearItemViewState: (workspaceId: string, itemId?: string) => void;
	setChatSurfaceMode: (workspaceId: string, mode: WorkspaceAiChatSurfaceMode) => void;
	setActiveAiChatThread: (workspaceId: string, threadId: string | undefined) => void;
	setAiChatModel: (modelId: WorkspaceAiChatModelId) => void;
	setItemViewState: (workspaceId: string, viewState: WorkspaceItemViewState) => void;
	toggleChatPanel: (workspaceId: string) => void;
	maximizeItem: (workspaceId: string, itemId: string) => void;
	restorePresentation: (workspaceId: string) => void;
	setSplitPresentation: (
		workspaceId: string,
		input: {
			direction: "horizontal" | "vertical";
			panes: [WorkspacePane, WorkspacePane];
			activePaneId: string;
		},
	) => void;
	getSession: (workspaceId: string) => WorkspaceUiSession | undefined;
};

export { defaultWorkspaceUiSession, getWorkspaceUiSession };

export const EMPTY_ITEM_VIEW_STATES: Readonly<Record<string, WorkspaceItemViewState | undefined>> =
	{};

function updateWorkspaceUiSession(
	state: WorkspaceUiState,
	workspaceId: string,
	updateSession: (session: WorkspaceUiSession) => Partial<WorkspaceUiSession>,
) {
	const currentSession = state.sessionsByWorkspaceId[workspaceId];
	const currentNormalizedSession = getWorkspaceUiSession(currentSession);
	const nextSession = getUpdatedWorkspaceUiSession(currentSession, updateSession);

	if (nextSession === currentNormalizedSession) {
		return state;
	}

	return withWorkspaceUiSession(state, workspaceId, nextSession);
}

function withWorkspaceUiSession(
	state: WorkspaceUiState,
	workspaceId: string,
	session: WorkspaceUiSession,
) {
	return {
		sessionsByWorkspaceId: {
			...state.sessionsByWorkspaceId,
			[workspaceId]: session,
		},
	};
}

export const useWorkspaceUiStore = create<WorkspaceUiState>()(
	devtools(
		persist(
			(set, get) => ({
				aiChatModelId: DEFAULT_WORKSPACE_AI_CHAT_MODEL_ID,
				itemViewStatesByWorkspaceId: {},
				sessionsByWorkspaceId: {},
				ensureWorkspaceSession: ({ workspaceId, validItemIds }) => {
					const currentSession = get().sessionsByWorkspaceId[workspaceId];
					const nextSession = normalizeWorkspaceUiSession(currentSession, validItemIds);

					if (nextSession !== currentSession) {
						set((state) => withWorkspaceUiSession(state, workspaceId, nextSession));
					}

					return nextSession;
				},
				clearItemViewState: (workspaceId, itemId) =>
					set((state) => {
						const currentDetails = state.itemViewStatesByWorkspaceId[workspaceId];
						const currentViewState = itemId ? currentDetails?.[itemId] : currentDetails;

						if (!currentViewState) {
							return state;
						}

						if (!itemId) {
							return {
								itemViewStatesByWorkspaceId: {
									...state.itemViewStatesByWorkspaceId,
									[workspaceId]: undefined,
								},
							};
						}

						return {
							itemViewStatesByWorkspaceId: {
								...state.itemViewStatesByWorkspaceId,
								[workspaceId]: {
									...currentDetails,
									[itemId]: undefined,
								},
							},
						};
					}),
				setChatSurfaceMode: (workspaceId, mode) =>
					set((state) =>
						updateWorkspaceUiSession(state, workspaceId, () => setChatSurfaceModeSession(mode)),
					),
				setActiveAiChatThread: (workspaceId, threadId) =>
					set((state) =>
						updateWorkspaceUiSession(state, workspaceId, () =>
							setActiveAiChatThreadSession(threadId),
						),
					),
				setAiChatModel: (modelId) =>
					set({
						aiChatModelId: resolveWorkspaceAiChatModelId(modelId),
					}),
				setItemViewState: (workspaceId, viewState) =>
					set((state) => {
						const normalized = normalizeWorkspaceItemViewState(viewState);
						const current = state.itemViewStatesByWorkspaceId[workspaceId]?.[viewState.itemId];

						if (isSameWorkspaceItemViewState(current, normalized)) {
							return state;
						}

						return {
							itemViewStatesByWorkspaceId: {
								...state.itemViewStatesByWorkspaceId,
								[workspaceId]: {
									...state.itemViewStatesByWorkspaceId[workspaceId],
									[viewState.itemId]: normalized,
								},
							},
						};
					}),
				toggleChatPanel: (workspaceId) =>
					set((state) => updateWorkspaceUiSession(state, workspaceId, toggleChatPanelSession)),
				maximizeItem: (workspaceId, itemId) =>
					set((state) =>
						updateWorkspaceUiSession(state, workspaceId, (session) =>
							maximizeItemSession(session, itemId),
						),
					),
				restorePresentation: (workspaceId) =>
					set((state) =>
						updateWorkspaceUiSession(state, workspaceId, restoreWorkspacePresentationSession),
					),
				setSplitPresentation: (workspaceId, { direction, panes, activePaneId }) =>
					set((state) =>
						updateWorkspaceUiSession(state, workspaceId, () =>
							splitWorkspacePresentationSession({
								direction,
								panes,
								activePaneId,
							}),
						),
					),
				getSession: (workspaceId) => get().sessionsByWorkspaceId[workspaceId],
			}),
			{
				name: "thinkex.workspace-ui.v5",
				skipHydration: true,
				partialize: (state) => ({
					aiChatModelId: resolveWorkspaceAiChatModelId(state.aiChatModelId),
					sessionsByWorkspaceId: state.sessionsByWorkspaceId,
				}),
			},
		),
		zustandDevtoolsOptions("WorkspaceUiStore"),
	),
);

export function useWorkspaceUiSession(workspaceId: string) {
	return useWorkspaceUiStore(
		useMemo(
			() => (state: WorkspaceUiState) =>
				getWorkspaceUiSession(state.sessionsByWorkspaceId[workspaceId]),
			[workspaceId],
		),
	);
}

export function useWorkspaceActiveAiChatThreadId(workspaceId: string) {
	return useWorkspaceUiStore(
		useMemo(
			() => (state: WorkspaceUiState) =>
				getWorkspaceUiSession(state.sessionsByWorkspaceId[workspaceId]).activeAiChatThreadId,
			[workspaceId],
		),
	);
}

export function useWorkspaceAiChatModelId() {
	return useWorkspaceUiStore((state) => resolveWorkspaceAiChatModelId(state.aiChatModelId));
}

export function useWorkspaceAiChatSurfaceMode(workspaceId: string) {
	return useWorkspaceUiStore(
		useMemo(
			() => (state: WorkspaceUiState) =>
				getWorkspaceUiSession(state.sessionsByWorkspaceId[workspaceId]).chatSurfaceMode,
			[workspaceId],
		),
	);
}

export function useWorkspaceItemViewStates(workspaceId: string) {
	return useWorkspaceUiStore(
		useMemo(
			() => (state: WorkspaceUiState) =>
				state.itemViewStatesByWorkspaceId[workspaceId] ?? EMPTY_ITEM_VIEW_STATES,
			[workspaceId],
		),
	);
}
