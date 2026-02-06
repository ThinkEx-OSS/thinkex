"use client";

import { useCallback, useState, useEffect, useMemo, useRef } from "react";
import type { Item, ItemData, QuizData, QuizQuestion, QuizSessionData } from "@/lib/workspace-state/types";
import { cn } from "@/lib/utils";
import { CheckCircle2, XCircle, Lightbulb, ChevronLeft, ChevronRight, RotateCcw, Trophy } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import "katex/dist/katex.min.css";
import { toast } from "sonner";

interface QuizContentProps {
    item: Item;
    onUpdateData: (updater: (prev: ItemData) => ItemData) => void;
    isScrollLocked?: boolean;
}

export function QuizContent({ item, onUpdateData, isScrollLocked = false }: QuizContentProps) {
    const quizData = item.data as QuizData;
    const questions = quizData.questions || [];

    // Session state
    const [currentIndex, setCurrentIndex] = useState(quizData.session?.currentIndex || 0);
    const [selectedAnswer, setSelectedAnswer] = useState<number | null>(null);
    const [isSubmitted, setIsSubmitted] = useState(false);
    const [showHint, setShowHint] = useState(false);
    const [answeredQuestions, setAnsweredQuestions] = useState<QuizSessionData["answeredQuestions"]>(
        quizData.session?.answeredQuestions || []
    );

    // Initialize showResults based on whether quiz is completed
    // Quiz is completed ONLY if: completedAt exists AND all questions are answered
    const isInitiallyCompleted = !!(
        quizData.session?.completedAt &&
        quizData.session?.answeredQuestions?.length &&
        questions.length > 0 &&
        quizData.session.answeredQuestions.length >= questions.length
    );
    const [showResults, setShowResults] = useState(isInitiallyCompleted);

    // Track previous question count and IDs to detect when new questions are added
    const prevQuestionCountRef = useRef(questions.length);
    const prevQuestionIdsRef = useRef<Set<string>>(new Set(questions.map(q => q.id)));

    const currentQuestion = questions[currentIndex];
    const totalQuestions = questions.length;

    // Sync effect: ensure showResults state matches reality of questions vs answered
    // and handle new questions being added
    useEffect(() => {
        const prevCount = prevQuestionCountRef.current;
        const currentCount = questions.length;
        const prevIds = prevQuestionIdsRef.current;

        // Detect if new questions were actually added (not just a re-render)
        const currentIds = new Set(questions.map(q => q.id));
        const questionsAdded = questions.filter(q => !prevIds.has(q.id)).length;

        // Check if we have unanswered questions
        const hasUnansweredQuestions = answeredQuestions.length < currentCount;

        if (questionsAdded > 0 && currentCount > prevCount) {
            // New questions were added

            if (showResults) {
                // If we were showing results, we need to hide them and let user answer new questions
                toast.success(`${questionsAdded} new question${questionsAdded > 1 ? 's' : ''} added! Continue your quiz.`);
                setShowResults(false);
                setCurrentIndex(prevCount); // Go to first new question
                setSelectedAnswer(null);
                setIsSubmitted(false);
                setShowHint(false);

                // Clear completedAt since we're no longer complete
                onUpdateData((prev) => {
                    const current = prev as QuizData;
                    return {
                        ...current,
                        session: {
                            ...current.session,
                            currentIndex: prevCount,
                            completedAt: undefined,
                        } as QuizSessionData,
                    };
                });
            } else {
                // Just notify user
                toast.success(`${questionsAdded} new question${questionsAdded > 1 ? 's' : ''} added!`);
            }
        } else if (showResults && hasUnansweredQuestions) {
            // Sanity check: if showing results but we have unanswered questions (e.g. from sync mismatch),
            // force exit results mode
            setShowResults(false);
        }

        // Update refs for next comparison
        prevQuestionCountRef.current = currentCount;
        prevQuestionIdsRef.current = currentIds;
    }, [questions, showResults, answeredQuestions.length, currentIndex, onUpdateData]);

    // Check if current question was already answered
    const previousAnswer = useMemo(() => {
        return answeredQuestions.find(a => a.questionId === currentQuestion?.id);
    }, [answeredQuestions, currentQuestion?.id]);

    // Restore state when navigating to previously answered question
    useEffect(() => {
        if (previousAnswer) {
            setSelectedAnswer(previousAnswer.userAnswer);
            setIsSubmitted(true);
        } else {
            setSelectedAnswer(null);
            setIsSubmitted(false);
        }
        setShowHint(false);
    }, [currentIndex, previousAnswer]);

    // Persist session state
    const persistSession = useCallback((updates: Partial<QuizSessionData>) => {
        onUpdateData((prev) => {
            const current = prev as QuizData;
            return {
                ...current,
                session: {
                    currentIndex,
                    answeredQuestions,
                    ...current.session,
                    ...updates,
                },
            };
        });
    }, [onUpdateData, currentIndex, answeredQuestions]);

    // Handle answer selection
    const handleSelectAnswer = (index: number) => {
        if (isSubmitted) return;
        setSelectedAnswer(index);
    };

    // Handle answer submission
    const handleSubmit = () => {
        if (selectedAnswer === null || isSubmitted) return;

        const isCorrect = selectedAnswer === currentQuestion.correctIndex;
        const newAnswer = {
            questionId: currentQuestion.id,
            userAnswer: selectedAnswer,
            isCorrect,
        };

        const newAnsweredQuestions = [
            ...answeredQuestions.filter(a => a.questionId !== currentQuestion.id),
            newAnswer,
        ];

        setAnsweredQuestions(newAnsweredQuestions);
        setIsSubmitted(true);

        // Persist to data
        persistSession({
            currentIndex,
            answeredQuestions: newAnsweredQuestions,
            startedAt: quizData.session?.startedAt || Date.now(),
        });
    };

    // Navigation
    const handleNext = () => {
        if (currentIndex < totalQuestions - 1) {
            const nextIndex = currentIndex + 1;
            setCurrentIndex(nextIndex);
            persistSession({ currentIndex: nextIndex });
        } else {
            // Show results
            setShowResults(true);
            persistSession({ completedAt: Date.now() });
        }
    };

    // Arrow navigation - only moves between questions, never shows results
    const handleArrowNext = () => {
        if (currentIndex < totalQuestions - 1) {
            const nextIndex = currentIndex + 1;
            setCurrentIndex(nextIndex);
            persistSession({ currentIndex: nextIndex });
        }
    };

    const handlePrevious = () => {
        if (currentIndex > 0) {
            const prevIndex = currentIndex - 1;
            setCurrentIndex(prevIndex);
            persistSession({ currentIndex: prevIndex });
        }
    };

    const handleRestart = () => {
        setCurrentIndex(0);
        setSelectedAnswer(null);
        setIsSubmitted(false);
        setShowHint(false);
        setAnsweredQuestions([]);
        setShowResults(false);
        onUpdateData((prev) => ({
            ...prev,
            session: undefined,
        }));
    };

    // Calculate score
    const score = useMemo(() => {
        return answeredQuestions.filter(a => a.isCorrect).length;
    }, [answeredQuestions]);

    // Prevent focus stealing from chat input
    const preventFocusSteal = (e: React.MouseEvent) => {
        e.preventDefault();
    };

    if (!currentQuestion && !showResults) {
        // Template-created items have "Update me" name and should show generating skeleton
        const isAwaitingGeneration = item.name === "Update me" && questions.length === 0;

        if (isAwaitingGeneration) {
            return (
                <div className="flex flex-col h-full">
                    {/* Question Area Skeleton */}
                    <div className={cn(
                        "flex-1 p-2",
                        "overflow-y-auto",
                        "workspace-card-readonly-editor",
                        "cursor-default"
                    )}>
                        <div className="mb-6">
                            <div className="text-sm text-white/60 prose prose-invert prose-sm max-w-none">
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
                                        <span className="flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-xs font-medium border bg-white/10 border-white/20 text-white/60">
                                            {String.fromCharCode(65 + index)}
                                        </span>
                                        <div className="text-sm text-white/40 flex-1">
                                            <div className="w-3/4 h-3 bg-white/10 rounded animate-pulse"></div>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>

                        {/* Hint Area Skeleton */}
                        <div className="mt-4 flex items-center justify-between">
                            <div className="flex-1 mx-4">
                                <div className="w-full h-1.5 bg-white/10 rounded-full overflow-hidden">
                                    <div className="h-full bg-blue-400 rounded-full animate-pulse" style={{ width: '30%' }} />
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Footer Skeleton */}
                    <div className="flex-shrink-0">
                        <div className="flex items-center w-full px-2">
                            {/* Left: Restart Button Skeleton */}
                            <div className="flex-1 flex items-center justify-start">
                                <div className="flex items-center justify-center w-8 h-8 rounded-lg text-sm text-white/20">
                                    <RotateCcw className="w-4 h-4 rotate-180" />
                                </div>
                            </div>

                            {/* Center: Navigation Skeleton */}
                            <div className="flex items-center gap-1 justify-center">
                                <div className="flex items-center justify-center w-8 h-8 rounded-lg text-sm text-white/20">
                                    <ChevronLeft className="w-4 h-4" />
                                </div>
                                <span className="text-xs text-white/40 px-2">
                                    <div className="w-8 h-3 bg-white/10 rounded animate-pulse"></div>
                                </span>
                                <div className="flex items-center justify-center w-8 h-8 rounded-lg text-sm text-white/20">
                                    <ChevronRight className="w-4 h-4" />
                                </div>
                            </div>

                            {/* Right: Check Button Skeleton */}
                            <div className="flex-1 flex items-center justify-end">
                                <div className="px-4 py-2 rounded-lg text-sm font-medium bg-white/10 text-white/40">
                                    <div className="w-8 h-3 bg-white/10 rounded animate-pulse"></div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            );
        }

        // User-created quiz with no questions - show empty state
        return (
            <div className="flex flex-col h-full items-center justify-center p-4 text-center">
                <p className="text-white/60 text-sm">No questions yet</p>
                <p className="text-white/40 text-xs mt-1">Ask the AI to generate quiz questions</p>
            </div>
        );
    }

    // Results view
    if (showResults) {
        const percentage = totalQuestions > 0 ? Math.round((score / totalQuestions) * 100) : 0;
        return (
            <div className="flex flex-col items-center justify-center h-full p-6 text-center">
                <Trophy className={cn(
                    "w-16 h-16 mb-4",
                    percentage >= 80 ? "text-yellow-400" : percentage >= 50 ? "text-blue-400" : "text-white/50"
                )} />
                <h2 className="text-2xl font-bold text-white mb-2">Quiz Complete!</h2>
                <p className="text-4xl font-bold text-white mb-1">
                    {score} / {totalQuestions}
                </p>
                <p className="text-lg text-white/60 mb-6">{percentage}% correct</p>
                <button
                    onMouseDown={preventFocusSteal}
                    onClick={handleRestart}
                    className="flex items-center gap-2 px-4 py-2 bg-white/10 hover:bg-white/20 rounded-lg text-white transition-colors cursor-pointer"
                >
                    <RotateCcw className="w-4 h-4" />
                    Restart Quiz
                </button>
            </div>
        );
    }

    return (
        <div className="flex flex-col h-full">
            {/* Question */}
            <div className={cn(
                "flex-1 p-2",
                "overflow-y-auto",
                "workspace-card-readonly-editor",
                "cursor-default"
            )}>
                <div className="mb-6">
                    <div className="text-sm text-white prose prose-invert prose-sm max-w-none">
                        <ReactMarkdown remarkPlugins={[remarkMath]} rehypePlugins={[rehypeKatex]}>
                            {currentQuestion.questionText}
                        </ReactMarkdown>
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
                                onClick={() => handleSelectAnswer(index)}
                                disabled={isSubmitted}
                                className={cn(
                                    "w-full p-3 text-left rounded-lg border transition-all duration-200 cursor-pointer",
                                    !isSubmitted && !isSelected && "bg-white/5 border-white/10 hover:bg-white/10 hover:border-white/20",
                                    !isSubmitted && isSelected && "bg-blue-500/20 border-blue-400/50",
                                    showCorrectness && isCorrect && "bg-green-500/20 border-green-400/50",
                                    showCorrectness && isSelected && !isCorrect && "bg-red-500/20 border-red-400/50",
                                    showCorrectness && !isSelected && !isCorrect && "bg-white/5 border-white/10 opacity-50",
                                    isSubmitted && "cursor-default"
                                )}
                            >
                                <div className="flex items-center gap-3">
                                    <span className={cn(
                                        "flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-xs font-medium border",
                                        showCorrectness && isCorrect ? "bg-green-500/30 border-green-400/50 text-green-300" :
                                            showCorrectness && isSelected && !isCorrect ? "bg-red-500/30 border-red-400/50 text-red-300" :
                                                isSelected ? "bg-blue-500/30 border-blue-400/50 text-blue-300" :
                                                    "bg-white/10 border-white/20 text-white/60"
                                    )}>
                                        {String.fromCharCode(65 + index)}
                                    </span>
                                    <div className="text-sm text-white/90 flex-1 prose prose-invert prose-sm max-w-none">
                                        <ReactMarkdown remarkPlugins={[remarkMath]} rehypePlugins={[rehypeKatex]}>
                                            {option}
                                        </ReactMarkdown>
                                    </div>
                                    {showCorrectness && isCorrect && <CheckCircle2 className="w-5 h-5 text-green-400" />}
                                    {showCorrectness && isSelected && !isCorrect && <XCircle className="w-5 h-5 text-red-400" />}
                                </div>
                            </button>
                        );
                    })}
                </div>

                {/* Hint */}
                {showHint && currentQuestion.hint && (
                    <div className="mt-4 mb-2 p-3 bg-yellow-500/10 border border-yellow-500/20 rounded-lg text-sm text-yellow-200/90">
                        {currentQuestion.hint}
                    </div>
                )}
                <div className="mt-4 flex items-center justify-between">
                    {/* Left: Hint */}
                    <div>
                        {currentQuestion.hint && !isSubmitted && (
                            <button
                                onMouseDown={preventFocusSteal}
                                onClick={() => setShowHint(!showHint)}
                                className="flex items-center gap-2 text-sm text-yellow-400/80 hover:text-yellow-400 transition-colors cursor-pointer"
                            >
                                <Lightbulb className="w-4 h-4" />
                                {showHint ? "Hide hint" : "Hint"}
                            </button>
                        )}
                    </div>

                    {/* Center: Progress bar */}
                    <div className="flex-1 mx-4">
                        <div className="w-full h-1.5 bg-white/10 rounded-full overflow-hidden">
                            <div
                                className="h-full bg-white transition-all duration-300"
                                style={{ width: `${((currentIndex + (isSubmitted ? 1 : 0)) / totalQuestions) * 100}%` }}
                            />
                        </div>
                    </div>
                </div>

                {/* Explanation */}
                {isSubmitted && (
                    <div className={cn(
                        "mt-4 p-4 rounded-lg border",
                        selectedAnswer === currentQuestion.correctIndex
                            ? "bg-green-500/10 border-green-500/20"
                            : "bg-red-500/10 border-red-500/20"
                    )}>
                        <div className="flex items-center gap-2 mb-2">
                            {selectedAnswer === currentQuestion.correctIndex ? (
                                <>
                                    <CheckCircle2 className="w-5 h-5 text-green-400" />
                                    <span className="font-medium text-green-400">Correct!</span>
                                </>
                            ) : (
                                <>
                                    <XCircle className="w-5 h-5 text-red-400" />
                                    <span className="font-medium text-red-400">Incorrect</span>
                                </>
                            )}
                        </div>
                        <div className="text-sm text-white/80 prose prose-invert prose-sm max-w-none">
                            <ReactMarkdown remarkPlugins={[remarkMath]} rehypePlugins={[rehypeKatex]}>
                                {currentQuestion.explanation}
                            </ReactMarkdown>
                        </div>
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
                            onClick={handleRestart}
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm text-white/40 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
                        >
                            <RotateCcw className="w-4 h-4 rotate-180" />
                            <span>Restart</span>
                        </button>
                    </div>

                    {/* Center: Navigation arrows with progress dots */}
                    <div className="flex items-center gap-1 justify-center">
                        <button
                            onMouseDown={preventFocusSteal}
                            onClick={handlePrevious}
                            disabled={currentIndex === 0}
                            className={cn(
                                "flex items-center justify-center w-8 h-8 rounded-lg text-sm transition-colors cursor-pointer",
                                currentIndex === 0
                                    ? "text-white/30 cursor-not-allowed"
                                    : "text-white/70 hover:text-white hover:bg-white/10"
                            )}
                        >
                            <ChevronLeft className="w-4 h-4" />
                        </button>
                        <span className="text-xs text-white/50 px-1">
                            {currentIndex + 1} / {totalQuestions}
                        </span>
                        <button
                            onMouseDown={preventFocusSteal}
                            onClick={handleArrowNext}
                            disabled={currentIndex >= totalQuestions - 1}
                            className={cn(
                                "flex items-center justify-center w-8 h-8 rounded-lg text-sm transition-colors cursor-pointer",
                                currentIndex >= totalQuestions - 1
                                    ? "text-white/30 cursor-not-allowed"
                                    : "text-white/70 hover:text-white hover:bg-white/10"
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
                                onClick={handleSubmit}
                                disabled={selectedAnswer === null}
                                className={cn(
                                    "px-4 py-2 rounded-lg text-sm font-medium transition-colors cursor-pointer",
                                    selectedAnswer === null
                                        ? "bg-white/10 text-white/30 cursor-not-allowed"
                                        : "bg-blue-500 hover:bg-blue-600 text-white"
                                )}
                            >
                                Check
                            </button>
                        ) : (
                            <button
                                onMouseDown={preventFocusSteal}
                                onClick={handleNext}
                                className="px-4 py-2 rounded-lg text-sm font-medium transition-colors cursor-pointer bg-blue-500 hover:bg-blue-600 text-white"
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
