import { z } from "zod";
import type {
  CardType,
  ItemData,
  QuizSessionData,
} from "@/lib/workspace-state/types";
import type { WorkspaceItemCapability } from "./workspace-item-model-types";

const ocrPageSchema = z.object({
  index: z.number().int().nonnegative().default(0),
  markdown: z.string().default(""),
  footer: z.string().nullable().optional(),
  header: z.string().nullable().optional(),
  hyperlinks: z.array(z.unknown()).optional(),
  tables: z.array(z.unknown()).optional(),
});

const sourceSchema = z.object({
  title: z.string(),
  url: z.string(),
  favicon: z.string().optional(),
});

const flashcardItemSchema = z.object({
  id: z.string(),
  front: z.string().default(""),
  back: z.string().default(""),
});

const quizQuestionSchema = z.object({
  id: z.string(),
  type: z.enum(["multiple_choice", "true_false"]),
  questionText: z.string(),
  options: z.array(z.string()).default([]),
  correctIndex: z.number().int().default(0),
  hint: z.string().optional(),
  explanation: z.string().default(""),
  sourceContext: z.string().optional(),
});

export const quizSessionSchema: z.ZodType<QuizSessionData> = z.object({
  currentIndex: z.number().int().nonnegative().default(0),
  answeredQuestions: z
    .array(
      z.object({
        questionId: z.string(),
        userAnswer: z.number().int(),
        isCorrect: z.boolean(),
      }),
    )
    .default([]),
  startedAt: z.number().optional(),
  completedAt: z.number().optional(),
});

const audioSegmentSchema = z.object({
  speaker: z.string(),
  timestamp: z.string(),
  content: z.string(),
  language: z.string().optional(),
  language_code: z.string().optional(),
  translation: z.string().optional(),
  emotion: z.enum(["happy", "sad", "angry", "neutral"]).optional(),
});

const pdfDataSchema = z.object({
  fileUrl: z.string().default(""),
  filename: z.string().default(""),
  fileSize: z.number().optional(),
  ocrStatus: z.enum(["complete", "failed", "processing"]).optional(),
  ocrError: z.string().optional(),
  ocrPages: z.array(ocrPageSchema).optional(),
});

const flashcardDataSchema = z.object({
  cards: z.array(flashcardItemSchema).default([]),
  currentIndex: z.number().int().nonnegative().optional(),
});

const folderDataSchema = z.object({}).passthrough();

const youtubeDataSchema = z.object({
  url: z.string().default(""),
  thumbnail: z.string().optional(),
  progress: z.number().nonnegative().optional(),
  playbackRate: z.number().positive().optional(),
});

const imageDataSchema = z.object({
  url: z.string().default(""),
  altText: z.string().optional(),
  caption: z.string().optional(),
  ocrStatus: z.enum(["complete", "failed", "processing"]).optional(),
  ocrError: z.string().optional(),
  ocrPages: z.array(ocrPageSchema).optional(),
});

const quizDataSchema = z.object({
  title: z.string().optional(),
  questions: z.array(quizQuestionSchema).default([]),
  session: quizSessionSchema.optional(),
});

const audioDataSchema = z.object({
  fileUrl: z.string().default(""),
  filename: z.string().default(""),
  fileSize: z.number().optional(),
  duration: z.number().optional(),
  mimeType: z.string().optional(),
  summary: z.string().optional(),
  transcript: z.string().optional(),
  segments: z.array(audioSegmentSchema).optional(),
  processingStatus: z.enum(["uploading", "processing", "complete", "failed"]),
  error: z.string().optional(),
});

const websiteDataSchema = z.object({
  url: z.string().default(""),
  favicon: z.string().optional(),
});

const documentDataSchema = z.object({
  markdown: z.string().optional(),
  sources: z.array(sourceSchema).optional(),
});

export const itemDataSchemas: Record<CardType, z.ZodType<ItemData>> = {
  pdf: pdfDataSchema as z.ZodType<ItemData>,
  flashcard: flashcardDataSchema as z.ZodType<ItemData>,
  folder: folderDataSchema as z.ZodType<ItemData>,
  youtube: youtubeDataSchema as z.ZodType<ItemData>,
  quiz: quizDataSchema as z.ZodType<ItemData>,
  image: imageDataSchema as z.ZodType<ItemData>,
  audio: audioDataSchema as z.ZodType<ItemData>,
  website: websiteDataSchema as z.ZodType<ItemData>,
  document: documentDataSchema as z.ZodType<ItemData>,
};

export const itemCapabilities: Record<CardType, WorkspaceItemCapability[]> = {
  pdf: ["asset_ref", "ocr_content"],
  flashcard: ["structured_content", "user_state"],
  folder: [],
  youtube: ["embed_ref", "user_state"],
  quiz: ["structured_content", "user_state"],
  image: ["asset_ref", "ocr_content"],
  audio: ["asset_ref", "structured_content", "transcript_content"],
  website: ["embed_ref"],
  document: ["text_content", "sources"],
};

export function emptyDataForType(type: CardType): ItemData {
  switch (type) {
    case "pdf":
      return { fileUrl: "", filename: "" };
    case "flashcard":
      return { cards: [] };
    case "folder":
      return {};
    case "youtube":
      return { url: "" };
    case "quiz":
      return { questions: [] };
    case "image":
      return { url: "" };
    case "audio":
      return { fileUrl: "", filename: "", processingStatus: "uploading" };
    case "website":
      return { url: "" };
    case "document":
      return { markdown: "" };
  }
}
