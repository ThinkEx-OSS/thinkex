"use client";

import { useCallback, useState, useEffect, useMemo, useRef } from "react";
import type {
  Item,
  ItemData,
  QuizData,
  QuizQuestion,
} from "@/lib/workspace-state/types";
import { cn } from "@/lib/utils";
import {
  CheckCircle2,
  XCircle,
  ChevronLeft,
  ChevronRight,
  RotateCcw,
  Trophy,
  Plus,
  Lightbulb,
  MessageCircleQuestion,
  Loader2,
} from "lucide-react";
import { StreamdownMarkdown } from "@/components/ui/streamdown-markdown";
import { toast } from "sonner";
import { useOptionalComposerActions } from "@/lib/stores/composer-actions-store";
import { useUIStore } from "@/lib/stores/ui-store";
import { getQuestionText } from "@/lib/workspace-state/quiz-shuffle";
import { useCurrentWorkspaceId } from "@/contexts/WorkspaceContext";
import { useQuizProgress } from "@/hooks/use-quiz-progress";
import type { QuizProgressState } from "@/lib/workspace-state/quiz-progress-types";

interface QuizContentProps {
  item: Item;
  onUpdateData: (updater: (prev: ItemData) => ItemData) => void;
  isScrollLocked?: boolean;
  className?: string;
}

export function QuizContent({
  item,
  onUpdateData: _onUpdateData,
  isScrollLocked = false,
  className,
}: QuizContentProps) {
  const quizData = item.data as QuizData;
  const questions = quizData.questions || [];
  const promptInput = useOptionalComposerActions();

  const selectedCardIds = useUIStore((state) => state.selectedCardIds);
  const toggleCardSelection = useUIStore((state) => state.toggleCardSelection);
  const setActiveItemContext = useUIStore((state) => state.setActiveItemContext);

  const workspaceId = useCurrentWorkspaceId();
  const { progress, isLoading, updateProgress } = useQuizProgress(
    workspaceId ?? "",
    item.id,
  );

  const [currentIndex, setCurrentIndex] = useState(0);
  const [selectedAnswer, setSelectedAnswer] = useState<number | null>(null);
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [answeredQuestions, setAnsweredQuestions] = useState<
    Array<{ questionId: string; userAnswer: number; isCorrect: boolean }>
  >([]);
  const [showResults, setShowResults] = useState(false);
  const [attemptNumber, setAttemptNumber] = useState(1);
  const [startedAt, setStartedAt] = useState<string>(
    new Date().toISOString(),
  );

  const initializedRef = useRef(false);
  const initializedItemIdRef = useRef(item.id);

  useEffect(() => {
    if (initializedItemIdRef.current !== item.id) {
      initializedRef.current = false;
      initializedItemIdRef.current = item.id;
    }
  }, [item.id]);

  useEffect(() => {
    if (isLoading || initializedRef.current) return;
    initializedRef.current = true;

    if (!progress || !progress.answers || progress.answers.length === 0) return;

    const validAnswers = progress.answers.filter((a) =>
      questions.some((q) => q.id === a.questionId),
    );

    setAnsweredQuestions(
      validAnswers.map((a) => ({
        questionId: a.questionId,
        userAnswer: a.userAnswer,
        isCorrect: a.isCorrect,
      })),
    );
    setAttemptNumber(progress.attemptNumber ?? 1);
    setStartedAt(progress.startedAt ?? new Date().toISOString());

    if (progress.completedAt && validAnswers.length >= questions.length) {
      setShowResults(true);
    } else {
      const firstUnanswered = questions.findIndex(
        (q) => !validAnswers.some((a) => a.questionId === q.id),
      );
      setCurrentIndex(firstUnanswered >= 0 ? firstUnanswered : 0);
    }
  }, [isLoading, progress, questions]);

  const prevQuestionCountRef = useRef(questions.length);
  const prevQuestionIdsRef = useRef<Set<string>>(
    new Set(questions.map((q) => q.id)),
  );

  const currentQuestion = questions[currentIndex];
  const totalQuestions = questions.length;

  useEffect(() => {
    if (currentQuestion && !showResults) {
      setActiveItemContext(item.id, {
        type: 'quiz',
        questionIndex: currentIndex,
        questionId: currentQuestion.id,
      });
    } else {
      setActiveItemContext(item.id, null);
    }
  }, [item.id, currentIndex, currentQuestion, showResults, setActiveItemContext]);

  useEffect(() => {
    return () => setActiveItemContext(item.id, null);
  }, [item.id, setActiveItemContext]);

  useEffect(() => {
    const prevCount = prevQuestionCountRef.current;
    const currentCount = questions.length;
    const prevIds = prevQuestionIdsRef.current;

    const currentIds = new Set(questions.map((q) => q.id));
    const questionsAdded = questions.filter((q) => !prevIds.has(q.id)).length;

    const hasUnansweredQuestions = answeredQuestions.length < currentCount;

    if (questionsAdded > 0 && currentCount > prevCount) {
      if (showResults) {
        toast.success(
          `${questionsAdded} new question${questionsAdded > 1 ? "s" : ""} added! Continue your quiz.`,
        );
        setShowResults(false);
        setCurrentIndex(prevCount);
        setSelectedAnswer(null);
        setIsSubmitted(false);
      } else {
        toast.success(
          `${questionsAdded} new question${questionsAdded > 1 ? "s" : ""} added!`,
        );
      }
    } else if (showResults && hasUnansweredQuestions) {
      setShowResults(false);
    }

    prevQuestionCountRef.current = currentCount;
    prevQuestionIdsRef.current = currentIds;
  }, [questions, showResults, answeredQuestions.length, currentIndex]);

  const previousAnswer = useMemo(() => {
    return answeredQuestions.find((a) => a.questionId === currentQuestion?.id);
  }, [answeredQuestions, currentQuestion?.id]);

  useEffect(() => {
    if (previousAnswer) {
      setSelectedAnswer(previousAnswer.userAnswer);
      setIsSubmitted(true);
    } else {
      setSelectedAnswer(null);
      setIsSubmitted(false);
    }
  }, [currentIndex, previousAnswer]);

  const buildProgressState = useCallback(
    (
      answers: typeof answeredQuestions,
      completed: boolean,
    ): QuizProgressState => ({
      answers: answers.map((a) => ({
        ...a,
        answeredAt:
          progress?.answers?.find((pa) => pa.questionId === a.questionId)
            ?.answeredAt ?? new Date().toISOString(),
      })),
      attemptNumber,
      startedAt,
      ...(completed
        ? {
            completedAt: new Date().toISOString(),
            score: answers.filter((a) => a.isCorrect).length,
            totalQuestions: questions.length,
          }
        : {}),
    }),
    [attemptNumber, startedAt, progress?.answers, questions.length],
  );

  const handleSelectAnswer = (index: number) => {
    if (isSubmitted) return;
    setSelectedAnswer(index);
  };

  const handleSubmit = () => {
    if (selectedAnswer === null || isSubmitted) return;

    const isCorrect = selectedAnswer === currentQuestion.correctIndex;
    const newAnswer = {
      questionId: currentQuestion.id,
      userAnswer: selectedAnswer,
      isCorrect,
    };

    const newAnsweredQuestions = [
      ...answeredQuestions.filter((a) => a.questionId !== currentQuestion.id),
      newAnswer,
    ];

    setAnsweredQuestions(newAnsweredQuestions);
    setIsSubmitted(true);

    if (workspaceId) {
      updateProgress(buildProgressState(newAnsweredQuestions, false));
    }
  };

  const handleNext = () => {
    if (currentIndex < totalQuestions - 1) {
      setCurrentIndex(currentIndex + 1);
    } else {
      setShowResults(true);
      if (workspaceId) {
        updateProgress(buildProgressState(answeredQuestions, true));
      }
    }
  };

  const handleArrowNext = () => {
    if (currentIndex < totalQuestions - 1) {
      setCurrentIndex(currentIndex + 1);
    }
  };

  const handlePrevious = () => {
    if (currentIndex > 0) {
      setCurrentIndex(currentIndex - 1);
    }
  };

  const handleRestart = () => {
    const newAttempt = attemptNumber + 1;
    const newStartedAt = new Date().toISOString();
    setCurrentIndex(0);
    setSelectedAnswer(null);
    setIsSubmitted(false);
    setAnsweredQuestions([]);
    setShowResults(false);
    setAttemptNumber(newAttempt);
    setStartedAt(newStartedAt);

    if (workspaceId) {
      updateProgress({
        answers: [],
        attemptNumber: newAttempt,
        startedAt: newStartedAt,
      });
    }
  };

  const handleUpdateQuiz = () => {
    if (!selectedCardIds.has(item.id)) {
      toggleCardSelection(item.id);
    }

    const composer = promptInput;
    if (composer) {
      try {
        composer.setInput("Add 5 more questions to this quiz");
        void composer.submit();
        toast.success("Requesting more questions...");
      } catch (error) {
        toast.error("Failed to send request. Please try again.");
      }
    } else {
      toast.error("Chat not available. Please try again.");
    }
  };

  const handleAskHint = () => {
    if (!selectedCardIds.has(item.id)) {
      toggleCardSelection(item.id);
    }

    const composer = promptInput;
    if (composer) {
      try {
        composer.setInput(
          `Give me a hint for this question in "${item.name}": ${getQuestionText(currentQuestion)}`,
        );
        composer.focusInput({ cursorAtEnd: true });
      } catch (error) {
        toast.error("Failed to send request. Please try again.");
      }
    } else {
      toast.error("Chat not available. Please try again.");
    }
  };

  const handleAskExplain = () => {
    if (!selectedCardIds.has(item.id)) {
      toggleCardSelection(item.id);
    }

    const composer = promptInput;
    if (composer) {
      try {
        const userAnswer =
          selectedAnswer !== null
            ? currentQuestion.options[selectedAnswer]
            : "N/A";
        const correctAnswer =
          currentQuestion.options[currentQuestion.correctIndex];
        composer.setInput(
          `Explain this question in "${item.name}": ${getQuestionText(currentQuestion)}\n\nI answered: ${userAnswer}\nCorrect answer: ${correctAnswer}`,
        );
        composer.focusInput({ cursorAtEnd: true });
      } catch (error) {
        toast.error("Failed to send request. Please try again.");
      }
    } else {
      toast.error("Chat not available. Please try again.");
    }
  };

  const score = useMemo(() => {
    return answeredQuestions.filter((a) => a.isCorrect).length;
  }, [answeredQuestions]);

  const preventFocusSteal = (e: React.MouseEvent) => {
    e.preventDefault();
  };

  const stopPropagation = (e: React.MouseEvent) => {
    e.stopPropagation();
  };

  if (isLoading) {
    return (
      <div
        className={cn(
          "flex flex-col h-full items-center justify-center",
          className,
        )}
      >
        <Loader2 className="w-6 h-6 animate-spin text-foreground/40 dark:text-white/40" />
      </div>
    );
  }

  if (!currentQuestion && !showResults) {
    const isAwaitingGeneration =
      item.name === "Update me" && questions.length === 0;

    if (isAwaitingGeneration) {
      return (
        <div className={cn("flex flex-col h-full", className)}>
          {/* Question Area Skeleton */}
          <div
            className={cn(
              "flex-1 p-2",
              "overflow-y-auto",
              "workspace-card-readonly-editor",
              "cursor-default",
            )}
          >
            <div className="mb-6">
              <div className="text-sm text-gray-500/60 prose prose-sm max-w-none dark:text-foreground/60 dark:prose-invert">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 bg-blue-400 rounded-full animate-pulse"></div>
                  Generating quiz questions...
                </div>
              </div>
            </div>

            {/* Options Skeleton */}
            <div className="space-y-2">
              {[0, 1, 2, 3].map((index) => (
                <div
                  key={index}
                  className="w-full p-3 text-left rounded-lg border bg-white/5 border-white/10"
                >
                  <div className="flex items-center gap-3">
                    <span className="flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-xs font-medium border bg-white/10 border-white/20 text-foreground/60 dark:text-white/60">
                      {String.fromCharCode(65 + index)}
                    </span>
                    <div className="text-sm text-foreground/40 flex-1 dark:text-white/40">
                      <div className="w-3/4 h-3 bg-white/10 rounded animate-pulse"></div>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Progress Bar Skeleton */}
            <div className="mt-4 flex items-center justify-between">
              <div className="flex-1 mx-4">
                <div className="w-full h-1.5 bg-white/10 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-blue-400 rounded-full animate-pulse"
                    style={{ width: "30%" }}
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Footer Skeleton */}
          <div className="flex-shrink-0">
            <div className="flex items-center w-full px-2">
              {/* Left: Restart Button Skeleton */}
              <div className="flex-1 flex items-center justify-start">
                <div className="flex items-center justify-center w-8 h-8 rounded-lg text-sm text-foreground/20 dark:text-white/20">
                  <RotateCcw className="w-4 h-4 rotate-180" />
                </div>
              </div>

              {/* Center: Navigation Skeleton */}
              <div className="flex items-center gap-1 justify-center">
                <div className="flex items-center justify-center w-8 h-8 rounded-lg text-sm text-foreground/20 dark:text-white/20">
                  <ChevronLeft className="w-4 h-4" />
                </div>
                <span className="text-xs text-foreground/40 px-2 dark:text-white/40">
                  <div className="w-8 h-3 bg-white/10 rounded animate-pulse"></div>
                </span>
                <div className="flex items-center justify-center w-8 h-8 rounded-lg text-sm text-foreground/20 dark:text-white/20">
                  <ChevronRight className="w-4 h-4" />
                </div>
              </div>

              {/* Right: Check Button Skeleton */}
              <div className="flex-1 flex items-center justify-end">
                <div className="px-4 py-2 rounded-lg text-sm font-medium bg-white/10 text-foreground/40 dark:text-white/40">
                  <div className="w-8 h-3 bg-white/10 rounded animate-pulse"></div>
                </div>
              </div>
            </div>
          </div>
        </div>
      );
    }

    return (
      <div
        className={cn(
          "flex flex-col h-full items-center justify-center p-4 text-center",
          className,
        )}
      >
        <p className="text-foreground/60 text-sm dark:text-white/60">
          No questions yet
        </p>
        <p className="text-foreground/40 text-xs mt-1 dark:text-white/40">
          Ask the AI to generate quiz questions
        </p>
      </div>
    );
  }

  if (showResults) {
    const percentage =
      totalQuestions > 0 ? Math.round((score / totalQuestions) * 100) : 0;
    return (
      <div
        className={cn(
          "flex flex-col items-center justify-center h-full p-6 text-center",
          className,
        )}
      >
        <Trophy
          className={cn(
            "w-16 h-16 mb-4",
            percentage >= 80
              ? "text-yellow-400"
              : percentage >= 50
                ? "text-blue-400"
                : "text-white/50",
          )}
        />
        <h2 className="text-2xl font-bold text-foreground mb-2 dark:text-white">
          Quiz Complete!
        </h2>
        <p className="text-4xl font-bold text-foreground mb-1 dark:text-white">
          {score} / {totalQuestions}
        </p>
        <p className="text-lg text-foreground/60 mb-6 dark:text-white/60">
          {percentage}% correct
        </p>
        <div className="flex gap-3">
          <button
            onMouseDown={preventFocusSteal}
            onClick={(e) => {
              stopPropagation(e);
              handleRestart();
            }}
            className="flex items-center gap-2 px-4 py-2 bg-white/10 hover:bg-white/20 rounded-lg text-foreground transition-colors cursor-pointer dark:text-white"
          >
            <RotateCcw className="w-4 h-4" />
            Restart Quiz
          </button>
          <button
            onMouseDown={preventFocusSteal}
            onClick={(e) => {
              stopPropagation(e);
              handleUpdateQuiz();
            }}
            className="flex items-center gap-2 px-4 py-2 bg-blue-500 hover:bg-blue-600 rounded-lg text-white transition-colors cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            Update Quiz
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className={cn("flex flex-col h-full", className)}>
      {/* Question */}
      <div
        className={cn(
          "flex-1 p-2",
          "overflow-y-auto",
          "workspace-card-readonly-editor",
          "cursor-default",
        )}
      >
        <div className="mb-6">
          <div className="text-sm text-foreground prose prose-invert prose-sm max-w-none dark:text-white">
            <StreamdownMarkdown className="text-sm text-foreground prose prose-invert prose-sm max-w-none dark:text-white">
              {getQuestionText(currentQuestion)}
            </StreamdownMarkdown>
          </div>
        </div>

        {/* Options */}
        <div className="space-y-2">
          {currentQuestion.options.map((option, index) => {
            const isSelected = selectedAnswer === index;
            const isCorrect = index === currentQuestion.correctIndex;
            const showCorrectness = isSubmitted;

            return (
              <button
                key={index}
                onMouseDown={preventFocusSteal}
                onClick={(e) => {
                  stopPropagation(e);
                  handleSelectAnswer(index);
                }}
                disabled={isSubmitted}
                className={cn(
                  "w-full p-3 text-left rounded-lg border transition-all duration-200 cursor-pointer",
                  !isSubmitted &&
                    !isSelected &&
                    "bg-gray-100/50 border-gray-200/50 hover:bg-gray-200/50 hover:border-gray-300/50 dark:bg-white/5 dark:border-white/10 dark:hover:bg-white/10 dark:hover:border-white/20",
                  !isSubmitted &&
                    isSelected &&
                    "bg-blue-100/50 border-blue-300/50 dark:bg-blue-500/20 dark:border-blue-400/50",
                  showCorrectness &&
                    isCorrect &&
                    "bg-green-100/50 border-green-300/50 dark:bg-green-500/20 dark:border-green-400/50",
                  showCorrectness &&
                    isSelected &&
                    !isCorrect &&
                    "bg-red-100/50 border-red-300/50 dark:bg-red-500/20 dark:border-red-400/50",
                  showCorrectness &&
                    !isSelected &&
                    !isCorrect &&
                    "bg-gray-100/30 border-gray-200/30 opacity-50 dark:bg-white/5 dark:border-white/10 dark:opacity-50",
                  isSubmitted && "cursor-default",
                )}
              >
                <div className="flex items-center gap-3">
                  <span
                    className={cn(
                      "flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-xs font-medium border",
                      showCorrectness && isCorrect
                        ? "bg-green-100/50 border-green-300/50 text-green-600 dark:bg-green-500/30 dark:border-green-400/50 dark:text-green-300"
                        : showCorrectness && isSelected && !isCorrect
                          ? "bg-red-100/50 border-red-300/50 text-red-600 dark:bg-red-500/30 dark:border-red-400/50 dark:text-red-300"
                          : isSelected
                            ? "bg-blue-100/50 border-blue-300/50 text-blue-600 dark:bg-blue-500/30 dark:border-blue-400/50 dark:text-blue-300"
                            : "bg-gray-100/50 border-gray-300/50 text-gray-600 dark:bg-white/10 dark:border-white/20 dark:text-white/60",
                    )}
                  >
                    {String.fromCharCode(65 + index)}
                  </span>
                  <div className="text-sm text-gray-700/90 flex-1 prose prose-sm max-w-none dark:text-foreground/90 dark:prose-invert">
                    <StreamdownMarkdown>{option}</StreamdownMarkdown>
                  </div>
                  {showCorrectness && isCorrect && (
                    <CheckCircle2 className="w-5 h-5 text-green-600 dark:text-green-400" />
                  )}
                  {showCorrectness && isSelected && !isCorrect && (
                    <XCircle className="w-5 h-5 text-red-600 dark:text-red-400" />
                  )}
                </div>
              </button>
            );
          })}
        </div>

        <div className="mt-4 flex items-center justify-between">
          <div>
            {!isSubmitted && (
              <button
                onMouseDown={preventFocusSteal}
                onClick={(e) => {
                  stopPropagation(e);
                  handleAskHint();
                }}
                className="flex items-center gap-2 text-sm text-yellow-600/80 hover:text-yellow-600 transition-colors cursor-pointer dark:text-yellow-400/80 dark:hover:text-yellow-400"
              >
                <Lightbulb className="w-4 h-4" />
                Hint
              </button>
            )}
          </div>

          {/* Center: Progress bar */}
          <div className="flex-1 mx-4">
            <div className="w-full h-1.5 bg-gray-200/50 rounded-full overflow-hidden dark:bg-foreground/10 dark:dark:bg-white/10">
              <div
                className="h-full bg-gray-600 transition-all duration-300 dark:bg-foreground dark:dark:bg-white"
                style={{
                  width: `${((currentIndex + (isSubmitted ? 1 : 0)) / totalQuestions) * 100}%`,
                }}
              />
            </div>
          </div>
        </div>

        {/* Correct/Incorrect feedback */}
        {isSubmitted && (
          <div
            className={cn(
              "mt-4 p-4 rounded-lg border",
              selectedAnswer === currentQuestion.correctIndex
                ? "bg-green-100/50 border-green-300/50 dark:bg-green-500/10 dark:border-green-500/20"
                : "bg-red-100/50 border-red-300/50 dark:bg-red-500/10 dark:border-red-500/20",
            )}
          >
            <div className="flex items-center gap-2">
              {selectedAnswer === currentQuestion.correctIndex ? (
                <>
                  <CheckCircle2 className="w-5 h-5 text-green-600 dark:text-green-400" />
                  <span className="font-medium text-green-600 dark:text-green-400">
                    Correct!
                  </span>
                </>
              ) : (
                <>
                  <XCircle className="w-5 h-5 text-red-600 dark:text-red-400" />
                  <span className="font-medium text-red-600 dark:text-red-400">
                    Incorrect
                  </span>
                </>
              )}
            </div>
            {currentQuestion.explanation ? (
              <div className="mt-2 text-sm text-gray-700 prose prose-sm max-w-none dark:text-foreground/80 dark:prose-invert">
                <StreamdownMarkdown>
                  {currentQuestion.explanation}
                </StreamdownMarkdown>
              </div>
            ) : (
              <button
                onMouseDown={preventFocusSteal}
                onClick={(e) => {
                  stopPropagation(e);
                  handleAskExplain();
                }}
                className="mt-2 flex items-center gap-1.5 text-xs text-gray-600 hover:text-gray-800 transition-colors cursor-pointer dark:text-foreground/60 dark:hover:text-foreground/80"
              >
                <MessageCircleQuestion className="w-3.5 h-3.5" />
                Ask AI to explain
              </button>
            )}
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="flex-shrink-0">
        <div className="flex items-center w-full px-2">
          {/* Left: Restart */}
          <div className="flex-1 flex items-center justify-start">
            <button
              onMouseDown={preventFocusSteal}
              onClick={(e) => {
                stopPropagation(e);
                handleRestart();
              }}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm text-gray-500/70 hover:text-gray-700 hover:bg-gray-100/50 transition-colors cursor-pointer dark:text-foreground/40 dark:hover:text-foreground dark:hover:bg-white/10"
            >
              <RotateCcw className="w-4 h-4 rotate-180" />
              <span>Restart</span>
            </button>
          </div>

          {/* Center: Navigation arrows with progress dots */}
          <div className="flex items-center gap-1 justify-center">
            <button
              onMouseDown={preventFocusSteal}
              onClick={(e) => {
                stopPropagation(e);
                handlePrevious();
              }}
              disabled={currentIndex === 0}
              className={cn(
                "flex items-center justify-center w-8 h-8 rounded-lg text-sm transition-colors cursor-pointer",
                currentIndex === 0
                  ? "text-gray-300 cursor-not-allowed dark:text-foreground/30"
                  : "text-gray-600 hover:text-gray-700 hover:bg-gray-100/50 dark:text-foreground/70 dark:hover:text-foreground dark:hover:bg-white/10",
              )}
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span className="text-xs text-gray-500 px-1 dark:text-foreground/50">
              {currentIndex + 1} / {totalQuestions}
            </span>
            <button
              onMouseDown={preventFocusSteal}
              onClick={(e) => {
                stopPropagation(e);
                handleArrowNext();
              }}
              disabled={currentIndex >= totalQuestions - 1}
              className={cn(
                "flex items-center justify-center w-8 h-8 rounded-lg text-sm transition-colors cursor-pointer",
                currentIndex >= totalQuestions - 1
                  ? "text-gray-300 cursor-not-allowed dark:text-foreground/30"
                  : "text-gray-600 hover:text-gray-700 hover:bg-gray-100/50 dark:text-foreground/70 dark:hover:text-foreground dark:hover:bg-white/10",
              )}
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>

          {/* Right: Check/Next Button */}
          <div className="flex-1 flex items-center justify-end">
            {!isSubmitted ? (
              <button
                onMouseDown={preventFocusSteal}
                onClick={(e) => {
                  stopPropagation(e);
                  handleSubmit();
                }}
                disabled={selectedAnswer === null}
                className={cn(
                  "px-4 py-2 rounded-lg text-sm font-medium transition-colors cursor-pointer",
                  selectedAnswer === null
                    ? "bg-gray-200/50 text-gray-400 cursor-not-allowed dark:bg-white/10 dark:text-foreground/30"
                    : "bg-blue-500 hover:bg-blue-600 text-white dark:text-white",
                )}
              >
                Check
              </button>
            ) : (
              <button
                onMouseDown={preventFocusSteal}
                onClick={(e) => {
                  stopPropagation(e);
                  handleNext();
                }}
                className="px-4 py-2 rounded-lg text-sm font-medium transition-colors cursor-pointer bg-blue-500 hover:bg-blue-600 text-white dark:text-white"
              >
                {currentIndex < totalQuestions - 1 ? "Next" : "Finish"}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default QuizContent;
