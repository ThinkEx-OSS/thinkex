import { useQuery } from "@tanstack/react-query";
import type { JSONContent } from "@tiptap/core";
import { EditorContent, useEditor } from "@tiptap/react";
import { Check, ChevronLeft, ChevronRight, Lightbulb, X } from "lucide-react";
import { domAnimation, LazyMotion, m, MotionConfig } from "motion/react";
import { type ReactNode, useCallback, useEffect, useMemo, useState } from "react";

import { Button } from "#/components/ui/button";
import { Skeleton } from "#/components/ui/skeleton";
import { sendComposerPrompt } from "#/features/workspaces/composer/workspace-composer-actions";
import { FlashcardToolbar } from "#/features/workspaces/components/flashcards/FlashcardToolbar";
import { useWorkspaceItemToolbar } from "#/features/workspaces/components/WorkspaceItemToolbarSlot";
import { getTiptapDocumentBaseExtensions } from "#/features/workspaces/documents/tiptap-extensions";
import type { TiptapDocumentJson } from "#/features/workspaces/documents/tiptap-document";
import {
	flashcardViewerQueryOptions,
	useRecordFlashcardStudyRating,
	useResetFlashcardStudyProgress,
} from "#/features/workspaces/flashcards/flashcard-queries";
import {
	summarizeFlashcardStudyProgress,
	type FlashcardStudyRating,
	type FlashcardStudyState,
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

interface FlashcardSessionState {
	cardIds: string[];
	currentIndex: number;
	flipped: boolean;
	mode: FlashcardStudyMode;
	ratingFeedback: FlashcardStudyRating | null;
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
			key={`${item.id}:${item.updatedAt}`}
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
		ratingFeedback: null,
		shuffled: false,
	}));
	const { cardIds: studyCardIds, currentIndex, flipped, mode, ratingFeedback, shuffled } = session;
	const settling = ratingFeedback !== null;
	const cardsById = useMemo(() => new Map(cards.map((card) => [card.id, card])), [cards]);
	const studyCards = useMemo(
		() => getStudyCards(studyCardIds, cardsById),
		[cardsById, studyCardIds],
	);
	const currentCard = studyCards[currentIndex];
	const sessionProgress = useMemo(
		() =>
			summarizeFlashcardStudyProgress(
				studyCards.map((card) => card.id),
				studyState,
			),
		[studyCards, studyState],
	);
	const studyProgress = useMemo(
		() =>
			summarizeFlashcardStudyProgress(
				cards.map((card) => card.id),
				studyState,
			),
		[cards, studyState],
	);
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
	const startSession = useCallback(
		(nextMode: FlashcardStudyMode, nextShuffled: boolean) => {
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
				ratingFeedback: null,
				shuffled: nextShuffled,
			});
		},
		[cards, studyState],
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
	const toolbar = useMemo(
		() => (
			<FlashcardToolbar
				canReset={studyProgress.reviewedCount > 0}
				isResetting={isResetting}
				missedCount={studyProgress.missedCount}
				mode={mode}
				shuffled={shuffled}
				onModeChange={changeMode}
				onReset={resetStudyProgress}
				onShuffleToggle={toggleShuffle}
			/>
		),
		[
			changeMode,
			isResetting,
			mode,
			resetStudyProgress,
			shuffled,
			studyProgress.missedCount,
			studyProgress.reviewedCount,
			toggleShuffle,
		],
	);
	useWorkspaceItemToolbar(viewInstanceId, toolbar);
	useEffect(() => {
		if (!currentCard) return;
		setItemViewState(item.workspaceId, viewInstanceId, {
			itemId: item.id,
			label: `card ${currentIndex + 1}`,
			detail: getFlashcardViewStateDetail({
				cardId: currentCard.id,
				cardNumber: currentIndex + 1,
				currentRating,
				flipped,
				mode,
				shuffled,
				studyProgress,
				totalCards: studyCards.length,
			}),
		});
	}, [
		currentCard,
		currentIndex,
		currentRating,
		flipped,
		item.id,
		item.workspaceId,
		mode,
		setItemViewState,
		shuffled,
		studyProgress,
		studyCards.length,
		viewInstanceId,
	]);
	useEffect(
		() => () => clearItemViewState(item.workspaceId, viewInstanceId),
		[clearItemViewState, item.workspaceId, viewInstanceId],
	);
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
				setSession((current) => ({
					...current,
					cardIds: nextCardIds,
					currentIndex: cardIndex,
					flipped: revealRequest.location.side === "back",
					mode: nextCardIds === studyCardIds ? mode : "all",
					ratingFeedback: null,
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
		setSession((current) => ({
			...current,
			currentIndex: nextIndex,
			flipped: false,
			ratingFeedback: null,
		}));
	};

	const rate = (rating: FlashcardStudyRating) => {
		if (settling) return;
		recordRating.mutate({ cardId: currentCard.id, rating });
		setSession((current) => ({
			...current,
			ratingFeedback: rating,
		}));
	};
	const finishRatingAnimation = () => {
		setSession((current) => {
			if (!current.ratingFeedback) return current;
			const hasNextCard = current.currentIndex < current.cardIds.length - 1;
			return {
				...current,
				currentIndex: hasNextCard ? current.currentIndex + 1 : current.currentIndex,
				flipped: false,
				ratingFeedback: null,
			};
		});
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
			gotItCount={sessionProgress.gotItCount}
			item={item}
			missedCount={sessionProgress.missedCount}
			onFlip={flipCard}
			onGoTo={goTo}
			onRate={rate}
			onRatingAnimationComplete={finishRatingAnimation}
			ratingFeedback={ratingFeedback}
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
	onRatingAnimationComplete,
	ratingFeedback,
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
	onRatingAnimationComplete: () => void;
	ratingFeedback: FlashcardStudyRating | null;
	studyCards: Flashcard[];
	studyState: FlashcardStudyState;
}) {
	const settling = ratingFeedback !== null;
	const nextCard = ratingFeedback ? studyCards[currentIndex + 1] : undefined;
	const ratingDirection = ratingFeedback === "again" ? -1 : 1;
	const ratingAnimation = ratingFeedback
		? {
				x: ratingDirection * 120,
				y: 80,
				rotate: ratingDirection * 5,
				scale: 0.9,
				opacity: 0,
			}
		: { x: 0, y: 0, rotate: 0, scale: 1, opacity: 1 };

	return (
		<LazyMotion features={domAnimation}>
			<MotionConfig reducedMotion="user">
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
						<div className="relative min-h-72 flex-1 rounded-2xl sm:min-h-96">
							{nextCard ? (
								<div
									aria-hidden="true"
									className="workspace-flashcard absolute inset-0 rounded-2xl"
								>
									<FlashcardFace label="Front" content={nextCard.front} action={null} />
								</div>
							) : null}
							<m.div
								key={currentCard.id}
								className="workspace-flashcard group absolute inset-0 z-[1] cursor-pointer rounded-2xl"
								initial={false}
								animate={ratingAnimation}
								transition={{ duration: ratingFeedback ? 0.28 : 0, ease: "easeInOut" }}
								style={{ transformOrigin: ratingDirection < 0 ? "bottom left" : "bottom right" }}
								onAnimationComplete={() => {
									if (ratingFeedback) onRatingAnimationComplete();
								}}
								onClick={(event) => {
									if ((event.target as HTMLElement).closest("button, a")) return;
									onFlip();
								}}
							>
								<div className="absolute inset-0">
									<m.div
										className={cn("workspace-flashcard-inner", flipped && "is-flipped")}
										initial={false}
										animate={{ rotateY: flipped ? 180 : 0 }}
										transition={{ type: "spring", visualDuration: 0.4, bounce: 0.08 }}
									>
										<FlashcardFace
											active={!flipped}
											label="Front"
											content={currentCard.front}
											action={
												<FlashcardAiAction
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
											active={flipped}
											back
											label="Back"
											content={currentCard.back}
											action={
												<FlashcardAiAction
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
									</m.div>
								</div>
							</m.div>
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
								<span className="justify-self-start text-xs text-muted-foreground tabular-nums sm:text-sm">
									{gotItCount + missedCount} reviewed
								</span>
								<div className="col-start-2 flex items-center justify-center gap-1 sm:gap-2">
									<Button
										variant="ghost"
										size="icon-lg"
										aria-label="Previous card"
										title="Previous card (Left arrow)"
										disabled={settling || currentIndex === 0}
										className="size-11 rounded-xl [&_svg]:size-4.5 sm:size-12 sm:[&_svg]:size-5"
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
											"h-11 gap-2 rounded-xl px-5 text-sm font-medium [&_svg]:size-4.5 sm:h-12 sm:px-6 sm:text-base sm:[&_svg]:size-5",
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
											"h-11 gap-2 rounded-xl px-5 text-sm font-medium [&_svg]:size-4.5 sm:h-12 sm:px-6 sm:text-base sm:[&_svg]:size-5",
											"border-emerald-500/30 text-emerald-600 hover:border-emerald-500/50 hover:bg-emerald-500/10 hover:text-emerald-700 dark:text-emerald-400",
											currentRating !== undefined &&
												currentRating !== "again" &&
												"bg-emerald-500/10",
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
										className="size-11 rounded-xl [&_svg]:size-4.5 sm:size-12 sm:[&_svg]:size-5"
										onClick={() => onGoTo(currentIndex + 1)}
									>
										<ChevronRight />
									</Button>
								</div>
								<span className="col-start-3 justify-self-end text-xs text-muted-foreground tabular-nums sm:text-sm">
									{currentIndex + 1} of {studyCards.length}
								</span>
							</div>
						</div>
					</div>
				</section>
			</MotionConfig>
		</LazyMotion>
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

function getFlashcardViewStateDetail(input: {
	cardId: string;
	cardNumber: number;
	currentRating?: FlashcardStudyRating;
	flipped: boolean;
	mode: FlashcardStudyMode;
	shuffled: boolean;
	studyProgress: ReturnType<typeof summarizeFlashcardStudyProgress>;
	totalCards: number;
}) {
	const side = input.flipped ? "back shown" : "front shown";
	const order = input.shuffled ? "shuffled" : "original order";
	const mode = input.mode === "missed" ? "missed cards" : "all cards";
	const rating = input.currentRating
		? `, marked ${input.currentRating === "again" ? "no" : input.currentRating === "good" ? "yes" : input.currentRating}`
		: "";
	return `card ${input.cardNumber} of ${input.totalCards} in the current session (cardId ${input.cardId}), ${side}, set progress: ${input.studyProgress.reviewedCount} of ${input.studyProgress.totalCards} reviewed (${input.studyProgress.gotItCount} got it, ${input.studyProgress.missedCount} missed), session: ${mode}, ${order}${rating}`;
}

function FlashcardFace({
	active = true,
	action,
	back = false,
	content,
	label,
}: {
	active?: boolean;
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
		<div
			aria-hidden={!active}
			className={cn("workspace-flashcard-face", back && "workspace-flashcard-back")}
			inert={!active}
		>
			<span className="absolute top-5 left-5 text-xs font-medium uppercase tracking-wider text-muted-foreground">
				{label}
			</span>
			{action}
			<EditorContent editor={editor} />
		</div>
	);
}

function FlashcardAiAction({ label, onSend }: { label: string; onSend: () => void }) {
	return (
		<Button
			variant="ghost"
			size="sm"
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
		<div className="flex h-full min-h-0 flex-col px-4 py-5 sm:px-8 sm:py-7">
			<div className="mx-auto flex min-h-0 w-full max-w-4xl flex-1 flex-col gap-4">
				<Skeleton className="min-h-72 flex-1 rounded-2xl sm:min-h-96" />
				<div className="space-y-3">
					<Skeleton className="h-2 w-full rounded-full" />
					<div className="grid min-h-10 grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2">
						<Skeleton className="h-4 w-20 justify-self-start" />
						<div className="col-start-2 flex items-center justify-center gap-1 sm:gap-2">
							<Skeleton className="size-11 rounded-xl sm:size-12" />
							<Skeleton className="h-11 w-20 rounded-xl sm:h-12 sm:w-24" />
							<Skeleton className="h-11 w-20 rounded-xl sm:h-12 sm:w-24" />
							<Skeleton className="size-11 rounded-xl sm:size-12" />
						</div>
						<Skeleton className="col-start-3 h-4 w-14 justify-self-end" />
					</div>
				</div>
			</div>
		</div>
	);
}
