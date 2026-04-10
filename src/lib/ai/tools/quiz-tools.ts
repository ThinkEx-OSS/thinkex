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
import type { QuizQuestion } from "@/lib/workspace-state/types";
import { withSanitizedModelOutput } from "./tool-utils";
import { generateItemId } from "@/lib/workspace-state/item-helpers";
import { quizQuestionInputSchema } from "@/lib/workspace-state/item-data-schemas";

const CreateQuizInputSchema = z.object({
    title: z.string().nullish().describe("Short descriptive title for the quiz (defaults to 'Quiz' if not provided)"),
    questions: z.array(quizQuestionInputSchema).min(1).max(50).describe("Array of quiz questions. For multiple_choice: 4 options, 1 correct. For true_false: options ['True','False'], correctIndex 0=True 1=False."),
});
export type CreateQuizInput = z.infer<typeof CreateQuizInputSchema>;

/**
 * Create the quiz_create tool - AI generates questions directly (like flashcards_create)
 */
export function createQuizTool(ctx: WorkspaceToolContext) {
    return withSanitizedModelOutput(tool({
        description: "Create an interactive quiz.",
        inputSchema: zodSchema(CreateQuizInputSchema),
        strict: true,
        execute: async (input: CreateQuizInput) => {
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
                    options: q.options,
                    correctIndex: q.correctIndex,
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
    }));
}

// Edit functionality is in edit-item-tool.ts (item_edit)
