/**
 * Quiz Tools
 * Tools for creating and updating quizzes in workspaces.
 * Like flashcards, the AI generates quiz content directly in the tool call.
 */

import { z } from "zod";
import { tool, zodSchema } from "ai";
import { logger } from "@/lib/utils/logger";
import { workspaceWorker } from "@/lib/ai/workers";
import type { WorkspaceToolContext } from "./workspace-tools";
import type { QuizData, QuizQuestion } from "@/lib/workspace-state/types";
import { loadStateForTool, resolveItem, getAvailableItemsList } from "./tool-utils";
import { generateItemId } from "@/lib/workspace-state/item-helpers";

const QuizQuestionSchema = z.object({
    type: z.enum(["multiple_choice", "true_false"]),
    questionText: z.string(),
    options: z.array(z.string()).describe("4 options for multiple_choice, ['True','False'] for true_false"),
    correctIndex: z.number().describe("0-based index of correct answer in options array"),
    hint: z.string().optional(),
    explanation: z.string(),
});

/**
 * Create the createQuiz tool - AI generates questions directly (like createFlashcards)
 */
export function createQuizTool(ctx: WorkspaceToolContext) {
    return tool({
        description: "Create an interactive quiz.",
        inputSchema: zodSchema(
            z.object({
                title: z.string().nullable().describe("Short descriptive title for the quiz (defaults to 'Quiz' if not provided)"),
                questions: z.array(QuizQuestionSchema).min(1).max(50).describe("Array of quiz questions. For multiple_choice: 4 options, 1 correct. For true_false: options ['True','False'], correctIndex 0=True 1=False."),
            })
        ),
        execute: async (input: { title?: string | null; questions: Array<{ type: "multiple_choice" | "true_false"; questionText: string; options: string[]; correctIndex: number; hint?: string; explanation: string }> }) => {
            const title = input.title || "Quiz";
            const rawQuestions = input.questions || [];

            if (rawQuestions.length === 0) {
                return {
                    success: false,
                    message: "At least one quiz question is required.",
                };
            }

            if (!ctx.workspaceId) {
                return {
                    success: false,
                    message: "No workspace context available",
                };
            }

            try {
                const questions: QuizQuestion[] = rawQuestions.map((q) => ({
                    id: generateItemId(),
                    type: q.type,
                    questionText: q.questionText,
                    options: q.options || [],
                    correctIndex: q.correctIndex ?? 0,
                    hint: q.hint,
                    explanation: q.explanation || "No explanation provided.",
                }));

                logger.debug("🎯 [CREATE-QUIZ] Creating quiz:", { title, questionCount: questions.length });

                const workerResult = await workspaceWorker("create", {
                    workspaceId: ctx.workspaceId,
                    title,
                    itemType: "quiz",
                    quizData: {
                        questions,
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
                    title,
                    questionCount: questions.length,
                    message: `Created quiz "${title}" with ${questions.length} questions.`,
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
 * Create the updateQuiz tool - AI generates new questions directly (like addFlashcards)
 */
export function createUpdateQuizTool(ctx: WorkspaceToolContext) {
    return tool({
        description: "Add more questions to an existing quiz and/or update its title. Generate the new questions yourself based on the user's request, quiz topic, or selected cards. Use readWorkspace to get content from selected cards.",
        inputSchema: zodSchema(
            z.object({
                quizName: z.string().describe("The name of the quiz to update (will be matched using fuzzy search)"),
                title: z.string().optional().describe("New title for the quiz. If not provided, the existing title will be preserved."),
                questions: z.array(QuizQuestionSchema).min(1).max(50).optional().describe("Array of new quiz questions to add. Same format as createQuiz. Generate questions that don't duplicate existing ones."),
            })
        ),
        execute: async (input: { quizName: string; title?: string; questions?: Array<{ type: "multiple_choice" | "true_false"; questionText: string; options: string[]; correctIndex: number; hint?: string; explanation: string }> }) => {
            const { quizName, title, questions: rawQuestions } = input;

            if (!ctx.workspaceId) {
                return {
                    success: false,
                    message: "No workspace context available",
                };
            }

            if (!quizName) {
                return {
                    success: false,
                    message: "Quiz name is required to identify which quiz to update.",
                };
            }

            if (!rawQuestions?.length && !title) {
                return {
                    success: false,
                    message: "Either new questions or a new title must be provided.",
                };
            }

            try {
                const accessResult = await loadStateForTool(ctx);
                if (!accessResult.success) {
                    return accessResult;
                }

                const { state } = accessResult;
                const quizItem = resolveItem(state.items, quizName, "quiz");

                if (!quizItem) {
                    const availableQuizzes = getAvailableItemsList(state.items, "quiz");
                    return {
                        success: false,
                        message: `Could not find quiz "${quizName}". ${availableQuizzes ? `Available quizzes: ${availableQuizzes}` : "No quizzes found in workspace."}`,
                    };
                }

                const quizId = quizItem.id;
                const currentQuizData = quizItem.data as QuizData;
                const existingQuestions = currentQuizData.questions || [];

                let questionsToAdd: QuizQuestion[] = [];
                if (rawQuestions && rawQuestions.length > 0) {
                    questionsToAdd = rawQuestions.map((q) => ({
                        id: generateItemId(),
                        type: q.type,
                        questionText: q.questionText,
                        options: q.options || [],
                        correctIndex: q.correctIndex ?? 0,
                        hint: q.hint,
                        explanation: q.explanation || "No explanation provided.",
                    }));
                }

                const workerResult = await workspaceWorker("updateQuiz", {
                    workspaceId: ctx.workspaceId,
                    itemId: quizId,
                    itemType: "quiz",
                    title,
                    questionsToAdd: questionsToAdd.length > 0 ? questionsToAdd : undefined,
                });

                if (!workerResult.success) {
                    return workerResult;
                }

                const totalQuestions = existingQuestions.length + questionsToAdd.length;
                let message = "Quiz updated successfully.";
                if (title && questionsToAdd.length > 0) {
                    message = `Updated title to "${title}" and added ${questionsToAdd.length} new questions.`;
                } else if (title) {
                    message = `Updated quiz title to "${title}".`;
                } else if (questionsToAdd.length > 0) {
                    message = `Added ${questionsToAdd.length} new question${questionsToAdd.length !== 1 ? "s" : ""} to the quiz.`;
                }

                return {
                    ...workerResult,
                    quizId,
                    questionsAdded: questionsToAdd.length,
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
