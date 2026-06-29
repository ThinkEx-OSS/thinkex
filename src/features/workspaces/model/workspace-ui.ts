import type {
	WorkspaceAiChatSurfaceMode,
	WorkspacePane,
	WorkspacePresentation,
	WorkspaceUiSession,
} from "#/features/workspaces/state/workspace-ui-store";

type RestorableWorkspacePresentation = Exclude<WorkspacePresentation, { mode: "maximized" }>;

export const standardPresentation: RestorableWorkspacePresentation = {
	mode: "standard",
};

export const defaultWorkspaceUiSession: WorkspaceUiSession = {
	chatSurfaceMode: "docked",
	presentation: standardPresentation,
};

export function getWorkspaceUiSession(session: WorkspaceUiSession | undefined) {
	if (!session) {
		return defaultWorkspaceUiSession;
	}

	const chatSurfaceMode = resolveWorkspaceAiChatSurfaceMode(session.chatSurfaceMode);
	const presentation = session.presentation ?? defaultWorkspaceUiSession.presentation;

	if (chatSurfaceMode === session.chatSurfaceMode && presentation === session.presentation) {
		return session;
	}

	return {
		...defaultWorkspaceUiSession,
		...session,
		chatSurfaceMode,
		presentation,
	};
}

export function normalizeWorkspaceUiSession(
	session: WorkspaceUiSession | undefined,
	validItemIds?: ReadonlySet<string>,
): WorkspaceUiSession {
	const normalizedSession = getWorkspaceUiSession(session);
	const presentation = normalizePresentation(normalizedSession.presentation, validItemIds);

	return presentation === normalizedSession.presentation
		? normalizedSession
		: {
				...normalizedSession,
				presentation,
			};
}

export function getUpdatedWorkspaceUiSession(
	currentSession: WorkspaceUiSession | undefined,
	updateSession: (session: WorkspaceUiSession) => Partial<WorkspaceUiSession>,
) {
	const session = normalizeWorkspaceUiSession(currentSession);
	const nextSession = {
		...session,
		...updateSession(session),
	};

	return isSameWorkspaceUiSession(session, nextSession) ? session : nextSession;
}

export function setChatSurfaceModeSession(chatSurfaceMode: WorkspaceAiChatSurfaceMode) {
	return {
		chatSurfaceMode,
	};
}

export function setActiveAiChatThreadSession(threadId: string | undefined) {
	return {
		activeAiChatThreadId: threadId,
	};
}

export function toggleChatPanelSession(session: WorkspaceUiSession) {
	return {
		chatSurfaceMode:
			session.chatSurfaceMode === "hidden" ? ("docked" as const) : ("hidden" as const),
	};
}

export function maximizeItemSession(session: WorkspaceUiSession, itemId: string) {
	return {
		presentation: {
			mode: "maximized" as const,
			pane: { id: `item:${itemId}`, kind: "item" as const, itemId },
			restorePresentation: getRestorablePresentation(session.presentation),
		},
	};
}

export function restoreWorkspacePresentationSession(session: WorkspaceUiSession) {
	return {
		presentation:
			session.presentation.mode === "maximized"
				? session.presentation.restorePresentation
				: standardPresentation,
	};
}

export function splitWorkspacePresentationSession(input: {
	direction: "horizontal" | "vertical";
	panes: [WorkspacePane, WorkspacePane];
	activePaneId: string;
}) {
	return {
		presentation: {
			mode: "split" as const,
			direction: input.direction,
			panes: input.panes,
			activePaneId: input.activePaneId,
		},
	};
}

function getRestorablePresentation(presentation: WorkspacePresentation) {
	if (presentation.mode === "maximized") {
		return presentation.restorePresentation;
	}

	return presentation;
}

function normalizePresentation(
	presentation: WorkspacePresentation,
	validItemIds?: ReadonlySet<string>,
): WorkspacePresentation {
	if (!validItemIds) {
		return presentation;
	}

	if (presentation.mode === "standard") {
		return presentation;
	}

	if (presentation.mode === "maximized") {
		if (!isValidPane(presentation.pane, validItemIds)) {
			return standardPresentation;
		}

		const normalizedRestorePresentation = normalizePresentation(
			presentation.restorePresentation,
			validItemIds,
		);

		if (normalizedRestorePresentation.mode === "maximized") {
			return {
				mode: "maximized",
				pane: presentation.pane,
				restorePresentation: standardPresentation,
			};
		}

		return {
			mode: "maximized",
			pane: presentation.pane,
			restorePresentation: normalizedRestorePresentation,
		};
	}

	if (!presentation.panes.every((pane) => isValidPane(pane, validItemIds))) {
		return standardPresentation;
	}

	return presentation;
}

function isValidPane(pane: WorkspacePane, validItemIds: ReadonlySet<string>) {
	return pane.kind !== "item" || validItemIds.has(pane.itemId);
}

function resolveWorkspaceAiChatSurfaceMode(mode: unknown): WorkspaceAiChatSurfaceMode {
	switch (mode) {
		case "hidden":
		case "docked":
		case "fullscreen":
			return mode;
		default:
			return defaultWorkspaceUiSession.chatSurfaceMode;
	}
}

function isSameWorkspaceUiSession(session: WorkspaceUiSession, nextSession: WorkspaceUiSession) {
	return (
		session.activeAiChatThreadId === nextSession.activeAiChatThreadId &&
		session.chatSurfaceMode === nextSession.chatSurfaceMode &&
		session.presentation === nextSession.presentation
	);
}
