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
import { loadStateForTool, resolveItem, withSanitizedModelOutput } from "./tool-utils";
import { getVirtualPath } from "@/lib/utils/workspace-fs";
import { normalizeWorkspaceItems } from "@/lib/workspace-state/state";
import { quizQuestionInputSchema } from "@/lib/workspace-state/item-data-schemas";
import { materializeQuizQuestion } from "@/lib/workspace-state/quiz-shuffle";

const CreateQuizInputSchema = z.object({
  title: z
    .string()
    .nullish()
    .describe(
      "Short descriptive title for the quiz (defaults to 'Quiz' if not provided)",
    ),
  questions: z
    .array(quizQuestionInputSchema)
    .min(1)
    .max(50)
    .describe(
      "Array of quiz questions. For each question: provide `rationale` (your reasoning — not shown to users), `question` (the stem), `correctAnswer` (the right answer as text), `distractors` (3 wrong options with `whyWrong` rationales for multiple choice, or 1 wrong option for true/false — e.g. correctAnswer: 'True' with distractors: [{text: 'False', whyWrong: '...'}]), and `explanation` (user-facing explanation shown after they answer).",
    ),
});
export type CreateQuizInput = z.infer<typeof CreateQuizInputSchema>;

/**
 * Create the quiz_create tool - AI generates questions directly (like flashcards_create)
 */
export function createQuizTool(ctx: WorkspaceToolContext) {
  return withSanitizedModelOutput(
    tool({
      description: "Create an interactive quiz with per-question explanations.",
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
          const questions: QuizQuestion[] = rawQuestions.map((q) =>
            materializeQuizQuestion(q),
          );

          logger.debug("🎯 [CREATE-QUIZ] Creating quiz:", {
            title,
            questionCount: questions.length,
          });

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
    }),
  );
}

const AddQuizQuestionsInputSchema = z.object({
  itemName: z.string().describe("Name of the existing quiz to add questions to (matched by fuzzy search)"),
  questions: z.array(quizQuestionInputSchema).min(1).max(50).describe(
    "New questions to append. Same format as quiz_create: provide rationale, question, correctAnswer, distractors (3 for MC, 1 for T/F), and explanation for each."
  ),
});
export type AddQuizQuestionsInput = z.infer<typeof AddQuizQuestionsInputSchema>;

export function createQuizAddQuestionsTool(ctx: WorkspaceToolContext) {
  return withSanitizedModelOutput(
    tool({
      description:
        "Add questions to an existing quiz. Use this instead of item_edit when you need to append new questions to a quiz. " +
        "Uses the same question format as quiz_create. Does NOT require workspace_read first.",
      inputSchema: zodSchema(AddQuizQuestionsInputSchema),
      strict: true,
      execute: async (input: AddQuizQuestionsInput) => {
        if (!input.questions || input.questions.length === 0) {
          return { success: false, message: "At least one question is required." };
        }
        if (!ctx.workspaceId) {
          return { success: false, message: "No workspace context available" };
        }

        const accessResult = await loadStateForTool(ctx);
        if (!accessResult.success) {
          return accessResult;
        }
        const state = normalizeWorkspaceItems(accessResult.state);
        const matchedItem = resolveItem(state, input.itemName);
        if (!matchedItem) {
          const sample = state.filter((i) => i.type !== "folder").slice(0, 5).map((i) => `"${i.name}" (${i.type})`).join(", ");
          return { success: false, message: `Could not find item "${input.itemName}". ${sample ? `Example items: ${sample}` : "Workspace may be empty."}` };
        }
        if (matchedItem.type !== "quiz") {
          return { success: false, message: `Item "${matchedItem.name}" is not a quiz (type: ${matchedItem.type}).` };
        }

        const contentItems = state.filter((i) => i.type !== "folder");
        const sameNameCandidates = contentItems.filter(
          (i) => i.name.toLowerCase().trim() === matchedItem.name.toLowerCase().trim()
        );
        if (sameNameCandidates.length > 1) {
          const paths = sameNameCandidates.map((c) => getVirtualPath(c, state)).join(", ");
          return { success: false, message: `Multiple items named "${matchedItem.name}". Disambiguate using path: ${paths}` };
        }

        const materializedQuestions: QuizQuestion[] = input.questions.map((q) => materializeQuizQuestion(q));

        try {
          const result = await workspaceWorker("add_questions", {
            workspaceId: ctx.workspaceId,
            itemId: matchedItem.id,
            questions: materializedQuestions,
          });

          return {
            success: true,
            itemId: matchedItem.id,
            questionsAdded: materializedQuestions.length,
            totalQuestions: result.totalQuestions,
            message: result.message,
          };
        } catch (error) {
          return {
            success: false,
            message: `Error adding questions: ${error instanceof Error ? error.message : String(error)}`,
          };
        }
      },
    })
  );
}
