import { z } from "zod";
import { parseWithSchema } from "@/components/tool-ui/shared";
import { ProcessUrlsOutputSchema } from "@/lib/ai/process-urls-shared";
import { WebMapOutputSchema } from "@/lib/ai/web-map-shared";
import {
  WebSearchResultSchema,
  normalizeWebSearchResult,
} from "@/lib/ai/web-search-shared";
import { flashcardCardInputSchema } from "@/lib/workspace-state/item-data-schemas";

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

/** document_create, item_edit */
export const WorkspaceResultSchema = baseWorkspace;
export type WorkspaceResult = z.infer<typeof WorkspaceResultSchema>;

function createCoerceFunction<T extends { success: boolean; message?: string }>(
  schema: z.ZodType<T>,
  schemaName: string,
) {
  return (input: unknown): T => {
    if (input == null) {
      return { success: false, message: "No result" } as T;
    }
    if (typeof input === "string") {
      return { success: false, message: input } as T;
    }
    if (typeof input !== "object" || Array.isArray(input)) {
      return { success: false, message: "Invalid result format" } as T;
    }
    return parseWithSchema(schema, input, schemaName);
  };
}

/** Coerce string or other non-object tool results to a safe WorkspaceResult. */
const coerceToWorkspaceResult = createCoerceFunction<WorkspaceResult>(
  WorkspaceResultSchema,
  "WorkspaceResult",
);

export function parseWorkspaceResult(input: unknown): WorkspaceResult {
  if (input == null) {
    return coerceToWorkspaceResult(input);
  }
  if (input != null && typeof input === "object" && !Array.isArray(input)) {
    return parseWithSchema(WorkspaceResultSchema, input, "WorkspaceResult");
  }
  return coerceToWorkspaceResult(input);
}

/** quiz_create */
export const QuizResultSchema = baseWorkspace.extend({
  quizId: z.string().optional(),
  title: z.string().optional(),
  questionCount: z.number().optional(),
  questionsAdded: z.number().optional(),
  totalQuestions: z.number().optional(),
}).passthrough();

export type QuizResult = z.infer<typeof QuizResultSchema>;

/** Coerce string or other non-object tool results to a safe QuizResult. */
const coerceToQuizResult = createCoerceFunction<QuizResult>(
  QuizResultSchema,
  "QuizResult",
);

export function parseQuizResult(input: unknown): QuizResult {
  if (input != null && typeof input === "object" && !Array.isArray(input)) {
    return parseWithSchema(QuizResultSchema, input, "QuizResult");
  }
  return coerceToQuizResult(input);
}

/** flashcards_create */
export const FlashcardResultSchema = baseWorkspace.extend({
  title: z.string().optional(),
  cardCount: z.number().optional(),
  deckName: z.string().optional(),
  cards: z.array(flashcardCardInputSchema).optional(),
}).passthrough();

export type FlashcardResult = z.infer<typeof FlashcardResultSchema>;

/** Coerce string or other non-object tool results to a safe FlashcardResult. */
const coerceToFlashcardResult = createCoerceFunction<FlashcardResult>(
  FlashcardResultSchema,
  "FlashcardResult",
);

export function parseFlashcardResult(input: unknown): FlashcardResult {
  if (input != null && typeof input === "object" && !Array.isArray(input)) {
    return parseWithSchema(FlashcardResultSchema, input, "FlashcardResult");
  }
  return coerceToFlashcardResult(input);
}

/** quiz_add_questions */
export const QuizAddQuestionsResultSchema = baseWorkspace.extend({
  questionsAdded: z.number().optional(),
  totalQuestions: z.number().optional(),
}).passthrough();
export type QuizAddQuestionsResult = z.infer<typeof QuizAddQuestionsResultSchema>;

const coerceToQuizAddQuestionsResult = createCoerceFunction<QuizAddQuestionsResult>(
  QuizAddQuestionsResultSchema,
  "QuizAddQuestionsResult",
);
export function parseQuizAddQuestionsResult(input: unknown): QuizAddQuestionsResult {
  if (input != null && typeof input === "object" && !Array.isArray(input)) {
    return parseWithSchema(QuizAddQuestionsResultSchema, input, "QuizAddQuestionsResult");
  }
  return coerceToQuizAddQuestionsResult(input);
}

/** flashcard_add_cards */
export const FlashcardAddCardsResultSchema = baseWorkspace.extend({
  cardsAdded: z.number().optional(),
  totalCards: z.number().optional(),
}).passthrough();
export type FlashcardAddCardsResult = z.infer<typeof FlashcardAddCardsResultSchema>;

const coerceToFlashcardAddCardsResult = createCoerceFunction<FlashcardAddCardsResult>(
  FlashcardAddCardsResultSchema,
  "FlashcardAddCardsResult",
);
export function parseFlashcardAddCardsResult(input: unknown): FlashcardAddCardsResult {
  if (input != null && typeof input === "object" && !Array.isArray(input)) {
    return parseWithSchema(FlashcardAddCardsResultSchema, input, "FlashcardAddCardsResult");
  }
  return coerceToFlashcardAddCardsResult(input);
}

/** web_fetch – result is string or { text, metadata } */
export const URLContextResultSchema = z.union([z.string(), ProcessUrlsOutputSchema]);

export type URLContextResult = z.infer<typeof URLContextResultSchema>;

export function parseURLContextResult(input: unknown): URLContextResult {
  if (typeof input === "string") {
    return input;
  }

  if (input == null) {
    return "";
  }

  if (typeof input !== "object") {
    return String(input);
  }

  if (Array.isArray(input)) {
    return JSON.stringify(input);
  }

  const res = ProcessUrlsOutputSchema.safeParse(input);
  if (res.success) {
    return res.data;
  }

  const obj = input as Record<string, unknown>;
  if (typeof obj.text === "string") {
    return obj.text;
  }

  if (typeof obj.message === "string") {
    return obj.message;
  }

  return JSON.stringify(input);
}

export function parseWebSearchResult(input: unknown): z.infer<typeof WebSearchResultSchema> {
  const normalized = normalizeWebSearchResult(input);
  if (normalized) {
    return normalized;
  }

  return parseWithSchema(WebSearchResultSchema, input, "WebSearchResult");
}

/** web_map – result is string or { text, links, metadata } */
export const WebMapResultSchema = z.union([z.string(), WebMapOutputSchema]);

export type WebMapResult = z.infer<typeof WebMapResultSchema>;

export function parseWebMapResult(input: unknown): WebMapResult {
  if (typeof input === "string") {
    return input;
  }

  if (input == null) {
    return "";
  }

  if (typeof input !== "object") {
    return String(input);
  }

  if (Array.isArray(input)) {
    return JSON.stringify(input);
  }

  const res = WebMapOutputSchema.safeParse(input);
  if (res.success) {
    return res.data;
  }

  const obj = input as Record<string, unknown>;
  if (typeof obj.text === "string") {
    return obj.text;
  }

  if (typeof obj.message === "string") {
    return obj.message;
  }

  return JSON.stringify(input);
}
