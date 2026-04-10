import { z } from "zod";
import { parseWithSchema } from "@/components/tool-ui/shared";
import { ProcessUrlsOutputSchema } from "@/lib/ai/process-urls-shared";
import {
  WebSearchResultSchema,
  normalizeWebSearchResult,
} from "@/lib/ai/web-search-shared";
import {
  CodeExecuteResultSchema,
  normalizeCodeExecuteResult,
} from "@/lib/ai/code-execute-shared";
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

/** item_edit - extends WorkspaceResult with diff, filediff, cardCount, questionCount */
export const EditItemResultSchema = baseWorkspace
  .extend({
    diff: z.string().optional(),
    filediff: z.object({ additions: z.number(), deletions: z.number() }).optional(),
    cardCount: z.number().optional(),
    questionCount: z.number().optional(),
  })
  .passthrough();
export type EditItemResult = z.infer<typeof EditItemResultSchema>;

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
  cardsAdded: z.number().optional(),
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

/** web_fetch – result is string or { text, metadata } */
export const URLContextResultSchema = z.union([z.string(), ProcessUrlsOutputSchema]);

export type URLContextResult = z.infer<typeof URLContextResultSchema>;

export function parseURLContextResult(input: unknown): URLContextResult {
  return parseWithSchema(URLContextResultSchema, input, "URLContextResult");
}

export type WebSearchResult = z.infer<typeof WebSearchResultSchema>;

export function parseWebSearchResult(input: unknown): WebSearchResult {
  const normalized = normalizeWebSearchResult(input);
  if (normalized) {
    return normalized;
  }

  return parseWithSchema(WebSearchResultSchema, input, "WebSearchResult");
}

export type CodeExecuteResult = z.infer<typeof CodeExecuteResultSchema>;

export function parseCodeExecuteResult(input: unknown): CodeExecuteResult {
  const normalized = normalizeCodeExecuteResult(input);
  if (normalized) {
    return normalized;
  }

  return parseWithSchema(CodeExecuteResultSchema, input, "CodeExecuteResult");
}
