import { isRecord } from "#/lib/record";

const MAX_VIEW_STATE_LABEL_LENGTH = 80;
const MAX_VIEW_STATE_DETAIL_LENGTH = 1_000;

export interface WorkspaceItemViewState {
	detail?: string;
	itemId: string;
	label: string;
}

export type WorkspaceAiContextItemViewState = Omit<WorkspaceItemViewState, "itemId">;

export function isWorkspaceAiContextItemViewState(
	value: unknown,
): value is WorkspaceAiContextItemViewState {
	return (
		isRecord(value) &&
		isBoundedText(value.label, MAX_VIEW_STATE_LABEL_LENGTH) &&
		(value.detail === undefined || isBoundedText(value.detail, MAX_VIEW_STATE_DETAIL_LENGTH))
	);
}

export function getWorkspaceAiContextItemViewState(input: {
	itemId: string;
	viewState?: WorkspaceItemViewState;
}): WorkspaceAiContextItemViewState | undefined {
	const { itemId, viewState } = input;
	if (!viewState || viewState.itemId !== itemId) return undefined;

	return {
		label: viewState.label,
		...(viewState.detail ? { detail: viewState.detail } : {}),
	};
}

export function normalizeWorkspaceItemViewState(
	viewState: WorkspaceItemViewState,
): WorkspaceItemViewState {
	return {
		itemId: viewState.itemId,
		label: viewState.label.trim().slice(0, MAX_VIEW_STATE_LABEL_LENGTH),
		...(viewState.detail
			? { detail: viewState.detail.trim().slice(0, MAX_VIEW_STATE_DETAIL_LENGTH) }
			: {}),
	};
}

export function isSameWorkspaceItemViewState(
	left: WorkspaceItemViewState | undefined,
	right: WorkspaceItemViewState,
) {
	return (
		left?.itemId === right.itemId && left.label === right.label && left.detail === right.detail
	);
}

export function formatWorkspaceAiContextItemViewState(
	viewState: WorkspaceAiContextItemViewState | undefined,
) {
	return viewState?.label ?? "";
}

export function formatWorkspaceAiContextItemViewStateSuffix(
	viewState: WorkspaceAiContextItemViewState | undefined,
) {
	const text = viewState?.detail ?? viewState?.label;
	return text ? `, ${text}` : "";
}

export function formatWorkspaceAiContextItemViewStateDetail(
	viewState: WorkspaceAiContextItemViewState | undefined,
) {
	return viewState?.detail ?? viewState?.label ?? "";
}

function isBoundedText(value: unknown, maxLength: number): value is string {
	return typeof value === "string" && value.length > 0 && value.length <= maxLength;
}
