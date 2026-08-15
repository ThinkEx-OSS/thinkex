import { useQuery } from "@tanstack/react-query";
import { Check, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

import { Button } from "#/components/ui/button";
import { Skeleton } from "#/components/ui/skeleton";
import { sendComposerPrompt } from "#/features/workspaces/composer/workspace-composer-actions";
import { StudyProgressStrip } from "#/features/workspaces/components/study/StudyProgressStrip";
import { StudyRichText } from "#/features/workspaces/components/study/StudyRichText";
import {
	StudyAiActionButton,
	StudyNavButton,
	useStudySessionFocus,
} from "#/features/workspaces/components/study/StudySessionControls";
import { StudyToolbar } from "#/features/workspaces/components/study/StudyToolbar";
import { useWorkspaceItemToolbar } from "#/features/workspaces/components/WorkspaceItemToolbarSlot";
import type { TiptapDocumentJson } from "#/features/workspaces/documents/tiptap-document";
import type { WorkspaceItem } from "#/features/workspaces/contracts";
import { useWorkspaceRevealRequest } from "#/features/workspaces/locations/workspace-location-context";
import type { QuizQuestion } from "#/features/workspaces/quizzes/quiz-content";
import {
	quizViewerQueryOptions,
	useRecordQuizAnswer,
	useResetQuizStudyProgress,
} from "#/features/workspaces/quizzes/quiz-queries";
import {
	createQuizStudyQueue,
	getQuizStudyViewState,
	type QuizStudyMode,
} from "#/features/workspaces/quizzes/quiz-study-session";
import {
	getQuizAnswer,
	summarizeQuizStudyProgress,
	type QuizStudyState,
} from "#/features/workspaces/quizzes/quiz-study-state";
import { useWorkspaceUiStore } from "#/features/workspaces/state/workspace-ui-store";
import { cn } from "#/lib/utils";

interface QuizSessionState {
	questionIds: string[];
	currentIndex: number;
	mode: QuizStudyMode;
	/** The option picked but not yet submitted for the current question. */
	pendingOptionId: string | null;
	shuffled: boolean;
}

export function QuizViewer({
	itemPath,
	item,
	viewInstanceId,
}: {
	itemPath: string;
	item: WorkspaceItem;
	viewInstanceId: string;
}) {
	const { data, error, isPending } = useQuery(
		quizViewerQueryOptions({
			itemId: item.id,
			updatedAt: item.updatedAt,
			workspaceId: item.workspaceId,
		}),
	);

	if (isPending) return <QuizViewerSkeleton />;
	if (error || !data) {
		return (
			<div className="flex h-full items-center justify-center p-6 text-center text-muted-foreground">
				Could not load this quiz.
			</div>
		);
	}
	return (
		<QuizStudySession
			key={`${item.id}:${item.updatedAt}`}
			questions={data.questions}
			itemPath={itemPath}
			studyState={data.studyState}
			item={item}
			viewInstanceId={viewInstanceId}
		/>
	);
}

function QuizStudySession({
	questions,
	itemPath,
	studyState,
	item,
	viewInstanceId,
}: {
	questions: QuizQuestion[];
	itemPath: string;
	studyState: QuizStudyState;
	item: WorkspaceItem;
	viewInstanceId: string;
}) {
	const [session, setSession] = useState<QuizSessionState>(() => ({
		questionIds: createQuizStudyQueue({ questions, mode: "all", shuffled: false, studyState }),
		currentIndex: 0,
		mode: "all",
		pendingOptionId: null,
		shuffled: false,
	}));
	const { questionIds, currentIndex, mode, pendingOptionId, shuffled } = session;
	const questionsById = useMemo(
		() => new Map(questions.map((question) => [question.id, question])),
		[questions],
	);
	const studyQuestions = useMemo(
		() =>
			questionIds.flatMap((questionId) => {
				const question = questionsById.get(questionId);
				return question ? [question] : [];
			}),
		[questionIds, questionsById],
	);
	const currentQuestion = studyQuestions[currentIndex];
	const sourceQuestionNumber = currentQuestion
		? questions.findIndex((question) => question.id === currentQuestion.id) + 1
		: 0;
	const answer = currentQuestion ? getQuizAnswer(currentQuestion, studyState) : undefined;
	const sectionRef = useStudySessionFocus(currentQuestion?.id);
	const quizProgress = useMemo(
		() => summarizeQuizStudyProgress(questions, studyState),
		[questions, studyState],
	);
	const clearItemViewState = useWorkspaceUiStore((state) => state.clearItemViewState);
	const setItemViewState = useWorkspaceUiStore((state) => state.setItemViewState);
	const { complete: completeRevealRequest, request: revealRequest } = useWorkspaceRevealRequest(
		viewInstanceId,
		"quiz-question",
	);
	const queryInput = {
		itemId: item.id,
		updatedAt: item.updatedAt,
		workspaceId: item.workspaceId,
	};
	const recordAnswer = useRecordQuizAnswer(queryInput);
	const { isPending: isResetting, mutate: resetProgress } = useResetQuizStudyProgress(queryInput);
	const startSession = useCallback(
		(nextMode: QuizStudyMode, nextShuffled: boolean) => {
			setSession({
				questionIds: createQuizStudyQueue({
					questions,
					mode: nextMode,
					shuffled: nextShuffled,
					studyState,
				}),
				currentIndex: 0,
				mode: nextMode,
				pendingOptionId: null,
				shuffled: nextShuffled,
			});
		},
		[questions, studyState],
	);
	const goTo = useCallback((index: number) => {
		setSession((current) => ({
			...current,
			currentIndex: Math.min(Math.max(index, 0), current.questionIds.length - 1),
			pendingOptionId: null,
		}));
	}, []);
	const resetStudyProgress = useCallback(() => {
		startSession("all", false);
		resetProgress();
	}, [resetProgress, startSession]);
	const toolbar = useMemo(
		() => (
			<StudyToolbar
				canReset={quizProgress.answeredCount > 0}
				isResetting={isResetting}
				labels={{
					allLabel: "All questions",
					mobileLabel: "Quiz options",
					resetAriaLabel: "Reset quiz progress",
					resetDescription:
						"This clears every saved answer for this quiz. The questions themselves will not change.",
					resetTitle: "Reset quiz progress?",
				}}
				missedCount={quizProgress.incorrectCount}
				mode={mode}
				shuffled={shuffled}
				onModeChange={(nextMode) => startSession(nextMode, shuffled)}
				onReset={resetStudyProgress}
				onShuffleToggle={() => startSession(mode, !shuffled)}
			/>
		),
		[isResetting, mode, quizProgress, resetStudyProgress, shuffled, startSession],
	);
	useWorkspaceItemToolbar(viewInstanceId, toolbar);
	useEffect(() => {
		if (!currentQuestion) return;
		setItemViewState(item.workspaceId, viewInstanceId, {
			itemId: item.id,
			...getQuizStudyViewState({
				answered: answer !== undefined,
				...(answer ? { correct: answer.selectedOptionId === currentQuestion.correctOptionId } : {}),
				mode,
				progress: quizProgress,
				sessionPosition: currentIndex + 1,
				sessionTotal: studyQuestions.length,
				shuffled,
				sourceQuestionNumber,
			}),
		});
	}, [
		answer,
		currentIndex,
		currentQuestion,
		item.id,
		item.workspaceId,
		mode,
		quizProgress,
		setItemViewState,
		shuffled,
		sourceQuestionNumber,
		studyQuestions.length,
		viewInstanceId,
	]);
	useEffect(
		() => () => clearItemViewState(item.workspaceId, viewInstanceId),
		[clearItemViewState, item.workspaceId, viewInstanceId],
	);
	useEffect(() => {
		if (!revealRequest) return;
		let nextQuestionIds = questionIds;
		let questionIndex = nextQuestionIds.indexOf(revealRequest.location.questionId);
		if (questionIndex < 0 && questionsById.has(revealRequest.location.questionId)) {
			nextQuestionIds = createQuizStudyQueue({ questions, mode: "all", shuffled, studyState });
			questionIndex = nextQuestionIds.indexOf(revealRequest.location.questionId);
		}
		let cancelled = false;
		queueMicrotask(() => {
			if (cancelled) return;
			if (questionIndex >= 0) {
				setSession((current) => ({
					...current,
					questionIds: nextQuestionIds,
					currentIndex: questionIndex,
					mode: nextQuestionIds === questionIds ? current.mode : "all",
					pendingOptionId: null,
				}));
			}
			completeRevealRequest(revealRequest, questionIndex >= 0);
		});
		return () => {
			cancelled = true;
		};
	}, [
		completeRevealRequest,
		questionIds,
		questions,
		questionsById,
		revealRequest,
		shuffled,
		studyState,
	]);

	if (questions.length === 0) {
		return (
			<div className="flex h-full items-center justify-center p-6 text-center">
				<div className="space-y-1">
					<h2 className="font-medium">No questions yet</h2>
					<p className="text-sm text-muted-foreground">Ask AI to add questions to this quiz.</p>
				</div>
			</div>
		);
	}
	if (studyQuestions.length === 0) {
		return (
			<div className="flex h-full items-center justify-center p-6 text-center">
				<div className="space-y-3">
					<div className="space-y-1">
						<h2 className="font-medium">No missed questions</h2>
						<p className="text-sm text-muted-foreground">Nothing needs another try right now.</p>
					</div>
					<Button variant="outline" onClick={() => startSession("all", shuffled)}>
						Take the whole quiz
					</Button>
				</div>
			</div>
		);
	}
	if (!currentQuestion) return null;

	const graded = answer !== undefined;
	const isCorrect = answer?.selectedOptionId === currentQuestion.correctOptionId;
	const selectedOptionId = graded ? answer.selectedOptionId : pendingOptionId;
	const isLastQuestion = currentIndex >= studyQuestions.length - 1;
	// Khan-style: the pending pick, and the correct option once graded, get an
	// outline. Wrong picks keep only the filled X — no row chrome — so they
	// stay in the hairline list.
	const outlinedOptionIds = new Set(
		[!graded ? selectedOptionId : null, graded ? currentQuestion.correctOptionId : null].filter(
			Boolean,
		),
	);
	const lastOption = currentQuestion.options.at(-1);

	return (
		<section
			ref={sectionRef}
			className="flex h-full min-h-0 flex-col bg-background px-4 py-5 sm:px-8 sm:py-7"
			aria-label={`${item.name} quiz session`}
			tabIndex={0}
			onKeyDown={(event) => {
				if ((event.target as HTMLElement).closest("input, textarea, select")) return;
				if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
					event.preventDefault();
					goTo(currentIndex + (event.key === "ArrowLeft" ? -1 : 1));
				}
			}}
		>
			<div className="mx-auto flex min-h-0 w-full max-w-4xl flex-1 flex-col gap-4">
				{/* Keyed by question so a scrolled-down long question does not leave the
				    next one scrolled past its stem. pt-1 leaves the Hint button's focus
				    ring room inside the scroller, which clips both axes once
				    overflow-y is set. */}
				<div key={currentQuestion.id} className="min-h-0 flex-1 overflow-y-auto pt-1">
					<div className="flex items-start justify-between gap-3 pb-5">
						<QuizRichText content={currentQuestion.question} />
						{/* The slot keeps its height once grading removes the Hint, so the
						    options below do not jump up. */}
						<div className="flex h-8 shrink-0 items-center">
							{!graded ? (
								<StudyAiActionButton
									label="Hint"
									onSend={() =>
										sendComposerPrompt(
											item.workspaceId,
											`Give me a helpful hint for question ${sourceQuestionNumber} in “${itemPath}” without revealing the answer.`,
										)
									}
								/>
							) : null}
						</div>
					</div>

					<div role="radiogroup" aria-label="Answer options">
						{currentQuestion.options.map((option, optionIndex) => {
							const isSelected = option.id === selectedOptionId;
							const isCorrectOption = option.id === currentQuestion.correctOptionId;
							const previousOption = currentQuestion.options[optionIndex - 1];
							return (
								<div key={option.id}>
									<QuizOptionRule
										visible={
											!outlinedOptionIds.has(option.id) &&
											!(previousOption && outlinedOptionIds.has(previousOption.id))
										}
									/>
									<button
										type="button"
										role="radio"
										aria-checked={isSelected}
										disabled={graded || recordAnswer.isPending}
										className={cn(
											"flex w-full items-center gap-3 rounded-xl border border-transparent px-3 py-4 text-left transition-colors",
											!graded && "cursor-pointer hover:bg-accent/40",
											!graded && isSelected && "border-primary/60 bg-primary/5",
											graded && isCorrectOption && "border-emerald-500/60 bg-emerald-500/10",
											graded && !isSelected && !isCorrectOption && "opacity-60",
										)}
										onClick={() =>
											setSession((current) => ({ ...current, pendingOptionId: option.id }))
										}
									>
										<span
											className={cn(
												"flex size-6 shrink-0 items-center justify-center rounded-full border text-xs font-semibold text-muted-foreground",
												!graded &&
													isSelected &&
													"border-primary bg-primary text-primary-foreground",
												graded &&
													isCorrectOption &&
													"border-emerald-600 bg-emerald-600 text-white dark:border-emerald-500 dark:bg-emerald-500",
												graded &&
													isSelected &&
													!isCorrectOption &&
													"border-red-600 bg-red-600 text-white dark:border-red-500 dark:bg-red-500",
											)}
										>
											{graded && isCorrectOption ? (
												<Check className="size-3.5" />
											) : graded && isSelected ? (
												<X className="size-3.5" />
											) : (
												String.fromCharCode(65 + optionIndex)
											)}
										</span>
										<QuizRichText content={option.text} compact />
									</button>
								</div>
							);
						})}
						<QuizOptionRule visible={!lastOption || !outlinedOptionIds.has(lastOption.id)} />
					</div>

					{graded ? (
						<div
							className={cn(
								"mt-4 mb-3 rounded-xl border p-4",
								isCorrect
									? "border-emerald-500/40 bg-emerald-500/5"
									: "border-red-500/40 bg-red-500/5",
							)}
						>
							<div className="mb-1 flex items-center justify-between gap-2">
								<span
									className={cn(
										"text-sm font-medium",
										isCorrect
											? "text-emerald-700 dark:text-emerald-400"
											: "text-red-700 dark:text-red-400",
									)}
								>
									{isCorrect ? "Correct" : "Incorrect"}
								</span>
								<StudyAiActionButton
									label="Explain more"
									onSend={() =>
										sendComposerPrompt(
											item.workspaceId,
											`Explain the answer to question ${sourceQuestionNumber} in “${itemPath}” in more depth.`,
										)
									}
								/>
							</div>
							<QuizRichText content={currentQuestion.explanation} compact />
						</div>
					) : null}
				</div>

				<div className="space-y-3">
					<StudyProgressStrip
						ariaLabel={`${quizProgress.correctCount} correct, ${quizProgress.incorrectCount} missed, ${quizProgress.unansweredCount} unanswered`}
						currentIndex={currentIndex}
						onSelect={goTo}
						segments={studyQuestions.map((question, index) => {
							const questionAnswer = getQuizAnswer(question, studyState);
							const questionCorrect = questionAnswer?.selectedOptionId === question.correctOptionId;
							return {
								id: question.id,
								label: `Question ${index + 1}: ${
									!questionAnswer ? "Unanswered" : questionCorrect ? "Correct" : "Missed"
								}`,
								tone: !questionAnswer ? "unseen" : questionCorrect ? "correct" : "missed",
							};
						})}
					/>
					<div className="grid min-h-10 grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2">
						<span className="justify-self-start text-xs text-muted-foreground tabular-nums sm:text-sm">
							{quizProgress.answeredCount} answered
						</span>
						<div className="col-start-2 flex items-center justify-center gap-1 sm:gap-2">
							<StudyNavButton
								direction="previous"
								noun="question"
								disabled={currentIndex === 0}
								onClick={() => goTo(currentIndex - 1)}
							/>
							<span className="text-sm text-muted-foreground tabular-nums">
								{currentIndex + 1} of {studyQuestions.length}
							</span>
							<StudyNavButton
								direction="next"
								noun="question"
								disabled={isLastQuestion}
								onClick={() => goTo(currentIndex + 1)}
							/>
						</div>
						{graded ? (
							<Button
								variant="outline"
								className="col-start-3 h-11 justify-self-end rounded-xl px-5 text-sm font-medium sm:h-12 sm:px-6 sm:text-base"
								disabled={isLastQuestion}
								onClick={() => goTo(currentIndex + 1)}
							>
								Next question
							</Button>
						) : (
							<Button
								className="col-start-3 h-11 justify-self-end rounded-xl px-5 text-sm font-medium sm:h-12 sm:px-6 sm:text-base"
								disabled={!pendingOptionId || recordAnswer.isPending}
								onClick={() => {
									if (!pendingOptionId) return;
									recordAnswer.mutate({
										questionId: currentQuestion.id,
										selectedOptionId: pendingOptionId,
									});
								}}
							>
								Submit
							</Button>
						)}
					</div>
				</div>
			</div>
		</section>
	);
}

function QuizRichText({ content, compact }: { content: TiptapDocumentJson; compact?: boolean }) {
	return (
		<StudyRichText
			className="min-w-0 flex-1"
			content={content}
			proseClassName={cn("is-flush", compact && "text-sm")}
		/>
	);
}

/**
 * Hairline between answer rows. Always in the flow and hidden by colour rather
 * than by unmounting, so rows never shift as the outline moves between them.
 */
function QuizOptionRule({ visible }: { visible: boolean }) {
	return <div className={cn("border-t", !visible && "border-transparent")} />;
}

function QuizViewerSkeleton() {
	return (
		<div className="flex h-full min-h-0 flex-col px-4 py-5 sm:px-8 sm:py-7">
			<div className="mx-auto flex min-h-0 w-full max-w-4xl flex-1 flex-col gap-4">
				<div className="min-h-0 flex-1 pt-1">
					<div className="flex items-start justify-between gap-3 pb-5">
						<Skeleton className="h-6 w-2/3" />
						<Skeleton className="h-8 w-16 rounded-lg" />
					</div>
					{/* Widths vary so the rows read as answers rather than a block. */}
					{["w-3/5", "w-2/5", "w-1/2", "w-4/6"].map((width) => (
						<div key={width} className="border-t">
							<div className="flex items-center gap-3 px-3 py-4">
								<Skeleton className="size-6 shrink-0 rounded-full" />
								<Skeleton className={cn("h-4", width)} />
							</div>
						</div>
					))}
					<div className="border-t" />
				</div>
				<div className="space-y-3">
					<div className="flex h-4 items-center">
						<Skeleton className="h-1.5 w-full rounded-full" />
					</div>
					<div className="grid min-h-10 grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2">
						<Skeleton className="h-4 w-24 justify-self-start" />
						<div className="col-start-2 flex items-center justify-center gap-1 sm:gap-2">
							<Skeleton className="size-11 rounded-xl sm:size-12" />
							<Skeleton className="h-4 w-14" />
							<Skeleton className="size-11 rounded-xl sm:size-12" />
						</div>
						<Skeleton className="col-start-3 h-11 w-24 justify-self-end rounded-xl sm:h-12" />
					</div>
				</div>
			</div>
		</div>
	);
}
