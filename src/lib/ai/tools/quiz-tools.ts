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

// Edit functionality is in edit-item-tool.ts (editItem)
