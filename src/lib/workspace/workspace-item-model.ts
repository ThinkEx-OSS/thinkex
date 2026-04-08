import { z } from "zod";
import { getOcrPagesTextContent } from "@/lib/utils/ocr-pages";
import type { WorkspaceEvent } from "@/lib/workspace/events";
import type {
  AudioData,
  AudioSegment,
  CardType,
  DocumentData,
  FlashcardData,
  FlashcardItem,
  ImageData,
  Item,
  ItemData,
  PdfData,
  QuizData,
  QuizQuestion,
  QuizSessionData,
  Source,
  WebsiteData,
  YouTubeData,
} from "@/lib/workspace-state/types";

export const WORKSPACE_ITEM_DATA_SCHEMA_VERSION = 2;

export type WorkspaceItemCapability =
  | "text_content"
  | "structured_content"
  | "ocr_content"
  | "transcript_content"
  | "embed_ref"
  | "asset_ref"
  | "sources"
  | "user_state";

export type WorkspaceItemUserState =
  | { type: "flashcard"; currentIndex?: number }
  | { type: "quiz"; session?: QuizSessionData }
  | { type: "youtube"; progress?: number; playbackRate?: number };

export interface WorkspaceItemContentProjection {
  textContent: string | null;
  structuredData: unknown | null;
  assetData: unknown | null;
  embedData: unknown | null;
  sourceData: unknown | null;
}

export interface WorkspaceItemExtractedProjection {
  searchText: string;
  contentPreview: string | null;
  ocrText: string | null;
  transcriptText: string | null;
  ocrPages: unknown | null;
  transcriptSegments: unknown | null;
}

export interface WorkspaceItemProjectionPayload {
  data: ItemData;
  dataSchemaVersion: number;
  contentHash: string;
  sourceCount: number;
  hasOcr: boolean;
  ocrStatus: string | null;
  ocrPageCount: number;
  hasTranscript: boolean;
  processingStatus: string | null;
  content: WorkspaceItemContentProjection;
  extracted: WorkspaceItemExtractedProjection;
  userState: WorkspaceItemUserState | null;
}

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

const quizSessionSchema = z.object({
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

const itemDataSchemas: Record<CardType, z.ZodType<ItemData>> = {
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

const itemCapabilities: Record<CardType, WorkspaceItemCapability[]> = {
  pdf: ["asset_ref", "ocr_content"],
  flashcard: ["structured_content", "user_state"],
  folder: [],
  youtube: ["embed_ref", "user_state"],
  quiz: ["structured_content", "user_state"],
  image: ["asset_ref", "ocr_content"],
  audio: ["asset_ref", "transcript_content"],
  website: ["embed_ref"],
  document: ["text_content", "sources"],
};

function emptyDataForType(type: CardType): ItemData {
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function sortJson(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sortJson);
  }
  if (!isRecord(value)) {
    return value;
  }
  return Object.keys(value)
    .sort()
    .reduce<Record<string, unknown>>((acc, key) => {
      acc[key] = sortJson(value[key]);
      return acc;
    }, {});
}

function stableStringify(value: unknown): string {
  return JSON.stringify(sortJson(value));
}

function hashString(input: string): string {
  let hash = 2166136261;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

function truncateContent(text: string, limit = 280): string | null {
  const normalized = text.replace(/\s+/g, " ").trim();
  if (!normalized) return null;
  if (normalized.length <= limit) return normalized;
  return `${normalized.slice(0, limit - 1)}…`;
}

function formatFlashcards(cards: FlashcardItem[]): string {
  return cards.map((card) => `${card.front}\n${card.back}`).join("\n\n");
}

function formatQuizQuestions(questions: QuizQuestion[]): string {
  return questions
    .map((question) =>
      [
        question.questionText,
        question.options.join("\n"),
        question.hint ?? "",
        question.explanation ?? "",
        question.sourceContext ?? "",
      ]
        .filter(Boolean)
        .join("\n"),
    )
    .join("\n\n");
}

function formatAudioTranscript(
  transcript: string | undefined,
  segments: AudioSegment[] | undefined,
): string {
  const parts: string[] = [];
  if (transcript) parts.push(transcript);
  if (segments?.length) {
    parts.push(
      segments
        .map((segment) =>
          `${segment.content}${segment.translation ? ` (${segment.translation})` : ""}`,
        )
        .join("\n"),
    );
  }
  return parts.join("\n");
}

function getDomain(url: string | undefined): string {
  if (!url) return "";
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

export function getWorkspaceItemCapabilities(type: CardType): WorkspaceItemCapability[] {
  return itemCapabilities[type] ?? [];
}

export function extractWorkspaceItemUserState(
  type: CardType,
  rawData: unknown,
): WorkspaceItemUserState | null {
  const data = normalizeItemData(type, rawData);

  switch (type) {
    case "flashcard": {
      const flashcardData = data as FlashcardData;
      return flashcardData.currentIndex != null
        ? {
            type: "flashcard",
            currentIndex: flashcardData.currentIndex,
          }
        : null;
    }
    case "quiz": {
      const quizData = data as QuizData;
      return quizData.session
        ? {
            type: "quiz",
            session: quizData.session,
          }
        : null;
    }
    case "youtube": {
      const youtubeData = data as YouTubeData;
      return youtubeData.progress != null || youtubeData.playbackRate != null
        ? {
            type: "youtube",
            ...(youtubeData.progress != null
              ? { progress: youtubeData.progress }
              : {}),
            ...(youtubeData.playbackRate != null
              ? { playbackRate: youtubeData.playbackRate }
              : {}),
          }
        : null;
    }
    default:
      return null;
  }
}

export function normalizeItemData(type: CardType, rawData: unknown): ItemData {
  const schema = itemDataSchemas[type];
  if (!schema) {
    return isRecord(rawData) ? (rawData as ItemData) : {};
  }
  const parsed = schema.safeParse(rawData);
  if (parsed.success) {
    return parsed.data;
  }
  return emptyDataForType(type);
}

export function normalizeItem(item: Item): Item {
  return {
    ...item,
    data: normalizeItemData(item.type, item.data),
  };
}

export function normalizeItems(items: Item[]): Item[] {
  return items.map(normalizeItem);
}

export function normalizeWorkspaceEventItems<T extends WorkspaceEvent>(event: T): T {
  switch (event.type) {
    case "ITEM_CREATED":
      return {
        ...event,
        payload: {
          ...event.payload,
          item: normalizeItem(event.payload.item),
        },
      } as T;
    case "BULK_ITEMS_CREATED":
      return {
        ...event,
        payload: {
          ...event.payload,
          items: normalizeItems(event.payload.items),
        },
      } as T;
    case "BULK_ITEMS_UPDATED":
      return {
        ...event,
        payload: {
          ...event.payload,
          ...(event.payload.addedItems
            ? { addedItems: normalizeItems(event.payload.addedItems) }
            : {}),
          ...(event.payload.items
            ? { items: normalizeItems(event.payload.items) }
            : {}),
        },
      } as T;
    case "FOLDER_CREATED_WITH_ITEMS":
      return {
        ...event,
        payload: {
          ...event.payload,
          folder: normalizeItem(event.payload.folder),
        },
      } as T;
    default:
      return event;
  }
}

export function getItemSearchBody(item: Item): string {
  const normalized = normalizeItem(item);
  switch (normalized.type) {
    case "document":
      return ((normalized.data as DocumentData).markdown ?? "").trim();
    case "pdf":
      return getOcrPagesTextContent((normalized.data as PdfData).ocrPages);
    case "image":
      return getOcrPagesTextContent((normalized.data as ImageData).ocrPages);
    case "flashcard":
      return formatFlashcards((normalized.data as FlashcardData).cards ?? []);
    case "quiz":
      return formatQuizQuestions((normalized.data as QuizData).questions ?? []);
    case "audio": {
      const data = normalized.data as AudioData;
      return formatAudioTranscript(data.transcript, data.segments);
    }
    case "website": {
      const data = normalized.data as WebsiteData;
      const domain = getDomain(data.url);
      return ["URL:", data.url, domain ? `Domain: ${domain}` : ""]
        .filter(Boolean)
        .join(" ");
    }
    case "youtube": {
      const data = normalized.data as YouTubeData;
      return data.url ?? "";
    }
    default:
      return "";
  }
}

export function getItemSearchIndex(item: Item): string {
  const normalized = normalizeItem(item);
  return [
    normalized.name,
    normalized.subtitle,
    normalized.type,
    getItemSearchBody(normalized),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

export function getItemContentPreview(item: Item): string | null {
  return truncateContent(getItemSearchBody(item));
}

export function diffItemDataPatch(
  previousData: ItemData,
  nextData: ItemData,
): Partial<ItemData> {
  const previousRecord = isRecord(previousData)
    ? previousData
    : ({} as Record<string, unknown>);
  const nextRecord = isRecord(nextData) ? nextData : ({} as Record<string, unknown>);

  const removedKeys = Object.keys(previousRecord).filter(
    (key) => !(key in nextRecord),
  );
  if (removedKeys.length > 0) {
    return nextData as Partial<ItemData>;
  }

  const patchEntries = Object.entries(nextRecord).filter(([key, value]) => {
    return stableStringify(previousRecord[key]) !== stableStringify(value);
  });

  if (patchEntries.length === 0) {
    return {};
  }

  return Object.fromEntries(patchEntries) as Partial<ItemData>;
}

export function buildWorkspaceItemProjection(item: Item): WorkspaceItemProjectionPayload {
  const normalized = normalizeItem(item);
  const userState = extractWorkspaceItemUserState(
    normalized.type,
    normalized.data,
  );

  let data: ItemData = normalized.data;
  let content: WorkspaceItemContentProjection = {
    textContent: null,
    structuredData: null,
    assetData: null,
    embedData: null,
    sourceData: null,
  };
  let ocrText: string | null = null;
  let transcriptText: string | null = null;
  let ocrPages: unknown | null = null;
  let transcriptSegments: unknown | null = null;

  switch (normalized.type) {
    case "document": {
      const documentData = normalized.data as DocumentData;
      data = {
        ...(documentData.sources?.length ? { sources: documentData.sources } : {}),
      } as ItemData;
      content = {
        ...content,
        textContent: documentData.markdown ?? null,
        sourceData: documentData.sources ?? null,
      };
      break;
    }
    case "pdf": {
      const pdfData = normalized.data as PdfData;
      data = {
        fileUrl: pdfData.fileUrl,
        filename: pdfData.filename,
        ...(pdfData.fileSize != null ? { fileSize: pdfData.fileSize } : {}),
        ...(pdfData.ocrStatus != null ? { ocrStatus: pdfData.ocrStatus } : {}),
        ...(pdfData.ocrError != null ? { ocrError: pdfData.ocrError } : {}),
      } as ItemData;
      ocrPages = pdfData.ocrPages ?? null;
      ocrText = getOcrPagesTextContent(pdfData.ocrPages);
      break;
    }
    case "image": {
      const imageData = normalized.data as ImageData;
      data = {
        url: imageData.url,
        ...(imageData.altText != null ? { altText: imageData.altText } : {}),
        ...(imageData.caption != null ? { caption: imageData.caption } : {}),
        ...(imageData.ocrStatus != null ? { ocrStatus: imageData.ocrStatus } : {}),
        ...(imageData.ocrError != null ? { ocrError: imageData.ocrError } : {}),
      } as ItemData;
      ocrPages = imageData.ocrPages ?? null;
      ocrText = getOcrPagesTextContent(imageData.ocrPages);
      break;
    }
    case "audio": {
      const audioData = normalized.data as AudioData;
      data = {
        fileUrl: audioData.fileUrl,
        filename: audioData.filename,
        ...(audioData.fileSize != null ? { fileSize: audioData.fileSize } : {}),
        ...(audioData.duration != null ? { duration: audioData.duration } : {}),
        ...(audioData.mimeType != null ? { mimeType: audioData.mimeType } : {}),
        ...(audioData.summary != null ? { summary: audioData.summary } : {}),
        processingStatus: audioData.processingStatus,
        ...(audioData.error != null ? { error: audioData.error } : {}),
      } as ItemData;
      transcriptText = formatAudioTranscript(
        audioData.transcript,
        audioData.segments,
      );
      transcriptSegments = audioData.segments ?? null;
      break;
    }
    case "flashcard": {
      const flashcardData = normalized.data as FlashcardData;
      data = {} as ItemData;
      content = {
        ...content,
        structuredData: { cards: flashcardData.cards ?? [] },
      };
      break;
    }
    case "quiz": {
      const quizData = normalized.data as QuizData;
      data = {
        ...(quizData.title != null ? { title: quizData.title } : {}),
      } as ItemData;
      content = {
        ...content,
        structuredData: { questions: quizData.questions ?? [] },
      };
      break;
    }
    case "website": {
      data = normalized.data;
      break;
    }
    case "youtube": {
      const youtubeData = normalized.data as YouTubeData;
      data = {
        url: youtubeData.url,
        ...(youtubeData.thumbnail != null ? { thumbnail: youtubeData.thumbnail } : {}),
      } as ItemData;
      break;
    }
    case "folder": {
      data = {};
      break;
    }
  }

  const sharedItem = rehydrateItemData(
    normalized.type,
    data,
    content,
    {
      searchText: "",
      contentPreview: null,
      ocrText,
      transcriptText,
      ocrPages,
      transcriptSegments,
    },
  );
  const searchText = getItemSearchIndex({ ...normalized, data: sharedItem });
  const fullDataString = stableStringify(sharedItem);
  const sourceCount = Array.isArray((sharedItem as DocumentData).sources)
    ? ((sharedItem as DocumentData).sources as Source[]).length
    : 0;
  const currentOcrPages = Array.isArray((sharedItem as PdfData | ImageData).ocrPages)
    ? (((sharedItem as PdfData | ImageData).ocrPages as PdfData["ocrPages"]) ?? [])
    : [];
  const currentTranscript =
    (sharedItem as AudioData).transcript ?? transcriptText ?? "";
  const processingStatus =
    normalized.type === "audio"
      ? ((sharedItem as AudioData).processingStatus ?? null)
      : normalized.type === "pdf" || normalized.type === "image"
        ? (((sharedItem as PdfData | ImageData).ocrStatus as string | undefined) ??
          null)
        : null;

  return {
    data,
    dataSchemaVersion: WORKSPACE_ITEM_DATA_SCHEMA_VERSION,
    contentHash: hashString(fullDataString),
    sourceCount,
    hasOcr: currentOcrPages.length > 0,
    ocrStatus:
      normalized.type === "pdf" || normalized.type === "image"
        ? (((sharedItem as PdfData | ImageData).ocrStatus as string | undefined) ??
          null)
        : null,
    ocrPageCount: currentOcrPages.length,
    hasTranscript: Boolean(currentTranscript.trim()),
    processingStatus,
    content,
    extracted: {
      searchText,
      contentPreview: getItemContentPreview({
        ...normalized,
        data: sharedItem,
      }),
      ocrText,
      transcriptText,
      ocrPages,
      transcriptSegments,
    },
    userState,
  };
}

export function rehydrateItemData(
  type: CardType,
  coreData: unknown,
  content: Partial<WorkspaceItemContentProjection> | null | undefined,
  extracted: Partial<WorkspaceItemExtractedProjection> | null | undefined,
  userState?: WorkspaceItemUserState | null,
): ItemData {
  const normalizedCore = normalizeItemData(type, coreData);
  const contentRecord = content ?? {};
  const extractedRecord = extracted ?? {};

  let merged: ItemData = normalizedCore;

  switch (type) {
    case "document":
      merged = {
        ...(normalizedCore as DocumentData),
        ...(typeof contentRecord.textContent === "string"
          ? { markdown: contentRecord.textContent }
          : {}),
        ...(Array.isArray(contentRecord.sourceData)
          ? { sources: contentRecord.sourceData as Source[] }
          : {}),
      };
      break;
    case "pdf":
      merged = {
        ...(normalizedCore as PdfData),
        ...(Array.isArray(extractedRecord.ocrPages)
          ? { ocrPages: extractedRecord.ocrPages as PdfData["ocrPages"] }
          : {}),
      };
      break;
    case "image":
      merged = {
        ...(normalizedCore as ImageData),
        ...(Array.isArray(extractedRecord.ocrPages)
          ? { ocrPages: extractedRecord.ocrPages as ImageData["ocrPages"] }
          : {}),
      };
      break;
    case "audio":
      merged = {
        ...(normalizedCore as AudioData),
        ...(typeof extractedRecord.transcriptText === "string"
          ? { transcript: extractedRecord.transcriptText }
          : {}),
        ...(Array.isArray(extractedRecord.transcriptSegments)
          ? { segments: extractedRecord.transcriptSegments as AudioData["segments"] }
          : {}),
      };
      break;
    case "flashcard": {
      const cards = isRecord(contentRecord.structuredData)
        ? ((contentRecord.structuredData.cards as FlashcardItem[] | undefined) ?? [])
        : [];
      merged = {
        ...(normalizedCore as FlashcardData),
        cards,
        ...(userState?.type === "flashcard" &&
        userState.currentIndex != null
          ? { currentIndex: userState.currentIndex }
          : {}),
      };
      break;
    }
    case "quiz": {
      const questions = isRecord(contentRecord.structuredData)
        ? ((contentRecord.structuredData.questions as QuizQuestion[] | undefined) ?? [])
        : [];
      merged = {
        ...(normalizedCore as QuizData),
        questions,
        ...(userState?.type === "quiz" && userState.session
          ? { session: userState.session }
          : {}),
      };
      break;
    }
    case "youtube":
      merged =
        userState?.type === "youtube"
          ? {
              ...(normalizedCore as YouTubeData),
              ...(userState.progress != null ? { progress: userState.progress } : {}),
              ...(userState.playbackRate != null
                ? { playbackRate: userState.playbackRate }
                : {}),
            }
          : normalizedCore;
      break;
    default:
      merged = normalizedCore;
  }

  return normalizeItemData(type, merged);
}
