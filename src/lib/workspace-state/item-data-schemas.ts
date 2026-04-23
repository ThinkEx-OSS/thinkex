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
  zoom: z.number().min(0.5).max(2.5).default(1),
});

export const quizQuestionSchema = z.object({
  id: z.string(),
  type: z.enum(["multiple_choice", "true_false"]).optional(),
  questionText: z.string().optional(),
  question: z.string().optional(),
  options: z.array(z.string()).default([]),
  correctIndex: z.number().int().min(0).default(0),
  explanation: z.string().optional(),
  distractorRationales: z.array(z.string()).optional(),
});

export const quizQuestionInputSchema = z
  .object({
    rationale: z
      .string()
      .min(1)
      .describe(
        "Think step-by-step first: explain what concept this question tests and why the correct answer is correct. This field gives you a reasoning channel before committing to an answer. Not shown to end users.",
      ),
    question: z
      .string()
      .min(1)
      .describe(
        "The question stem shown to the user. Must be clear, self-contained, and unambiguous.",
      ),
    correctAnswer: z
      .string()
      .min(1)
      .describe(
        "The exact text of the correct answer. Must be the single best answer — not 'all of the above' or 'none of the above'.",
      ),
    distractors: z
      .array(
        z.object({
          text: z
            .string()
            .min(1)
            .describe("The wrong-answer text shown to the user."),
          whyWrong: z
            .string()
            .min(1)
            .describe(
              "The specific misconception, common error, or confusion this distractor represents. This makes the distractor pedagogically useful rather than obviously wrong.",
            ),
        }),
      )
      .min(1)
      .max(3)
      .describe(
        "Wrong-answer options. Provide exactly 1 for true/false questions (the opposite of correctAnswer) or exactly 3 for multiple choice.",
      ),
    explanation: z
      .string()
      .min(1)
      .describe(
        "User-facing explanation shown after the user submits their answer. Explain why the correct answer is right and provide educational context.",
      ),
  })
  .refine(
    (q) => {
      return q.distractors.length === 1 || q.distractors.length === 3;
    },
    {
      message:
        "distractors must have exactly 1 item (true/false) or exactly 3 items (multiple choice)",
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
