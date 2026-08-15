import { useQuery } from "@tanstack/react-query";
import type { JSONContent } from "@tiptap/core";
import { EditorContent, useEditor } from "@tiptap/react";
import { Check, ChevronLeft, ChevronRight, Lightbulb, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

import { Button } from "#/components/ui/button";
import { Skeleton } from "#/components/ui/skeleton";
import { sendComposerPrompt } from "#/features/workspaces/composer/workspace-composer-actions";
import { StudyToolbar } from "#/features/workspaces/components/study/StudyToolbar";
import { useWorkspaceItemToolbar } from "#/features/workspaces/components/WorkspaceItemToolbarSlot";
import { getTiptapDocumentBaseExtensions } from "#/features/workspaces/documents/tiptap-extensions";
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
		shuffled: false,
	}));
	const { questionIds, currentIndex, mode, shuffled } = session;
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
				shuffled: nextShuffled,
			});
		},
		[questions, studyState],
	);
	const goTo = useCallback((index: number) => {
		setSession((current) => ({
			...current,
			currentIndex: Math.min(Math.max(index, 0), current.questionIds.length - 1),
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

	const isCorrect = answer?.selectedOptionId === currentQuestion.correctOptionId;

	return (
		<div
			className="mx-auto flex h-full w-full max-w-2xl flex-col gap-4 overflow-y-auto p-4 sm:p-6"
			onKeyDown={(event) => {
				if (event.key === "ArrowLeft") goTo(currentIndex - 1);
				if (event.key === "ArrowRight") goTo(currentIndex + 1);
			}}
		>
			<div className="flex items-baseline justify-between gap-2">
				<span className="text-sm font-medium text-muted-foreground">
					Question {sourceQuestionNumber} of {questions.length}
				</span>
				<span className="text-sm text-muted-foreground tabular-nums">
					{quizProgress.correctCount}/{quizProgress.answeredCount} correct
				</span>
			</div>

			<div className="rounded-2xl border bg-card p-5">
				<QuizRichText content={currentQuestion.question} />
				{answer === undefined ? (
					<Button
						variant="ghost"
						size="sm"
						className="mt-2 -ml-2 text-amber-600 hover:bg-amber-500/10 hover:text-amber-700 dark:text-amber-400 dark:hover:text-amber-300"
						onClick={() =>
							sendComposerPrompt(
								item.workspaceId,
								`Give me a helpful hint for question ${sourceQuestionNumber} in “${itemPath}” without revealing the answer.`,
							)
						}
					>
						<Lightbulb />
						Hint
					</Button>
				) : null}
			</div>

			<div className="grid gap-2" role="radiogroup" aria-label="Answer options">
				{currentQuestion.options.map((option, optionIndex) => {
					const isSelected = answer?.selectedOptionId === option.id;
					const isCorrectOption = option.id === currentQuestion.correctOptionId;
					const graded = answer !== undefined;
					return (
						<button
							key={option.id}
							type="button"
							role="radio"
							aria-checked={isSelected}
							disabled={graded || recordAnswer.isPending}
							className={cn(
								"flex w-full items-start gap-3 rounded-xl border bg-card p-4 text-left transition-colors",
								!graded && "cursor-pointer hover:border-foreground/30 hover:bg-accent/50",
								graded && isCorrectOption && "border-emerald-500/60 bg-emerald-500/10",
								graded && isSelected && !isCorrectOption && "border-red-500/60 bg-red-500/10",
								graded && !isSelected && !isCorrectOption && "opacity-60",
							)}
							onClick={() =>
								recordAnswer.mutate({
									questionId: currentQuestion.id,
									selectedOptionId: option.id,
								})
							}
						>
							<span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full border text-xs font-medium text-muted-foreground">
								{graded && isCorrectOption ? (
									<Check className="size-3.5 text-emerald-600 dark:text-emerald-400" />
								) : graded && isSelected ? (
									<X className="size-3.5 text-red-600 dark:text-red-400" />
								) : (
									String.fromCharCode(65 + optionIndex)
								)}
							</span>
							<QuizRichText content={option.text} compact />
						</button>
					);
				})}
			</div>

			{answer !== undefined ? (
				<div
					className={cn(
						"rounded-xl border p-4",
						isCorrect ? "border-emerald-500/40 bg-emerald-500/5" : "border-red-500/40 bg-red-500/5",
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
						<Button
							variant="ghost"
							size="sm"
							className="text-amber-600 hover:bg-amber-500/10 hover:text-amber-700 dark:text-amber-400 dark:hover:text-amber-300"
							onClick={() =>
								sendComposerPrompt(
									item.workspaceId,
									`Explain the answer to question ${sourceQuestionNumber} in “${itemPath}” in more depth.`,
								)
							}
						>
							<Lightbulb />
							Explain more
						</Button>
					</div>
					<QuizRichText content={currentQuestion.explanation} compact />
				</div>
			) : null}

			<div className="mt-auto grid min-h-10 grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2 pb-2">
				<span className="justify-self-start text-xs text-muted-foreground tabular-nums sm:text-sm">
					{quizProgress.answeredCount} of {quizProgress.totalQuestions} answered
				</span>
				<div className="col-start-2 flex items-center justify-center gap-1 sm:gap-2">
					<Button
						variant="ghost"
						size="icon-lg"
						aria-label="Previous question"
						title="Previous question (Left arrow)"
						disabled={currentIndex === 0}
						onClick={() => goTo(currentIndex - 1)}
					>
						<ChevronLeft />
					</Button>
					<span className="text-sm text-muted-foreground tabular-nums">
						{currentIndex + 1} / {studyQuestions.length}
					</span>
					<Button
						variant="ghost"
						size="icon-lg"
						aria-label="Next question"
						title="Next question (Right arrow)"
						disabled={currentIndex >= studyQuestions.length - 1}
						onClick={() => goTo(currentIndex + 1)}
					>
						<ChevronRight />
					</Button>
				</div>
			</div>
		</div>
	);
}

function QuizRichText({ content, compact }: { content: TiptapDocumentJson; compact?: boolean }) {
	const editor = useEditor(
		{
			content: content as unknown as JSONContent,
			editable: false,
			immediatelyRender: false,
			extensions: getTiptapDocumentBaseExtensions(),
			editorProps: {
				attributes: {
					class: cn("workspace-document-prose outline-none", compact && "text-sm"),
				},
			},
		},
		[content],
	);

	return <EditorContent editor={editor} className="min-w-0 flex-1" />;
}

function QuizViewerSkeleton() {
	return (
		<div className="mx-auto flex w-full max-w-2xl flex-col gap-4 p-4 sm:p-6">
			<Skeleton className="h-5 w-40" />
			<Skeleton className="h-28 w-full rounded-2xl" />
			<Skeleton className="h-14 w-full rounded-xl" />
			<Skeleton className="h-14 w-full rounded-xl" />
			<Skeleton className="h-14 w-full rounded-xl" />
			<Skeleton className="h-14 w-full rounded-xl" />
		</div>
	);
}
