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
			mode: "all" | "missed";
			shuffled: boolean;
			side: "front" | "back";
			reviewedCount: number;
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
			mode: "all" | "missed";
			shuffled: boolean;
			side: "front" | "back";
			reviewedCount: number;
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
		(value.mode === "all" || value.mode === "missed") &&
		typeof value.shuffled === "boolean" &&
		(value.side === "front" || value.side === "back") &&
		isNonNegativeInteger(value.reviewedCount) &&
		value.reviewedCount <= value.totalCards &&
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
		mode: viewState.mode,
		shuffled: viewState.shuffled,
		side: viewState.side,
		reviewedCount: viewState.reviewedCount,
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
	return {
		...viewState,
		cardNumber: Math.min(totalCards, finiteInteger(viewState.cardNumber, 1)),
		reviewedCount: Math.min(totalCards, finiteInteger(viewState.reviewedCount, 0)),
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
			left.mode === right.mode &&
			left.shuffled === right.shuffled &&
			left.side === right.side &&
			left.reviewedCount === right.reviewedCount &&
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
	return `card ${viewState.cardNumber} of ${viewState.totalCards} (cardId ${viewState.cardId}), ${side}, ${viewState.reviewedCount} reviewed, session: ${session}${rating}`;
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
