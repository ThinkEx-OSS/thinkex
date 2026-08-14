import { isRecord } from "#/lib/record";

export type WorkspaceItemViewState =
	| {
			kind: "pdf-page";
			itemId: string;
			pageNumber: number;
	  }
	| {
			kind: "flashcard";
			itemId: string;
			cardId: string;
			cardNumber: number;
			totalCards: number;
			gotItCount: number;
			missedCount: number;
			setTotalCards: number;
			mode: "all" | "missed";
			shuffled: boolean;
			side: "front" | "back";
			rating?: "again" | "hard" | "good" | "easy";
	  };

export type WorkspaceAiContextItemViewState =
	| {
			kind: "pdf-page";
			pageNumber: number;
	  }
	| {
			kind: "flashcard";
			cardId: string;
			cardNumber: number;
			totalCards: number;
			gotItCount: number;
			missedCount: number;
			setTotalCards: number;
			mode: "all" | "missed";
			shuffled: boolean;
			side: "front" | "back";
			rating?: "again" | "hard" | "good" | "easy";
	  };

export function isWorkspaceAiContextItemViewState(
	value: unknown,
): value is WorkspaceAiContextItemViewState {
	if (!isRecord(value)) return false;
	if (value.kind === "pdf-page") {
		return isPositiveInteger(value.pageNumber);
	}
	return (
		value.kind === "flashcard" &&
		typeof value.cardId === "string" &&
		isPositiveInteger(value.cardNumber) &&
		isPositiveInteger(value.totalCards) &&
		value.cardNumber <= value.totalCards &&
		isNonNegativeInteger(value.gotItCount) &&
		isNonNegativeInteger(value.missedCount) &&
		isPositiveInteger(value.setTotalCards) &&
		(value.mode === "all" || value.mode === "missed") &&
		typeof value.shuffled === "boolean" &&
		(value.side === "front" || value.side === "back") &&
		value.gotItCount + value.missedCount <= value.setTotalCards &&
		(value.rating === undefined ||
			value.rating === "again" ||
			value.rating === "hard" ||
			value.rating === "good" ||
			value.rating === "easy")
	);
}

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

	return {
		kind: "flashcard",
		cardId: viewState.cardId,
		cardNumber: viewState.cardNumber,
		totalCards: viewState.totalCards,
		gotItCount: viewState.gotItCount,
		missedCount: viewState.missedCount,
		setTotalCards: viewState.setTotalCards,
		mode: viewState.mode,
		shuffled: viewState.shuffled,
		side: viewState.side,
		...(viewState.rating ? { rating: viewState.rating } : {}),
	};
}

export function normalizeWorkspaceItemViewState(
	viewState: WorkspaceItemViewState,
): WorkspaceItemViewState {
	if (viewState.kind === "pdf-page") {
		return {
			kind: "pdf-page",
			itemId: viewState.itemId,
			pageNumber: finiteInteger(viewState.pageNumber, 1),
		};
	}

	const totalCards = finiteInteger(viewState.totalCards, 1);
	const setTotalCards = finiteInteger(viewState.setTotalCards, 1);
	const gotItCount = Math.min(setTotalCards, finiteInteger(viewState.gotItCount, 0));
	const missedCount = Math.min(setTotalCards - gotItCount, finiteInteger(viewState.missedCount, 0));
	return {
		...viewState,
		cardNumber: Math.min(totalCards, finiteInteger(viewState.cardNumber, 1)),
		gotItCount,
		missedCount,
		setTotalCards,
		totalCards,
	};
}

function finiteInteger(value: number, minimum: number) {
	return Number.isFinite(value) ? Math.max(minimum, Math.trunc(value)) : minimum;
}

export function isSameWorkspaceItemViewState(
	left: WorkspaceItemViewState | undefined,
	right: WorkspaceItemViewState,
) {
	if (!left) {
		return false;
	}

	if (left.kind !== right.kind || left.itemId !== right.itemId) return false;
	if (left.kind === "pdf-page" && right.kind === "pdf-page") {
		return left.pageNumber === right.pageNumber;
	}
	if (left.kind === "flashcard" && right.kind === "flashcard") {
		return (
			left.cardId === right.cardId &&
			left.cardNumber === right.cardNumber &&
			left.totalCards === right.totalCards &&
			left.gotItCount === right.gotItCount &&
			left.missedCount === right.missedCount &&
			left.setTotalCards === right.setTotalCards &&
			left.mode === right.mode &&
			left.shuffled === right.shuffled &&
			left.side === right.side &&
			left.rating === right.rating
		);
	}
	return false;
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

	return `card ${viewState.cardNumber}`;
}

export function formatWorkspaceAiContextItemViewStateSuffix(
	viewState: WorkspaceAiContextItemViewState | undefined,
) {
	const label =
		viewState?.kind === "flashcard"
			? formatWorkspaceAiContextItemViewStateDetail(viewState)
			: formatWorkspaceAiContextItemViewState(viewState);

	return label ? `, ${label}` : "";
}

export function formatWorkspaceAiContextItemViewStateDetail(
	viewState: WorkspaceAiContextItemViewState | undefined,
) {
	if (!viewState || viewState.kind === "pdf-page") return "";
	const side = viewState.side === "back" ? "back shown" : "front shown";
	const rating = viewState.rating ? `, marked ${formatFlashcardRating(viewState.rating)}` : "";
	const session = `${viewState.mode === "missed" ? "missed cards" : "all cards"}, ${viewState.shuffled ? "shuffled" : "original order"}`;
	const reviewedCount = viewState.gotItCount + viewState.missedCount;
	return `card ${viewState.cardNumber} of ${viewState.totalCards} in the current session (cardId ${viewState.cardId}), ${side}, set progress: ${reviewedCount} of ${viewState.setTotalCards} reviewed (${viewState.gotItCount} got it, ${viewState.missedCount} missed), session: ${session}${rating}`;
}

function formatFlashcardRating(rating: "again" | "hard" | "good" | "easy") {
	if (rating === "again") return "no";
	if (rating === "good") return "yes";
	return rating;
}

function isPositiveInteger(value: unknown): value is number {
	return typeof value === "number" && Number.isInteger(value) && value > 0;
}

function isNonNegativeInteger(value: unknown): value is number {
	return typeof value === "number" && Number.isInteger(value) && value >= 0;
}
