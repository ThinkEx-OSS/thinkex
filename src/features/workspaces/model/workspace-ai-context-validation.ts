import type {
	WorkspaceAiContextItemReference,
	WorkspaceAiContextOutline,
	WorkspaceAiContextPaneReference,
	WorkspaceAiContextPresentationReference,
	WorkspaceAiContextSelectedItem,
	WorkspaceAiContextSnapshot,
	WorkspaceAiContextSnapshotSelectedQuote,
	WorkspaceAiContextTabReference,
} from "./workspace-ai-context-types";

export function isWorkspaceAiContextSnapshot(value: unknown): value is WorkspaceAiContextSnapshot {
	if (!isRecord(value)) {
		return false;
	}

	return (
		isRecord(value.workspace) &&
		typeof value.workspace.name === "string" &&
		(value.workspace.outline === undefined ||
			isWorkspaceAiContextOutline(value.workspace.outline)) &&
		Array.isArray(value.selectedItems) &&
		Array.isArray(value.openTabs) &&
		Array.isArray(value.selectedQuotes) &&
		value.contentIncluded === false &&
		isRecord(value.view) &&
		isWorkspaceAiContextPresentationReference(value.view.presentation)
	);
}

function isWorkspaceAiContextOutline(value: unknown): value is WorkspaceAiContextOutline {
	if (!isRecord(value)) {
		return false;
	}

	if (
		typeof value.totalItems !== "number" ||
		!Number.isInteger(value.totalItems) ||
		value.totalItems < 0
	) {
		return false;
	}

	if (value.status === "summarized") {
		return (
			typeof value.limit === "number" &&
			Number.isInteger(value.limit) &&
			value.limit > 0 &&
			value.totalItems > value.limit &&
			Array.isArray(value.items) &&
			value.items.length <= value.limit &&
			typeof value.omittedItems === "number" &&
			Number.isInteger(value.omittedItems) &&
			value.omittedItems === value.totalItems - value.items.length &&
			value.omittedItems > 0 &&
			value.items.every(isWorkspaceAiContextOutlineItem)
		);
	}

	return (
		value.status === "included" &&
		Array.isArray(value.items) &&
		value.items.length === value.totalItems &&
		value.items.every(isWorkspaceAiContextOutlineItem)
	);
}

function isWorkspaceAiContextOutlineItem(value: unknown) {
	if (!isRecord(value)) {
		return false;
	}

	const hasChildCount = value.childCount !== undefined;
	const hasDescendantCount = value.descendantCount !== undefined;

	return (
		typeof value.path === "string" &&
		typeof value.type === "string" &&
		(value.pageCount === undefined || isPositiveInteger(value.pageCount)) &&
		isNonNegativeInteger(value.relationshipCount) &&
		hasChildCount === hasDescendantCount &&
		(value.childCount === undefined || isNonNegativeInteger(value.childCount)) &&
		(value.descendantCount === undefined || isNonNegativeInteger(value.descendantCount))
	);
}

function isNonNegativeInteger(value: unknown) {
	return typeof value === "number" && Number.isInteger(value) && value >= 0;
}

function isPositiveInteger(value: unknown) {
	return typeof value === "number" && Number.isInteger(value) && value > 0;
}

export function isWorkspaceAiContextSelectedItem(
	value: unknown,
): value is WorkspaceAiContextSelectedItem {
	if (!isRecord(value) || !isWorkspaceAiContextItemReference(value)) {
		return false;
	}

	const selectedItem = value as WorkspaceAiContextSelectedItem;

	return (
		selectedItem.availableToAi === true &&
		selectedItem.selectedForAiContext === true &&
		typeof selectedItem.order === "number" &&
		Number.isInteger(selectedItem.order)
	);
}

export function isWorkspaceAiContextTabReference(
	value: unknown,
): value is WorkspaceAiContextTabReference {
	if (!isRecord(value) || !isRecord(value.view)) {
		return false;
	}

	if (typeof value.title !== "string" || typeof value.active !== "boolean") {
		return false;
	}

	if (value.view.kind === "workspace-root") {
		return true;
	}

	if (value.view.kind === "missing-item") {
		return true;
	}

	return value.view.kind === "workspace-item" && isWorkspaceAiContextItemReference(value.view.item);
}

export function isWorkspaceAiContextSelectedQuote(
	value: unknown,
): value is WorkspaceAiContextSnapshotSelectedQuote {
	if (!isRecord(value) || !isRecord(value.source)) {
		return false;
	}

	if (
		typeof value.label !== "string" ||
		typeof value.text !== "string" ||
		typeof value.order !== "number" ||
		!Number.isInteger(value.order)
	) {
		return false;
	}

	if (value.source.kind === "assistant-response") {
		return true;
	}

	if (value.source.kind === "document-selection") {
		return value.source.item === undefined || isWorkspaceAiContextItemReference(value.source.item);
	}

	return (
		value.source.kind === "pdf-selection" &&
		Array.isArray(value.source.pageNumbers) &&
		value.source.pageNumbers.every(
			(pageNumber) =>
				typeof pageNumber === "number" && Number.isInteger(pageNumber) && pageNumber > 0,
		) &&
		(value.source.item === undefined || isWorkspaceAiContextItemReference(value.source.item))
	);
}

export function isWorkspaceAiContextPresentationReference(
	value: unknown,
): value is WorkspaceAiContextPresentationReference {
	if (!isRecord(value) || typeof value.mode !== "string") {
		return false;
	}

	if (value.mode === "standard") {
		return value.activePane === undefined || isWorkspaceAiContextPaneReference(value.activePane);
	}

	if (value.mode === "maximized") {
		return (
			isWorkspaceAiContextPaneReference(value.activePane) &&
			(value.restoreMode === "standard" || value.restoreMode === "split")
		);
	}

	return (
		value.mode === "split" &&
		(value.direction === "horizontal" || value.direction === "vertical") &&
		Array.isArray(value.panes) &&
		value.panes.every(isWorkspaceAiContextPaneReference) &&
		(value.activePane === undefined || isWorkspaceAiContextPaneReference(value.activePane))
	);
}

function isWorkspaceAiContextItemReference(
	value: unknown,
): value is WorkspaceAiContextItemReference {
	if (!isRecord(value) || !isRecord(value.state)) {
		return false;
	}

	return (
		typeof value.name === "string" &&
		typeof value.path === "string" &&
		typeof value.type === "string" &&
		typeof value.state.activeVisible === "boolean" &&
		(value.state.viewState === undefined ||
			isWorkspaceAiContextItemViewState(value.state.viewState)) &&
		Array.isArray(value.state.openInTabs) &&
		value.state.openInTabs.every((tabTitle) => typeof tabTitle === "string")
	);
}

function isWorkspaceAiContextItemViewState(value: unknown) {
	return (
		isRecord(value) &&
		value.kind === "pdf-page" &&
		typeof value.pageNumber === "number" &&
		Number.isInteger(value.pageNumber)
	);
}

function isWorkspaceAiContextPaneReference(
	value: unknown,
): value is WorkspaceAiContextPaneReference {
	if (!isRecord(value)) {
		return false;
	}

	if (value.kind === "workspace-root" || value.kind === "ai-chat") {
		return true;
	}

	if (value.kind === "missing-item") {
		return true;
	}

	return value.kind === "workspace-item" && isWorkspaceAiContextItemReference(value.item);
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null;
}
