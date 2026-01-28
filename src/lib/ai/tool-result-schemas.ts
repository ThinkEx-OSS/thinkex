import { z } from "zod";
import { parseWithSchema } from "@/components/tool-ui/shared";

/**
 * Shared schemas and parsers for tool results. Used by assistant-ui Tool UIs
 * to validate backend output at runtime. Parse errors are caught by
 * ToolUIErrorBoundary. Keeps current backend contract; no id/role/choice required.
 */

const baseWorkspace = z
  .object({
    success: z.boolean(),
    message: z.string().optional(),
    itemId: z.string().optional(),
  })
  .passthrough();

/** createNote, deleteCard, clearCardContent, updateCard */
export const WorkspaceResultSchema = baseWorkspace;
export type WorkspaceResult = z.infer<typeof WorkspaceResultSchema>;

/** Coerce string or other non-object tool results to a safe WorkspaceResult. */
function coerceToWorkspaceResult(input: unknown): WorkspaceResult {
  if (input == null) {
    return { success: false, message: "No result" };
  }
  if (typeof input === "string") {
    return { success: false, message: input };
  }
  if (typeof input !== "object" || Array.isArray(input)) {
    return { success: false, message: "Invalid result format" };
  }
  return parseWithSchema(WorkspaceResultSchema, input, "WorkspaceResult");
}

export function parseWorkspaceResult(input: unknown): WorkspaceResult {
  if (input != null && typeof input === "object" && !Array.isArray(input)) {
    return parseWithSchema(WorkspaceResultSchema, input, "WorkspaceResult");
  }
  return coerceToWorkspaceResult(input);
}

/** selectCards */
export const SelectCardsResultSchema = baseWorkspace.extend({
  message: z.string(),
  addedCount: z.number().optional(),
  invalidIds: z.array(z.string()).optional(),
}).passthrough();

export type SelectCardsResult = z.infer<typeof SelectCardsResultSchema>;

export function parseSelectCardsResult(input: unknown): SelectCardsResult {
  return parseWithSchema(SelectCardsResultSchema, input, "SelectCardsResult");
}

/** createQuiz, updateQuiz */
export const QuizResultSchema = baseWorkspace.extend({
  quizId: z.string().optional(),
  title: z.string().optional(),
  questionCount: z.number().optional(),
  questionsAdded: z.number().optional(),
  totalQuestions: z.number().optional(),
  difficulty: z.enum(["easy", "medium", "hard"]).optional(),
  isContextBased: z.boolean().optional(),
}).passthrough();

export type QuizResult = z.infer<typeof QuizResultSchema>;

/** Coerce string or other non-object tool results to a safe QuizResult. */
function coerceToQuizResult(input: unknown): QuizResult {
  if (input == null) {
    return { success: false, message: "No result" };
  }
  if (typeof input === "string") {
    return { success: false, message: input };
  }
  if (typeof input !== "object" || Array.isArray(input)) {
    return { success: false, message: "Invalid result format" };
  }
  return parseWithSchema(QuizResultSchema, input, "QuizResult");
}

export function parseQuizResult(input: unknown): QuizResult {
  if (input != null && typeof input === "object" && !Array.isArray(input)) {
    return parseWithSchema(QuizResultSchema, input, "QuizResult");
  }
  return coerceToQuizResult(input);
}

/** createFlashcards, updateFlashcards */
export const FlashcardResultSchema = baseWorkspace.extend({
  title: z.string().optional(),
  cardCount: z.number().optional(),
  cardsAdded: z.number().optional(),
  deckName: z.string().optional(),
  cards: z.array(z.object({ front: z.string(), back: z.string() })).optional(),
}).passthrough();

export type FlashcardResult = z.infer<typeof FlashcardResultSchema>;

/** Coerce string or other non-object tool results to a safe FlashcardResult. */
function coerceToFlashcardResult(input: unknown): FlashcardResult {
  if (input == null) {
    return { success: false, message: "No result" };
  }
  if (typeof input === "string") {
    return { success: false, message: input };
  }
  if (typeof input !== "object" || Array.isArray(input)) {
    return { success: false, message: "Invalid result format" };
  }
  return parseWithSchema(FlashcardResultSchema, input, "FlashcardResult");
}

export function parseFlashcardResult(input: unknown): FlashcardResult {
  if (input != null && typeof input === "object" && !Array.isArray(input)) {
    return parseWithSchema(FlashcardResultSchema, input, "FlashcardResult");
  }
  return coerceToFlashcardResult(input);
}

/** deepResearch */
export const DeepResearchResultSchema = z
  .object({
    interactionId: z.string().optional(),
    noteId: z.string().optional(),
    message: z.string().optional(),
    error: z.string().optional(),
  })
  .passthrough();

export type DeepResearchResult = z.infer<typeof DeepResearchResultSchema>;

export function parseDeepResearchResult(input: unknown): DeepResearchResult {
  return parseWithSchema(DeepResearchResultSchema, input, "DeepResearchResult");
}

/** searchWeb, executeCode, processFiles – result is markdown string */
export function parseStringResult(input: unknown): string {
  return parseWithSchema(z.string(), input, "StringResult");
}

/** processUrls – result is string or { text, metadata } */
export const URLContextResultSchema = z.union([
  z.string(),
  z
    .object({
      text: z.string().optional(),
      metadata: z.any().optional(),
    })
    .passthrough(),
]);

export type URLContextResult = z.infer<typeof URLContextResultSchema>;

export function parseURLContextResult(input: unknown): URLContextResult {
  return parseWithSchema(URLContextResultSchema, input, "URLContextResult");
}
