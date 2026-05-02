import type {
  AudioData,
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
  WebsiteData,
  YouTubeData,
} from "@/lib/workspace-state/types";
import { getOcrPagesTextContent } from "@/lib/utils/ocr-pages";
import {
  emptyDataForType,
  itemDataSchemas,
} from "./workspace-item-model-schemas";
import {
  getItemContentPreview,
  getItemSearchIndex,
  getWorkspaceItemCapabilities,
  hashString,
  isRecord,
  nullIfEmptyString,
  stableStringify,
} from "./workspace-item-model-shared";
import {
  WORKSPACE_ITEM_DATA_SCHEMA_VERSION,
  type WorkspaceItemContentProjection,
  type WorkspaceItemExtractedProjection,
  type WorkspaceItemShellProjection,
  type WorkspaceItemSplitResult,
  type WorkspaceItemTableRows,
} from "./workspace-item-model-types";

export * from "./workspace-item-model-types";
export { getWorkspaceItemCapabilities } from "./workspace-item-model-shared";

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

export function rehydrateWorkspaceItemData(
  type: CardType,
  shell: Partial<
    Pick<WorkspaceItemShellProjection, "ocrStatus" | "processingStatus">
  >,
  content: Partial<WorkspaceItemContentProjection> | null | undefined,
  extracted: Partial<WorkspaceItemExtractedProjection> | null | undefined,
): ItemData {
  const contentRecord = content ?? {};
  const extractedRecord = extracted ?? {};

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
      } satisfies FlashcardData;
      break;
    }
    case "quiz": {
      const structuredData = isRecord(contentRecord.structuredData)
        ? contentRecord.structuredData
        : {};
      merged = {
        ...(typeof structuredData.title === "string"
          ? { title: structuredData.title }
          : {}),
        questions: Array.isArray(structuredData.questions)
          ? (structuredData.questions as QuizQuestion[])
          : [],
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

function normalizeSharedItemData(
  type: CardType,
  content: WorkspaceItemContentProjection,
  extracted: WorkspaceItemExtractedProjection,
  shell?: Pick<WorkspaceItemShellProjection, "ocrStatus" | "processingStatus">,
): ItemData {
  return rehydrateWorkspaceItemData(type, shell ?? {}, content, extracted);
}

export function splitWorkspaceItem(item: Item): WorkspaceItemSplitResult {
  const normalized = normalizeItem(item);

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
      sortOrder: normalized.sortOrder ?? null,
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
  };
}

export function buildWorkspaceItemTableRows(params: {
  workspaceId: string;
  item: Item;
  sourceVersion: number;
}): WorkspaceItemTableRows {
  const split = splitWorkspaceItem(params.item);

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
  };
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
    | "sortOrder"
    | "layout"
    | "lastModified"
    | "ocrStatus"
    | "processingStatus"
  >;
  content?: Partial<WorkspaceItemContentProjection> | null;
  extracted?: Partial<WorkspaceItemExtractedProjection> | null;
}): Item {
  const { shell, content, extracted } = params;

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
    ),
    ...(shell.color ? { color: shell.color } : {}),
    ...(shell.folderId ? { folderId: shell.folderId } : {}),
    ...(shell.sortOrder != null ? { sortOrder: shell.sortOrder } : {}),
    ...(shell.layout ? { layout: shell.layout } : {}),
    ...(shell.lastModified != null ? { lastModified: shell.lastModified } : {}),
  };
}
