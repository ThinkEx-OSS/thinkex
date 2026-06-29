export type WorkspaceItemViewState = {
	kind: "pdf-page";
	itemId: string;
	pageNumber: number;
};

export type WorkspaceAiContextItemViewState = {
	kind: "pdf-page";
	pageNumber: number;
};

export function getWorkspaceAiContextItemViewState(input: {
	itemId: string;
	viewState?: WorkspaceItemViewState;
}): WorkspaceAiContextItemViewState | undefined {
	const { itemId, viewState } = input;

	if (!viewState || viewState.itemId !== itemId) {
		return undefined;
	}

	if (viewState.kind === "pdf-page") {
		return {
			kind: "pdf-page",
			pageNumber: viewState.pageNumber,
		};
	}

	return undefined;
}

export function normalizeWorkspaceItemViewState(
	viewState: WorkspaceItemViewState,
): WorkspaceItemViewState {
	if (viewState.kind === "pdf-page") {
		return {
			kind: "pdf-page",
			itemId: viewState.itemId,
			pageNumber: Math.max(1, Math.trunc(viewState.pageNumber)),
		};
	}

	return viewState;
}

export function isSameWorkspaceItemViewState(
	left: WorkspaceItemViewState | undefined,
	right: WorkspaceItemViewState,
) {
	if (!left) {
		return false;
	}

	return (
		left.kind === right.kind && left.itemId === right.itemId && left.pageNumber === right.pageNumber
	);
}

export function formatWorkspaceAiContextItemViewState(
	viewState: WorkspaceAiContextItemViewState | undefined,
) {
	if (!viewState) {
		return "";
	}

	if (viewState.kind === "pdf-page") {
		return `p. ${viewState.pageNumber}`;
	}

	return "";
}

export function formatWorkspaceAiContextItemViewStateSuffix(
	viewState: WorkspaceAiContextItemViewState | undefined,
) {
	const label = formatWorkspaceAiContextItemViewState(viewState);

	return label ? `, ${label}` : "";
}
