import { z } from "zod";
import type { CardColor } from "@/lib/workspace-state/colors";
import { getOcrPagesTextContent } from "@/lib/utils/ocr-pages";
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
  LayoutPosition,
  PdfData,
  QuizData,
  QuizQuestion,
  QuizSessionData,
  ResponsiveLayouts,
  Source,
  WebsiteData,
  YouTubeData,
} from "@/lib/workspace-state/types";

export const WORKSPACE_ITEM_DATA_SCHEMA_VERSION = 1;
export const WORKSPACE_ITEM_USER_STATE_SCHEMA_VERSION = 1;
export const WORKSPACE_ITEM_PRIMARY_USER_STATE_KEY = "item";

export type WorkspaceItemCapability =
  | "asset_ref"
  | "embed_ref"
  | "ocr_content"
  | "sources"
  | "structured_content"
  | "text_content"
  | "transcript_content"
  | "user_state";

export interface WorkspaceItemShellProjection {
  itemId: string;
  type: CardType;
  name: string;
  subtitle: string;
  color: CardColor | null;
  folderId: string | null;
  layout: ResponsiveLayouts | LayoutPosition | null;
  lastModified: number | null;
  dataSchemaVersion: number;
  contentHash: string;
  processingStatus: string | null;
  hasOcr: boolean;
  ocrStatus: string | null;
  ocrPageCount: number;
  hasTranscript: boolean;
  sourceCount: number;
}

export interface WorkspaceItemContentProjection {
  textContent: string | null;
  structuredData: Record<string, unknown> | null;
  assetData: Record<string, unknown> | null;
  embedData: Record<string, unknown> | null;
  sourceData: Source[] | null;
}

export interface WorkspaceItemExtractedProjection {
  searchText: string;
  contentPreview: string | null;
  ocrText: string | null;
  ocrPages: PdfData["ocrPages"] | ImageData["ocrPages"] | null;
  transcriptText: string | null;
  transcriptSegments: AudioSegment[] | null;
}

export interface WorkspaceItemUserStateProjection {
  stateKey: string;
  stateType: CardType;
  stateSchemaVersion: number;
  state: Record<string, unknown>;
}

export interface WorkspaceItemSplitResult {
  shell: WorkspaceItemShellProjection;
  content: WorkspaceItemContentProjection;
  extracted: WorkspaceItemExtractedProjection;
  userStates: WorkspaceItemUserStateProjection[];
}

export interface WorkspaceItemTableRows {
  item: WorkspaceItemShellProjection & {
    workspaceId: string;
    sourceVersion: number;
  };
  content: WorkspaceItemContentProjection & {
    workspaceId: string;
    itemId: string;
    dataSchemaVersion: number;
    contentHash: string;
  };
  extracted: WorkspaceItemExtractedProjection & {
    workspaceId: string;
    itemId: string;
  };
  userStates: Array<
    WorkspaceItemUserStateProjection & {
      workspaceId: string;
      itemId: string;
      userId: string;
    }
  >;
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
  audio: ["asset_ref", "structured_content", "transcript_content"],
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

  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  return (hash >>> 0).toString(16).padStart(8, "0");
}

function truncateContent(text: string, limit = 280): string | null {
  const normalized = text.replace(/\s+/g, " ").trim();

  if (!normalized) {
    return null;
  }

  if (normalized.length <= limit) {
    return normalized;
  }

  return `${normalized.slice(0, limit - 1)}…`;
}

function formatFlashcards(cards: FlashcardItem[]): string {
  return cards.map((card) => `${card.front}\n${card.back}`).join("\n\n");
}

function formatQuizQuestions(
  questions: QuizQuestion[],
  title?: string,
): string {
  const questionText = questions
    .map((question) =>
      [
        question.questionText,
        question.options.join("\n"),
        question.hint ?? "",
        question.explanation,
        question.sourceContext ?? "",
      ]
        .filter(Boolean)
        .join("\n"),
    )
    .join("\n\n");

  return [title ?? "", questionText].filter(Boolean).join("\n\n");
}

function formatAudioSearchText(
  summary: string | undefined,
  transcript: string | undefined,
  segments: AudioSegment[] | undefined,
): string {
  const parts: string[] = [];

  if (summary?.trim()) {
    parts.push(summary.trim());
  }

  if (transcript?.trim()) {
    parts.push(transcript.trim());
  }

  if (segments?.length) {
    parts.push(
      segments
        .map((segment) =>
          [segment.speaker, segment.content, segment.translation]
            .filter(Boolean)
            .join(": "),
        )
        .join("\n"),
    );
  }

  return parts.join("\n\n");
}

function getDomain(url: string | undefined): string {
  if (!url) {
    return "";
  }

  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

function findPrimaryUserState(
  userStates: WorkspaceItemUserStateProjection[] | null | undefined,
  type: CardType,
): Record<string, unknown> | null {
  const match = userStates?.find(
    (userState) =>
      userState.stateKey === WORKSPACE_ITEM_PRIMARY_USER_STATE_KEY &&
      userState.stateType === type,
  );

  return match?.state ?? null;
}

function nullIfEmptyString(value: string | undefined): string | null {
  if (!value) {
    return null;
  }

  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function normalizeSharedItemData(
  type: CardType,
  content: WorkspaceItemContentProjection,
  extracted: WorkspaceItemExtractedProjection,
  shell?: Pick<WorkspaceItemShellProjection, "ocrStatus" | "processingStatus">,
): ItemData {
  return rehydrateWorkspaceItemData(type, shell ?? {}, content, extracted, []);
}

function getItemSearchBody(item: Item): string {
  switch (item.type) {
    case "document":
      return ((item.data as DocumentData).markdown ?? "").trim();
    case "pdf":
      return getOcrPagesTextContent((item.data as PdfData).ocrPages).trim();
    case "image":
      return getOcrPagesTextContent((item.data as ImageData).ocrPages).trim();
    case "flashcard":
      return formatFlashcards((item.data as FlashcardData).cards ?? []);
    case "quiz": {
      const data = item.data as QuizData;
      return formatQuizQuestions(data.questions ?? [], data.title);
    }
    case "audio": {
      const data = item.data as AudioData;
      return formatAudioSearchText(
        data.summary,
        data.transcript,
        data.segments,
      );
    }
    case "website": {
      const data = item.data as WebsiteData;
      const domain = getDomain(data.url);
      return [data.url, domain].filter(Boolean).join("\n");
    }
    case "youtube": {
      const data = item.data as YouTubeData;
      return [data.url, data.thumbnail ?? ""].filter(Boolean).join("\n");
    }
    case "folder":
      return "";
  }
}

function getItemSearchIndex(item: Item): string {
  return [item.name, item.subtitle, item.type, getItemSearchBody(item)]
    .filter(Boolean)
    .join("\n")
    .toLowerCase();
}

function getItemContentPreview(item: Item): string | null {
  return truncateContent(getItemSearchBody(item));
}

export function getWorkspaceItemCapabilities(
  type: CardType,
): WorkspaceItemCapability[] {
  return itemCapabilities[type] ?? [];
}

export function normalizeItemData(type: CardType, rawData: unknown): ItemData {
  const schema = itemDataSchemas[type];
  const parsed = schema.safeParse(rawData);

  if (parsed.success) {
    return parsed.data;
  }

  const fallback = {
    ...emptyDataForType(type),
    ...(isRecord(rawData) ? rawData : {}),
  };

  try {
    return schema.parse(fallback);
  } catch {
    return fallback as ItemData;
  }
}

export function normalizeItem(item: Item): Item {
  return {
    ...item,
    subtitle: item.subtitle ?? "",
    data: normalizeItemData(item.type, item.data),
  };
}

export function extractWorkspaceItemUserStates(
  item: Item,
): WorkspaceItemUserStateProjection[] {
  const normalized = normalizeItem(item);

  switch (normalized.type) {
    case "flashcard": {
      const data = normalized.data as FlashcardData;
      if (data.currentIndex == null) {
        return [];
      }

      return [
        {
          stateKey: WORKSPACE_ITEM_PRIMARY_USER_STATE_KEY,
          stateType: normalized.type,
          stateSchemaVersion: WORKSPACE_ITEM_USER_STATE_SCHEMA_VERSION,
          state: { currentIndex: data.currentIndex },
        },
      ];
    }
    case "quiz": {
      const data = normalized.data as QuizData;
      if (!data.session) {
        return [];
      }

      return [
        {
          stateKey: WORKSPACE_ITEM_PRIMARY_USER_STATE_KEY,
          stateType: normalized.type,
          stateSchemaVersion: WORKSPACE_ITEM_USER_STATE_SCHEMA_VERSION,
          state: { session: data.session },
        },
      ];
    }
    case "youtube": {
      const data = normalized.data as YouTubeData;
      if (data.progress == null && data.playbackRate == null) {
        return [];
      }

      return [
        {
          stateKey: WORKSPACE_ITEM_PRIMARY_USER_STATE_KEY,
          stateType: normalized.type,
          stateSchemaVersion: WORKSPACE_ITEM_USER_STATE_SCHEMA_VERSION,
          state: {
            ...(data.progress != null ? { progress: data.progress } : {}),
            ...(data.playbackRate != null
              ? { playbackRate: data.playbackRate }
              : {}),
          },
        },
      ];
    }
    default:
      return [];
  }
}

export function splitWorkspaceItem(item: Item): WorkspaceItemSplitResult {
  const normalized = normalizeItem(item);
  const userStates = extractWorkspaceItemUserStates(normalized);

  const content: WorkspaceItemContentProjection = {
    textContent: null,
    structuredData: null,
    assetData: null,
    embedData: null,
    sourceData: null,
  };

  const extracted: WorkspaceItemExtractedProjection = {
    searchText: "",
    contentPreview: null,
    ocrText: null,
    ocrPages: null,
    transcriptText: null,
    transcriptSegments: null,
  };

  let processingStatus: string | null = null;
  let ocrStatus: string | null = null;

  switch (normalized.type) {
    case "document": {
      const data = normalized.data as DocumentData;
      content.textContent = data.markdown ?? null;
      content.sourceData = data.sources ?? null;
      break;
    }
    case "pdf": {
      const data = normalized.data as PdfData;
      content.assetData = {
        fileUrl: data.fileUrl,
        filename: data.filename,
        ...(data.fileSize != null ? { fileSize: data.fileSize } : {}),
        ...(data.ocrError != null ? { ocrError: data.ocrError } : {}),
      };
      ocrStatus = data.ocrStatus ?? null;
      extracted.ocrPages = data.ocrPages ?? null;
      extracted.ocrText = nullIfEmptyString(
        getOcrPagesTextContent(data.ocrPages),
      );
      break;
    }
    case "image": {
      const data = normalized.data as ImageData;
      content.assetData = {
        url: data.url,
        ...(data.altText != null ? { altText: data.altText } : {}),
        ...(data.caption != null ? { caption: data.caption } : {}),
        ...(data.ocrError != null ? { ocrError: data.ocrError } : {}),
      };
      ocrStatus = data.ocrStatus ?? null;
      extracted.ocrPages = data.ocrPages ?? null;
      extracted.ocrText = nullIfEmptyString(
        getOcrPagesTextContent(data.ocrPages),
      );
      break;
    }
    case "audio": {
      const data = normalized.data as AudioData;
      content.assetData = {
        fileUrl: data.fileUrl,
        filename: data.filename,
        ...(data.fileSize != null ? { fileSize: data.fileSize } : {}),
        ...(data.duration != null ? { duration: data.duration } : {}),
        ...(data.mimeType != null ? { mimeType: data.mimeType } : {}),
      };
      content.structuredData = {
        ...(data.summary != null ? { summary: data.summary } : {}),
        ...(data.error != null ? { error: data.error } : {}),
      };
      processingStatus = data.processingStatus;
      extracted.transcriptText = nullIfEmptyString(data.transcript);
      extracted.transcriptSegments = data.segments ?? null;
      break;
    }
    case "flashcard": {
      const data = normalized.data as FlashcardData;
      content.structuredData = { cards: data.cards ?? [] };
      break;
    }
    case "quiz": {
      const data = normalized.data as QuizData;
      content.structuredData = {
        questions: data.questions ?? [],
        ...(data.title != null ? { title: data.title } : {}),
      };
      break;
    }
    case "youtube": {
      const data = normalized.data as YouTubeData;
      content.embedData = {
        url: data.url,
        ...(data.thumbnail != null ? { thumbnail: data.thumbnail } : {}),
      };
      break;
    }
    case "website": {
      const data = normalized.data as WebsiteData;
      content.embedData = {
        url: data.url,
        ...(data.favicon != null ? { favicon: data.favicon } : {}),
      };
      break;
    }
    case "folder":
      break;
  }

  const sharedData = normalizeSharedItemData(
    normalized.type,
    content,
    extracted,
    {
      ocrStatus,
      processingStatus,
    },
  );
  const sharedItem: Item = { ...normalized, data: sharedData };
  const sourceCount = content.sourceData?.length ?? 0;
  const ocrPageCount = extracted.ocrPages?.length ?? 0;
  const hasTranscript = Boolean(
    extracted.transcriptText?.trim() || extracted.transcriptSegments?.length,
  );

  extracted.searchText = getItemSearchIndex(sharedItem);
  extracted.contentPreview = getItemContentPreview(sharedItem);

  return {
    shell: {
      itemId: normalized.id,
      type: normalized.type,
      name: normalized.name,
      subtitle: normalized.subtitle ?? "",
      color: normalized.color ?? null,
      folderId: normalized.folderId ?? null,
      layout: normalized.layout ?? null,
      lastModified: normalized.lastModified ?? null,
      dataSchemaVersion: WORKSPACE_ITEM_DATA_SCHEMA_VERSION,
      contentHash: hashString(stableStringify(sharedData)),
      processingStatus,
      hasOcr: ocrPageCount > 0,
      ocrStatus,
      ocrPageCount,
      hasTranscript,
      sourceCount,
    },
    content,
    extracted,
    userStates,
  };
}

export function buildWorkspaceItemTableRows(params: {
  workspaceId: string;
  item: Item;
  sourceVersion: number;
  userId?: string;
}): WorkspaceItemTableRows {
  const split = splitWorkspaceItem(params.item);

  if (split.userStates.length > 0 && !params.userId) {
    throw new Error("userId is required for items with user state");
  }

  return {
    item: {
      workspaceId: params.workspaceId,
      sourceVersion: params.sourceVersion,
      ...split.shell,
    },
    content: {
      workspaceId: params.workspaceId,
      itemId: split.shell.itemId,
      dataSchemaVersion: split.shell.dataSchemaVersion,
      contentHash: split.shell.contentHash,
      ...split.content,
    },
    extracted: {
      workspaceId: params.workspaceId,
      itemId: split.shell.itemId,
      ...split.extracted,
    },
    userStates: params.userId
      ? split.userStates.map((userState) => ({
          workspaceId: params.workspaceId,
          itemId: split.shell.itemId,
          userId: params.userId!,
          ...userState,
        }))
      : [],
  };
}

export function rehydrateWorkspaceItemData(
  type: CardType,
  shell: Partial<
    Pick<WorkspaceItemShellProjection, "ocrStatus" | "processingStatus">
  >,
  content: Partial<WorkspaceItemContentProjection> | null | undefined,
  extracted: Partial<WorkspaceItemExtractedProjection> | null | undefined,
  userStates: WorkspaceItemUserStateProjection[] | null | undefined = [],
): ItemData {
  const contentRecord = content ?? {};
  const extractedRecord = extracted ?? {};
  const primaryUserState = findPrimaryUserState(userStates, type);

  let merged: ItemData;

  switch (type) {
    case "document": {
      merged = {
        markdown:
          typeof contentRecord.textContent === "string"
            ? contentRecord.textContent
            : "",
        ...(Array.isArray(contentRecord.sourceData)
          ? { sources: contentRecord.sourceData }
          : {}),
      } satisfies DocumentData;
      break;
    }
    case "pdf": {
      const assetData = isRecord(contentRecord.assetData)
        ? contentRecord.assetData
        : {};
      merged = {
        fileUrl: typeof assetData.fileUrl === "string" ? assetData.fileUrl : "",
        filename:
          typeof assetData.filename === "string" ? assetData.filename : "",
        ...(typeof assetData.fileSize === "number"
          ? { fileSize: assetData.fileSize }
          : {}),
        ...(typeof shell.ocrStatus === "string"
          ? { ocrStatus: shell.ocrStatus as PdfData["ocrStatus"] }
          : {}),
        ...(typeof assetData.ocrError === "string"
          ? { ocrError: assetData.ocrError }
          : {}),
        ...(Array.isArray(extractedRecord.ocrPages)
          ? { ocrPages: extractedRecord.ocrPages as PdfData["ocrPages"] }
          : {}),
      } satisfies PdfData;
      break;
    }
    case "image": {
      const assetData = isRecord(contentRecord.assetData)
        ? contentRecord.assetData
        : {};
      merged = {
        url: typeof assetData.url === "string" ? assetData.url : "",
        ...(typeof assetData.altText === "string"
          ? { altText: assetData.altText }
          : {}),
        ...(typeof assetData.caption === "string"
          ? { caption: assetData.caption }
          : {}),
        ...(typeof shell.ocrStatus === "string"
          ? { ocrStatus: shell.ocrStatus as ImageData["ocrStatus"] }
          : {}),
        ...(typeof assetData.ocrError === "string"
          ? { ocrError: assetData.ocrError }
          : {}),
        ...(Array.isArray(extractedRecord.ocrPages)
          ? { ocrPages: extractedRecord.ocrPages as ImageData["ocrPages"] }
          : {}),
      } satisfies ImageData;
      break;
    }
    case "audio": {
      const assetData = isRecord(contentRecord.assetData)
        ? contentRecord.assetData
        : {};
      const structuredData = isRecord(contentRecord.structuredData)
        ? contentRecord.structuredData
        : {};
      merged = {
        fileUrl: typeof assetData.fileUrl === "string" ? assetData.fileUrl : "",
        filename:
          typeof assetData.filename === "string" ? assetData.filename : "",
        ...(typeof assetData.fileSize === "number"
          ? { fileSize: assetData.fileSize }
          : {}),
        ...(typeof assetData.duration === "number"
          ? { duration: assetData.duration }
          : {}),
        ...(typeof assetData.mimeType === "string"
          ? { mimeType: assetData.mimeType }
          : {}),
        ...(typeof structuredData.summary === "string"
          ? { summary: structuredData.summary }
          : {}),
        ...(typeof extractedRecord.transcriptText === "string"
          ? { transcript: extractedRecord.transcriptText }
          : {}),
        ...(Array.isArray(extractedRecord.transcriptSegments)
          ? { segments: extractedRecord.transcriptSegments }
          : {}),
        processingStatus:
          typeof shell.processingStatus === "string"
            ? (shell.processingStatus as AudioData["processingStatus"])
            : "uploading",
        ...(typeof structuredData.error === "string"
          ? { error: structuredData.error }
          : {}),
      } satisfies AudioData;
      break;
    }
    case "flashcard": {
      const structuredData = isRecord(contentRecord.structuredData)
        ? contentRecord.structuredData
        : {};
      merged = {
        cards: Array.isArray(structuredData.cards)
          ? (structuredData.cards as FlashcardItem[])
          : [],
        ...(typeof primaryUserState?.currentIndex === "number"
          ? { currentIndex: primaryUserState.currentIndex }
          : {}),
      } satisfies FlashcardData;
      break;
    }
    case "quiz": {
      const structuredData = isRecord(contentRecord.structuredData)
        ? contentRecord.structuredData
        : {};
      const parsedSession = quizSessionSchema.safeParse(
        primaryUserState?.session,
      );
      merged = {
        ...(typeof structuredData.title === "string"
          ? { title: structuredData.title }
          : {}),
        questions: Array.isArray(structuredData.questions)
          ? (structuredData.questions as QuizQuestion[])
          : [],
        ...(parsedSession.success
          ? { session: parsedSession.data as QuizSessionData }
          : {}),
      } satisfies QuizData;
      break;
    }
    case "youtube": {
      const embedData = isRecord(contentRecord.embedData)
        ? contentRecord.embedData
        : {};
      merged = {
        url: typeof embedData.url === "string" ? embedData.url : "",
        ...(typeof embedData.thumbnail === "string"
          ? { thumbnail: embedData.thumbnail }
          : {}),
        ...(typeof primaryUserState?.progress === "number"
          ? { progress: primaryUserState.progress }
          : {}),
        ...(typeof primaryUserState?.playbackRate === "number"
          ? { playbackRate: primaryUserState.playbackRate }
          : {}),
      } satisfies YouTubeData;
      break;
    }
    case "website": {
      const embedData = isRecord(contentRecord.embedData)
        ? contentRecord.embedData
        : {};
      merged = {
        url: typeof embedData.url === "string" ? embedData.url : "",
        ...(typeof embedData.favicon === "string"
          ? { favicon: embedData.favicon }
          : {}),
      } satisfies WebsiteData;
      break;
    }
    case "folder": {
      merged = {};
      break;
    }
  }

  return normalizeItemData(type, merged);
}

export function rehydrateWorkspaceItem(params: {
  shell: Pick<
    WorkspaceItemShellProjection,
    | "itemId"
    | "type"
    | "name"
    | "subtitle"
    | "color"
    | "folderId"
    | "layout"
    | "lastModified"
    | "ocrStatus"
    | "processingStatus"
  >;
  content?: Partial<WorkspaceItemContentProjection> | null;
  extracted?: Partial<WorkspaceItemExtractedProjection> | null;
  userStates?: WorkspaceItemUserStateProjection[] | null;
}): Item {
  const { shell, content, extracted, userStates } = params;

  return {
    id: shell.itemId,
    type: shell.type,
    name: shell.name,
    subtitle: shell.subtitle,
    data: rehydrateWorkspaceItemData(
      shell.type,
      {
        ocrStatus: shell.ocrStatus,
        processingStatus: shell.processingStatus,
      },
      content,
      extracted,
      userStates,
    ),
    ...(shell.color ? { color: shell.color } : {}),
    ...(shell.folderId ? { folderId: shell.folderId } : {}),
    ...(shell.layout ? { layout: shell.layout } : {}),
    ...(shell.lastModified != null ? { lastModified: shell.lastModified } : {}),
  };
}
