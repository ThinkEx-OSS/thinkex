/**
 * Quiz Tools
 * Tools for creating and updating quizzes in workspaces
 */

import { z } from "zod";
import { tool, zodSchema } from "ai";
import { logger } from "@/lib/utils/logger";
import { quizWorker, workspaceWorker } from "@/lib/ai/workers";
import type { WorkspaceToolContext } from "./workspace-tools";
import type { QuizData } from "@/lib/workspace-state/types";
import { loadStateForTool, fuzzyMatchItem, getAvailableItemsList } from "./tool-utils";

/**
 * Create the createQuiz tool
 */
export function createQuizTool(ctx: WorkspaceToolContext) {
    return tool({
        description: "Create an interactive quiz. Extract topic from user message. Use selected cards as context if available.",
        inputSchema: zodSchema(
            z.object({
                topic: z.string().optional().describe("The topic for the quiz - extract from user's message"),
                contextContent: z.string().optional().describe("Content from selected cards in system context if available"),
                sourceCardIds: z.array(z.string()).optional().describe("IDs of source cards"),
                sourceCardNames: z.array(z.string()).optional().describe("Names of source cards"),
            })
        ),
        execute: async (input: { topic?: string; contextContent?: string; sourceCardIds?: string[]; sourceCardNames?: string[] }) => {
            const { topic, contextContent, sourceCardIds, sourceCardNames } = input;
            logger.debug("🎯 [CREATE-QUIZ] Tool execution started:", { topic, hasContext: !!contextContent });

            if (!ctx.workspaceId) {
                return {
                    success: false,
                    message: "No workspace context available",
                };
            }

            if (!topic && !contextContent) {
                return {
                    success: false,
                    message: "Either 'topic' or 'contextContent' must be provided",
                };
            }

            try {

                logger.debug("🎯 [CREATE-QUIZ] Context provided:", {
                    hasContext: !!contextContent,
                    contextLength: contextContent?.length,
                    sourceCardNames,
                    sourceCardIds,
                    providedTopic: topic,
                });

                // Generate quiz using quizWorker
                const quizResult = await quizWorker({
                    topic: topic || undefined,
                    contextContent,
                    questionCount: 5,
                    sourceCardIds,
                    sourceCardNames,
                });

                logger.debug("🎯 [CREATE-QUIZ] quizWorker returned:", {
                    title: quizResult.title,
                    questionCount: quizResult.questions?.length,
                });

                // Create quiz item in workspace
                const workerResult = await workspaceWorker("create", {
                    workspaceId: ctx.workspaceId,
                    title: quizResult.title,
                    itemType: "quiz",
                    quizData: {
                        questions: quizResult.questions,
                        sourceCardIds,
                        sourceCardNames,
                    },
                    folderId: ctx.activeFolderId,
                });

                if (!workerResult.success) {
                    return workerResult;
                }

                return {
                    success: true,
                    itemId: workerResult.itemId,
                    quizId: workerResult.itemId,
                    title: quizResult.title,
                    questionCount: quizResult.questions.length,
                    isContextBased: !!contextContent,
                    message: `Created quiz "${quizResult.title}" with ${quizResult.questions.length} questions.`,
                    event: workerResult.event,
                    version: workerResult.version,
                };
            } catch (error) {
                logger.error("❌ [CREATE-QUIZ] Error:", error);
                return {
                    success: false,
                    message: `Error creating quiz: ${error instanceof Error ? error.message : String(error)}`,
                };
            }
        },
    });
}

/**
 * Create the updateQuiz tool
 */
export function createUpdateQuizTool(ctx: WorkspaceToolContext) {
    return tool({
        description: "Update quiz title and/or add more questions. Can use new topic, selected cards, or general knowledge.",
        inputSchema: zodSchema(
            z.object({
                quizName: z.string().describe("The name of the quiz to update (will be matched using fuzzy search)"),
                title: z.string().optional().describe("New title for the quiz. If not provided, the existing title will be preserved."),
                topic: z.string().optional().describe("New topic for questions"),
                contextContent: z.string().optional().describe("Content from newly selected cards in system context"),
                sourceCardIds: z.array(z.string()).optional().describe("IDs of source cards"),
                sourceCardNames: z.array(z.string()).optional().describe("Names of source cards"),
            })
        ),
        execute: async (input: { quizName: string; title?: string; topic?: string; contextContent?: string; sourceCardIds?: string[]; sourceCardNames?: string[] }) => {
            const { quizName, title, topic: explicitTopic, contextContent, sourceCardIds, sourceCardNames } = input;

            logger.debug("🎯 [UPDATE-QUIZ] Tool execution started:", { quizName, explicitTopic, title });

            if (!ctx.workspaceId) {
                return {
                    success: false,
                    message: "No workspace context available",
                };
            }

            // Validate required quizName
            if (!quizName) {
                return {
                    success: false,
                    message: "Quiz name is required to identify which quiz to update.",
                };
            }

            try {
                // Load workspace state and fuzzy match the quiz by name
                const accessResult = await loadStateForTool(ctx);
                if (!accessResult.success) {
                    return accessResult;
                }

                const { state } = accessResult;

                // Fuzzy match the quiz by name
                const quizItem = fuzzyMatchItem(state.items, quizName, "quiz");

                if (!quizItem) {
                    const availableQuizzes = getAvailableItemsList(state.items, "quiz");
                    logger.warn("❌ [UPDATE-QUIZ] Quiz not found:", {
                        searchedName: quizName,
                        availableQuizzes,
                    });
                    return {
                        success: false,
                        message: `Could not find quiz "${quizName}". ${availableQuizzes ? `Available quizzes: ${availableQuizzes}` : 'No quizzes found in workspace.'}`,
                    };
                }

                const quizId = quizItem.id;

                logger.debug("🎯 [UPDATE-QUIZ] Found quiz via fuzzy match:", {
                    searchedName: quizName,
                    matchedName: quizItem.name,
                    matchedId: quizId,
                });

                // Title update is now handled in the main workspaceWorker("updateQuiz") call below
                if (title) {
                    logger.debug("🎯 [UPDATE-QUIZ] Will update title to:", title);
                }

                const currentQuizData = quizItem.data as QuizData;
                const existingQuestions = currentQuizData.questions || [];
                const session = currentQuizData.session;

                logger.debug("✅ [UPDATE-QUIZ] Found quiz:", {
                    id: quizItem.id,
                    name: quizItem.name,
                    questionCount: existingQuestions.length,
                    hasSession: !!session,
                    answeredCount: session?.answeredQuestions?.length,
                });

                // Build performance telemetry from answered questions
                let performanceTelemetry;
                if (session?.answeredQuestions && session.answeredQuestions.length > 0) {
                    const weakAreas = session.answeredQuestions
                        .filter(a => !a.isCorrect)
                        .map(a => {
                            const question = existingQuestions.find(q => q.id === a.questionId);
                            return question ? {
                                questionId: a.questionId,
                                questionText: question.questionText,
                                userSelectedOption: question.options?.[a.userAnswer] || "Unknown",
                                correctOption: question.options?.[question.correctIndex] || "Unknown",
                            } : null;
                        })
                        .filter((x): x is NonNullable<typeof x> => x !== null);

                    const correctCount = session.answeredQuestions.filter(a => a.isCorrect).length;
                    performanceTelemetry = {
                        correctCount,
                        incorrectCount: session.answeredQuestions.length - correctCount,
                        totalAnswered: session.answeredQuestions.length,
                        weakAreas,
                    };
                }

                // Use context/topic provided by LLM, or default to quiz name for continuation
                const topic = explicitTopic || quizItem.name;
                const isBlankQuiz = existingQuestions.length === 0;

                logger.debug("🎯 [UPDATE-QUIZ] Configuration:", {
                    topic,
                    hasContext: !!contextContent,
                    sourceCards: sourceCardNames,
                    isBlankQuiz,
                });

                // For quizzes WITH existing questions: require explicit topic/context to add more
                // For BLANK quizzes: always generate questions using the topic (even if just quiz name)
                if (!isBlankQuiz && !explicitTopic && !contextContent && !sourceCardIds) {
                    return {
                        success: true,
                        quizId,
                        message: title ? `Updated quiz title to "${title}".` : "Quiz updated successfully.",
                    };
                }

                // For blank quizzes with generic name and no topic, provide helpful error
                if (isBlankQuiz && !explicitTopic && !contextContent && !sourceCardIds && quizItem.name === "Quiz") {
                    return {
                        success: false,
                        message: "Please specify a topic for the quiz (e.g., 'make this quiz about linear algebra').",
                    };
                }

                // Generate new questions
                const quizResult = await quizWorker({
                    topic,
                    contextContent,
                    questionCount: 5,
                    existingQuestions,
                    performanceTelemetry,
                    sourceCardIds,
                    sourceCardNames
                });

                // Update the quiz with new questions and optional title rename
                const workerResult = await workspaceWorker("updateQuiz", {
                    workspaceId: ctx.workspaceId,
                    itemId: quizId,
                    itemType: "quiz",
                    title: title, // Pass title to rename
                    questionsToAdd: quizResult.questions,
                });

                if (!workerResult.success) {
                    return workerResult;
                }

                const totalQuestions = existingQuestions.length + quizResult.questions.length;
                const message = isBlankQuiz
                    ? `Populated quiz with ${quizResult.questions.length} questions about "${topic}".`
                    : `Added ${quizResult.questions.length} new questions to the quiz.`;

                return {
                    ...workerResult,
                    quizId,
                    questionsAdded: quizResult.questions.length,
                    totalQuestions,
                    message,
                };
            } catch (error) {
                logger.error("❌ [UPDATE-QUIZ] Error:", error);
                return {
                    success: false,
                    message: `Error updating quiz: ${error instanceof Error ? error.message : String(error)}`,
                };
            }
        },
    });
}
