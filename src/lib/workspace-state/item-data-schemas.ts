import { z } from "zod";

export const ocrPageSchema = z.object({
  index: z.number().int().nonnegative().default(0),
  markdown: z.string().default(""),
  footer: z.string().nullable().optional(),
  header: z.string().nullable().optional(),
  hyperlinks: z.array(z.unknown()).optional(),
  tables: z.array(z.unknown()).optional(),
});

export const sourceSchema = z.object({
  title: z.string(),
  url: z.string(),
  favicon: z.string().optional(),
});

export const flashcardItemSchema = z.object({
  id: z.string(),
  front: z.string().default(""),
  back: z.string().default(""),
});

export const flashcardCardInputSchema = z.object({
  front: z.string(),
  back: z.string(),
});

export const flashcardDataSchema = z.object({
  cards: z.array(flashcardItemSchema).default([]),
});

export const quizQuestionSchema = z.object({
  id: z.string(),
  type: z.enum(["multiple_choice", "true_false"]),
  questionText: z.string(),
  options: z.array(z.string()).default([]),
  correctIndex: z.number().int().min(0).default(0),
});

export const quizQuestionInputSchema = quizQuestionSchema
  .omit({ id: true, correctIndex: true })
  .extend({
    correctIndex: z.number().int().min(0),
  })
  .refine(
    (q) => {
      const requiredCount = q.type === "true_false" ? 2 : 4;
      return (
        q.options.length === requiredCount && q.correctIndex < q.options.length
      );
    },
    {
      message:
        "multiple_choice needs 4 options; true_false needs 2; correctIndex must be < options.length",
    },
  );

export const quizDataSchema = z.object({
  title: z.string().optional(),
  questions: z.array(quizQuestionSchema).default([]),
});

export const pdfDataSchema = z.object({
  fileUrl: z.string().default(""),
  filename: z.string().default(""),
  fileSize: z.number().optional(),
  ocrStatus: z.enum(["complete", "failed", "processing"]).optional(),
  ocrError: z.string().optional(),
  ocrPages: z.array(ocrPageSchema).optional(),
});

export const imageDataSchema = z.object({
  url: z.string().default(""),
  altText: z.string().optional(),
  caption: z.string().optional(),
  ocrStatus: z.enum(["complete", "failed", "processing"]).optional(),
  ocrError: z.string().optional(),
  ocrPages: z.array(ocrPageSchema).optional(),
});

export const audioSegmentSchema = z.object({
  speaker: z.string(),
  timestamp: z.string(),
  content: z.string(),
  language: z.string().optional(),
  language_code: z.string().optional(),
  translation: z.string().optional(),
  emotion: z.enum(["happy", "sad", "angry", "neutral"]).optional(),
});

export const audioDataSchema = z.object({
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

export const youtubeDataSchema = z.object({
  url: z.string().default(""),
  thumbnail: z.string().optional(),
});

export const websiteDataSchema = z.object({
  url: z.string().default(""),
  favicon: z.string().optional(),
});

export const documentDataSchema = z.object({
  markdown: z.string().optional(),
  sources: z.array(sourceSchema).optional(),
});

export const folderDataSchema = z.object({}).passthrough();
