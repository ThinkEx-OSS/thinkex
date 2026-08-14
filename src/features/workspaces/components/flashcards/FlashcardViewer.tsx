import { useQuery } from "@tanstack/react-query";
import type { JSONContent } from "@tiptap/core";
import { EditorContent, useEditor } from "@tiptap/react";
import { Check, ChevronLeft, ChevronRight, Lightbulb, X } from "lucide-react";
import { type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react";

import { Button } from "#/components/ui/button";
import { Skeleton } from "#/components/ui/skeleton";
import { sendComposerPrompt } from "#/features/workspaces/composer/workspace-composer-actions";
import { useFlashcardItemToolbar } from "#/features/workspaces/components/WorkspaceItemToolbarSlot";
import { getTiptapDocumentBaseExtensions } from "#/features/workspaces/documents/tiptap-extensions";
import type { TiptapDocumentJson } from "#/features/workspaces/documents/tiptap-document";
import {
	flashcardViewerQueryOptions,
	useRecordFlashcardStudyRating,
	useResetFlashcardStudyProgress,
} from "#/features/workspaces/flashcards/flashcard-queries";
import type {
	FlashcardStudyRating,
	FlashcardStudyState,
} from "#/features/workspaces/flashcards/flashcard-study-state";
import {
	createFlashcardStudyQueue,
	type FlashcardStudyMode,
} from "#/features/workspaces/flashcards/flashcard-study-session";
import type { Flashcard } from "#/features/workspaces/flashcards/flashcard-content";
import type { WorkspaceItem } from "#/features/workspaces/contracts";
import { useWorkspaceFlashcardSideRevealRequest } from "#/features/workspaces/locations/workspace-location-context";
import { useWorkspaceUiStore } from "#/features/workspaces/state/workspace-ui-store";
import { isRecord } from "#/lib/record";
import { cn } from "#/lib/utils";

import "./flashcard-viewer.css";

const CARD_SETTLE_MS = 220;

interface FlashcardSessionState {
	cardIds: string[];
	currentIndex: number;
	flipped: boolean;
	mode: FlashcardStudyMode;
	settling: boolean;
	shuffled: boolean;
}

export function FlashcardViewer({
	item,
	viewInstanceId,
}: {
	item: WorkspaceItem;
	viewInstanceId: string;
}) {
	const queryInput = {
		itemId: item.id,
		updatedAt: item.updatedAt,
		workspaceId: item.workspaceId,
	};
	const { data, error, isPending } = useQuery(flashcardViewerQueryOptions(queryInput));

	if (isPending) return <FlashcardViewerSkeleton />;
	if (error || !data) {
		return (
			<div className="flex h-full items-center justify-center p-6 text-center text-muted-foreground">
				Could not load these flashcards.
			</div>
		);
	}
	return (
		<FlashcardStudySession
			key={item.updatedAt}
			cards={data.cards}
			studyState={data.studyState}
			item={item}
			viewInstanceId={viewInstanceId}
		/>
	);
}

function FlashcardStudySession({
	cards,
	studyState,
	item,
	viewInstanceId,
}: {
	cards: Flashcard[];
	studyState: FlashcardStudyState;
	item: WorkspaceItem;
	viewInstanceId: string;
}) {
	const [session, setSession] = useState<FlashcardSessionState>(() => ({
		cardIds: createFlashcardStudyQueue({ cards, mode: "all", shuffled: false, studyState }),
		currentIndex: 0,
		flipped: false,
		mode: "all",
		settling: false,
		shuffled: false,
	}));
	const { cardIds: studyCardIds, currentIndex, flipped, mode, settling, shuffled } = session;
	const settleTimerRef = useRef<number | null>(null);
	const cardsById = useMemo(() => new Map(cards.map((card) => [card.id, card])), [cards]);
	const studyCards = useMemo(
		() => getStudyCards(studyCardIds, cardsById),
		[cardsById, studyCardIds],
	);
	const currentCard = studyCards[currentIndex];
	const gotItCount = studyCards.filter((card) => {
		const rating = studyState.cards[card.id]?.lastRating;
		return rating !== undefined && rating !== "again";
	}).length;
	const missedInSessionCount = studyCards.filter(
		(card) => studyState.cards[card.id]?.lastRating === "again",
	).length;
	const reviewedCount = gotItCount + missedInSessionCount;
	const missedCount = cards.filter(
		(card) => studyState.cards[card.id]?.lastRating === "again",
	).length;
	const ratedCount = cards.filter((card) => studyState.cards[card.id] !== undefined).length;
	const currentRating = currentCard ? studyState.cards[currentCard.id]?.lastRating : undefined;
	const clearItemViewState = useWorkspaceUiStore((state) => state.clearItemViewState);
	const setItemViewState = useWorkspaceUiStore((state) => state.setItemViewState);
	const { consume: consumeRevealRequest, request: revealRequest } =
		useWorkspaceFlashcardSideRevealRequest(viewInstanceId);
	const recordRating = useRecordFlashcardStudyRating({
		itemId: item.id,
		updatedAt: item.updatedAt,
		workspaceId: item.workspaceId,
	});
	const { isPending: isResetting, mutate: resetProgress } = useResetFlashcardStudyProgress({
		itemId: item.id,
		updatedAt: item.updatedAt,
		workspaceId: item.workspaceId,
	});
	const clearSettleTimer = useCallback(() => {
		if (settleTimerRef.current === null) return;
		window.clearTimeout(settleTimerRef.current);
		settleTimerRef.current = null;
	}, []);
	const startSession = useCallback(
		(nextMode: FlashcardStudyMode, nextShuffled: boolean) => {
			clearSettleTimer();
			setSession({
				cardIds: createFlashcardStudyQueue({
					cards,
					mode: nextMode,
					shuffled: nextShuffled,
					studyState,
				}),
				currentIndex: 0,
				flipped: false,
				mode: nextMode,
				settling: false,
				shuffled: nextShuffled,
			});
		},
		[cards, clearSettleTimer, studyState],
	);
	const changeMode = useCallback(
		(nextMode: FlashcardStudyMode) => startSession(nextMode, shuffled),
		[shuffled, startSession],
	);
	const toggleShuffle = useCallback(
		() => startSession(mode, !shuffled),
		[mode, shuffled, startSession],
	);
	const resetStudyProgress = useCallback(() => {
		startSession("all", false);
		resetProgress();
	}, [resetProgress, startSession]);
	useFlashcardItemToolbar({
		canReset: ratedCount > 0,
		isResetting,
		missedCount,
		mode,
		onModeChange: changeMode,
		onReset: resetStudyProgress,
		onShuffleToggle: toggleShuffle,
		shuffled,
		slotId: viewInstanceId,
	});
	useEffect(() => {
		if (!currentCard) return;
		setItemViewState(item.workspaceId, {
			kind: "flashcard",
			itemId: item.id,
			cardId: currentCard.id,
			cardNumber: currentIndex + 1,
			totalCards: studyCards.length,
			mode,
			shuffled,
			side: flipped ? "back" : "front",
			reviewedCount,
			...(currentRating ? { rating: currentRating } : {}),
		});
	}, [
		currentCard,
		currentIndex,
		currentRating,
		flipped,
		item.id,
		item.workspaceId,
		mode,
		reviewedCount,
		setItemViewState,
		shuffled,
		studyCards.length,
	]);
	useEffect(
		() => () => clearItemViewState(item.workspaceId, item.id),
		[clearItemViewState, item.id, item.workspaceId],
	);
	useEffect(() => () => clearSettleTimer(), [clearSettleTimer]);
	useEffect(() => {
		if (!revealRequest) return;
		let nextCardIds = studyCardIds;
		let cardIndex = nextCardIds.indexOf(revealRequest.location.cardId);
		if (cardIndex < 0 && cardsById.has(revealRequest.location.cardId)) {
			nextCardIds = createFlashcardStudyQueue({ cards, mode: "all", shuffled, studyState });
			cardIndex = nextCardIds.indexOf(revealRequest.location.cardId);
		}
		let cancelled = false;
		queueMicrotask(() => {
			if (cancelled) return;
			if (cardIndex >= 0) {
				clearSettleTimer();
				setSession((current) => ({
					...current,
					cardIds: nextCardIds,
					currentIndex: cardIndex,
					flipped: revealRequest.location.side === "back",
					mode: nextCardIds === studyCardIds ? mode : "all",
					settling: false,
				}));
			}
			consumeRevealRequest(revealRequest);
		});
		return () => {
			cancelled = true;
		};
	}, [
		cards,
		cardsById,
		clearSettleTimer,
		consumeRevealRequest,
		revealRequest,
		shuffled,
		studyCardIds,
		studyState,
		mode,
	]);
	if (cards.length === 0) {
		return (
			<div className="flex h-full items-center justify-center p-6 text-center">
				<div className="space-y-1">
					<h2 className="font-medium">No cards yet</h2>
					<p className="text-sm text-muted-foreground">Ask AI to add cards to this set.</p>
				</div>
			</div>
		);
	}
	if (studyCards.length === 0) {
		return (
			<div className="flex h-full items-center justify-center p-6 text-center">
				<div className="space-y-3">
					<div className="space-y-1">
						<h2 className="font-medium">No missed cards</h2>
						<p className="text-sm text-muted-foreground">Nothing needs another pass right now.</p>
					</div>
					<Button variant="outline" onClick={() => changeMode("all")}>
						Study all cards
					</Button>
				</div>
			</div>
		);
	}

	if (!currentCard) return null;

	const goTo = (nextIndex: number) => {
		if (settling || nextIndex < 0 || nextIndex >= studyCards.length || nextIndex === currentIndex) {
			return;
		}
		if (!flipped) {
			setSession((current) => ({ ...current, currentIndex: nextIndex }));
			return;
		}
		setSession((current) => ({ ...current, flipped: false, settling: true }));
		clearSettleTimer();
		settleTimerRef.current = window.setTimeout(() => {
			setSession((current) => ({ ...current, currentIndex: nextIndex, settling: false }));
			settleTimerRef.current = null;
		}, CARD_SETTLE_MS);
	};

	const rate = (rating: FlashcardStudyRating) => {
		if (settling) return;
		recordRating.mutate({ cardId: currentCard.id, rating });
		if (currentIndex < studyCards.length - 1) goTo(currentIndex + 1);
		else setSession((current) => ({ ...current, flipped: false }));
	};
	const flipCard = () => {
		if (!settling) setSession((current) => ({ ...current, flipped: !current.flipped }));
	};

	return (
		<FlashcardStudySurface
			currentCard={currentCard}
			currentIndex={currentIndex}
			currentRating={currentRating}
			flipped={flipped}
			gotItCount={gotItCount}
			item={item}
			missedCount={missedInSessionCount}
			onFlip={flipCard}
			onGoTo={goTo}
			onRate={rate}
			reviewedCount={reviewedCount}
			settling={settling}
			studyCards={studyCards}
			studyState={studyState}
		/>
	);
}

function FlashcardStudySurface({
	currentCard,
	currentIndex,
	currentRating,
	flipped,
	gotItCount,
	item,
	missedCount,
	onFlip,
	onGoTo,
	onRate,
	reviewedCount,
	settling,
	studyCards,
	studyState,
}: {
	currentCard: Flashcard;
	currentIndex: number;
	currentRating: FlashcardStudyRating | undefined;
	flipped: boolean;
	gotItCount: number;
	item: WorkspaceItem;
	missedCount: number;
	onFlip: () => void;
	onGoTo: (index: number) => void;
	onRate: (rating: FlashcardStudyRating) => void;
	reviewedCount: number;
	settling: boolean;
	studyCards: Flashcard[];
	studyState: FlashcardStudyState;
}) {
	return (
		<section
			className="flex h-full min-h-0 flex-col bg-background px-4 py-5 sm:px-8 sm:py-7"
			aria-label={`${item.name} study session`}
			onKeyDown={(event) => {
				const isTypingTarget = Boolean(
					(event.target as HTMLElement).closest("input, textarea, select"),
				);
				if (isTypingTarget) return;
				if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
					event.preventDefault();
					onGoTo(currentIndex + (event.key === "ArrowLeft" ? -1 : 1));
				} else if (event.key === " " && !(event.target as HTMLElement).closest("button, a")) {
					event.preventDefault();
					onFlip();
				}
			}}
			tabIndex={0}
		>
			<div className="mx-auto flex min-h-0 w-full max-w-4xl flex-1 flex-col gap-4">
				<div
					role="button"
					className="workspace-flashcard group relative min-h-72 flex-1 cursor-pointer rounded-2xl outline-none focus-visible:ring-3 focus-visible:ring-ring/50 sm:min-h-96"
					aria-label={flipped ? "Show card front" : "Show card answer"}
					aria-pressed={flipped}
					aria-disabled={settling}
					tabIndex={0}
					onClick={(event) => {
						if ((event.target as HTMLElement).closest("a")) return;
						onFlip();
					}}
					onKeyDown={(event) => {
						if (event.key === "Enter") {
							event.preventDefault();
							onFlip();
						}
					}}
				>
					<div className={cn("workspace-flashcard-inner", flipped && "is-flipped")}>
						<FlashcardFace
							label="Front"
							content={currentCard.front}
							action={
								<FlashcardAiAction
									active={!flipped}
									label="Hint"
									onSend={() =>
										sendComposerPrompt(
											item.workspaceId,
											"Give me a helpful hint for the current flashcard without revealing the answer.",
										)
									}
								/>
							}
						/>
						<FlashcardFace
							back
							label="Back"
							content={currentCard.back}
							action={
								<FlashcardAiAction
									active={flipped}
									label="Explain"
									onSend={() =>
										sendComposerPrompt(
											item.workspaceId,
											"Explain the answer to the current flashcard clearly and concisely.",
										)
									}
								/>
							}
						/>
					</div>
				</div>

				<div className="space-y-3">
					<FlashcardStatusStrip
						cards={studyCards}
						currentIndex={currentIndex}
						gotItCount={gotItCount}
						missedCount={missedCount}
						onSelect={onGoTo}
						reviewsByCardId={studyState.cards}
					/>
					<div className="grid min-h-10 grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2">
						<span className="col-start-1 justify-self-start text-xs text-muted-foreground tabular-nums sm:text-sm">
							{currentIndex + 1} of {studyCards.length}
						</span>
						<div className="col-start-2 flex items-center justify-center gap-1 sm:gap-2">
							<Button
								variant="ghost"
								size="icon-lg"
								aria-label="Previous card"
								title="Previous card (Left arrow)"
								disabled={settling || currentIndex === 0}
								onClick={() => onGoTo(currentIndex - 1)}
							>
								<ChevronLeft />
							</Button>
							<Button
								variant="outline"
								aria-label="Review again"
								aria-pressed={currentRating === "again"}
								title="Review again"
								disabled={settling}
								className={cn(
									"border-red-500/30 text-red-600 hover:border-red-500/50 hover:bg-red-500/10 hover:text-red-700 dark:text-red-400",
									currentRating === "again" && "bg-red-500/10",
								)}
								onClick={() => onRate("again")}
							>
								<X /> No
							</Button>
							<Button
								variant="outline"
								aria-label="Got it"
								aria-pressed={currentRating !== undefined && currentRating !== "again"}
								title="Got it"
								disabled={settling}
								className={cn(
									"border-emerald-500/30 text-emerald-600 hover:border-emerald-500/50 hover:bg-emerald-500/10 hover:text-emerald-700 dark:text-emerald-400",
									currentRating !== undefined && currentRating !== "again" && "bg-emerald-500/10",
								)}
								onClick={() => onRate("good")}
							>
								<Check /> Yes
							</Button>
							<Button
								variant="ghost"
								size="icon-lg"
								aria-label="Next card"
								title="Next card (Right arrow)"
								disabled={settling || currentIndex === studyCards.length - 1}
								onClick={() => onGoTo(currentIndex + 1)}
							>
								<ChevronRight />
							</Button>
						</div>
						<span className="col-start-3 justify-self-end text-xs text-muted-foreground tabular-nums sm:text-sm">
							<span className="sm:hidden">{reviewedCount} done</span>
							<span className="hidden sm:inline">{reviewedCount} reviewed</span>
						</span>
					</div>
				</div>
			</div>
		</section>
	);
}

function FlashcardStatusStrip({
	cards,
	currentIndex,
	gotItCount,
	missedCount,
	onSelect,
	reviewsByCardId,
}: {
	cards: Flashcard[];
	currentIndex: number;
	gotItCount: number;
	missedCount: number;
	onSelect: (index: number) => void;
	reviewsByCardId: FlashcardStudyState["cards"];
}) {
	const unseenCount = cards.length - gotItCount - missedCount;
	const gap = cards.length <= 50 ? 3 : cards.length <= 120 ? 2 : cards.length <= 300 ? 1 : 0;

	return (
		<div
			role="group"
			aria-label={`${gotItCount} got it, ${missedCount} missed, ${unseenCount} not reviewed`}
			className="mx-auto grid h-4 w-full items-center"
			style={{
				columnGap: gap,
				gridTemplateColumns: `repeat(${cards.length}, minmax(0, 1fr))`,
				maxWidth: `${cards.length * 64}px`,
			}}
		>
			{cards.map((card, index) => {
				const rating = reviewsByCardId[card.id]?.lastRating;
				const status = getFlashcardRatingLabel(rating);
				return (
					<button
						key={card.id}
						type="button"
						aria-current={index === currentIndex ? "step" : undefined}
						aria-label={`Card ${index + 1}: ${status}`}
						tabIndex={index === currentIndex ? 0 : -1}
						onClick={() => onSelect(index)}
						className="group flex h-4 min-w-0 cursor-pointer items-center focus-visible:outline-none"
					>
						<span
							aria-hidden="true"
							className={cn(
								"h-1.5 w-full min-w-0 rounded-full bg-border transition-[height,background-color,box-shadow,filter] duration-150 group-hover:h-2.5 group-hover:brightness-125",
								rating === "again" && "bg-red-500/75",
								rating === "hard" && "bg-amber-500/75",
								(rating === "good" || rating === "easy") && "bg-emerald-500/75",
								index === currentIndex &&
									"h-2.5 ring-1 ring-foreground/70 ring-offset-1 ring-offset-background",
							)}
						/>
					</button>
				);
			})}
		</div>
	);
}

function getStudyCards(cardIds: string[], cardsById: ReadonlyMap<string, Flashcard>): Flashcard[] {
	const cards: Flashcard[] = [];
	for (const cardId of cardIds) {
		const card = cardsById.get(cardId);
		if (card) cards.push(card);
	}
	return cards;
}

function getFlashcardRatingLabel(rating: FlashcardStudyRating | undefined): string {
	switch (rating) {
		case "again":
			return "Missed";
		case "hard":
			return "Hard";
		case "good":
			return "Got it";
		case "easy":
			return "Easy";
		default:
			return "Not reviewed";
	}
}

function FlashcardFace({
	action,
	back = false,
	content,
	label,
}: {
	action: ReactNode;
	back?: boolean;
	content: TiptapDocumentJson;
	label: string;
}) {
	const textLength = countFlashcardText(content);
	const densityClass =
		textLength > 500 ? "is-very-dense" : textLength > 220 ? "is-dense" : undefined;
	const editor = useEditor(
		{
			content: content as unknown as JSONContent,
			editable: false,
			immediatelyRender: false,
			extensions: getTiptapDocumentBaseExtensions(),
			editorProps: {
				attributes: {
					class: cn(
						"workspace-document-prose workspace-flashcard-prose outline-none",
						densityClass,
					),
				},
			},
		},
		[content],
	);

	return (
		<div className={cn("workspace-flashcard-face", back && "workspace-flashcard-back")}>
			<span className="absolute top-5 left-5 text-xs font-medium uppercase tracking-wider text-muted-foreground">
				{label}
			</span>
			{action}
			<EditorContent editor={editor} />
		</div>
	);
}

function FlashcardAiAction({
	active,
	label,
	onSend,
}: {
	active: boolean;
	label: string;
	onSend: () => void;
}) {
	return (
		<Button
			variant="ghost"
			size="sm"
			aria-hidden={!active}
			tabIndex={active ? 0 : -1}
			className="absolute top-4 right-4 z-10 text-amber-600 hover:bg-amber-500/10 hover:text-amber-700 dark:text-amber-400 dark:hover:text-amber-300"
			onClick={(event) => {
				event.stopPropagation();
				onSend();
			}}
			onKeyDown={(event) => event.stopPropagation()}
		>
			<Lightbulb />
			{label}
		</Button>
	);
}

function countFlashcardText(value: unknown): number {
	if (Array.isArray(value)) {
		return value.reduce((length, entry) => length + countFlashcardText(entry), 0);
	}
	if (!isRecord(value)) return 0;
	return (
		(typeof value.text === "string" ? value.text.length : 0) + countFlashcardText(value.content)
	);
}

function FlashcardViewerSkeleton() {
	return (
		<div className="flex h-full flex-col gap-4 p-6 sm:p-8">
			<Skeleton className="h-7 w-48" />
			<Skeleton className="mx-auto min-h-72 w-full max-w-4xl flex-1 rounded-2xl" />
			<Skeleton className="mx-auto h-10 w-48" />
		</div>
	);
}
