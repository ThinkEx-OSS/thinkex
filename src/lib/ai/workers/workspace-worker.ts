import { createPatch, diffLines } from "diff";
import { db } from "@/lib/db/client";
import { generateItemId } from "@/lib/workspace-state/item-helpers";
import { getRandomCardColor } from "@/lib/workspace-state/colors";
import { logger } from "@/lib/utils/logger";
import type {
  Item,
  PdfData,
  ImageData,
  QuizData,
  QuizQuestion,
  FlashcardData,
  FlashcardItem,
  DocumentData,
} from "@/lib/workspace-state/types";
import { executeWorkspaceOperation } from "./common";
import {
  requireMutationIdentity,
  requireWorkspaceEditor,
  loadWorkspaceItemsForValidation,
  checkDuplicateName,
} from "@/lib/workspace/mutation-helpers";
import {
  replace as applyReplace,
  trimDiff,
  normalizeLineEndings,
} from "@/lib/utils/edit-replace";
import { parseJsonWithRepair } from "@/lib/utils/json-repair";
import { buildPdfDataFromUpload } from "@/lib/pdf/pdf-item";
import {
  deleteWorkspaceItemById,
  insertWorkspaceItem,
  loadWorkspaceItemRecord,
  upsertWorkspaceItem,
} from "@/lib/workspace/workspace-item-write";
import { sanitizeWorkspaceItemForPersistence } from "@/lib/workspace/workspace-item-sanitize";

/** Create params for a single item (used by create and bulkCreate). Exported for autogen. */
export type CreateItemParams = {
  id?: string; // Optional pre-generated item ID (if not provided, one is generated)
  title?: string;
  content?: string;
  itemType?:
    | "flashcard"
    | "quiz"
    | "youtube"
    | "image"
    | "audio"
    | "pdf"
    | "document";
  pdfData?: {
    fileUrl: string;
    filename: string;
    fileSize?: number;
    ocrPages?: PdfData["ocrPages"];
    ocrStatus?: PdfData["ocrStatus"];
    ocrError?: string;
  };
  flashcardData?: { cards?: { front: string; back: string }[] };
  quizData?: QuizData;
  youtubeData?: { url: string };
  imageData?: {
    url: string;
    altText?: string;
    caption?: string;
    ocrStatus?: ImageData["ocrStatus"];
    ocrError?: string;
    ocrPages?: ImageData["ocrPages"];
  };
  audioData?: {
    fileUrl: string;
    filename: string;
    fileSize?: number;
    mimeType?: string;
    duration?: number;
  };
  sources?: Array<{ title: string; url: string; favicon?: string }>;
  folderId?: string;
  layout?: { x: number; y: number; w: number; h: number };
};

/**
 * Build an Item from create params. Used by both create and bulkCreate.
 */
async function buildItemFromCreateParams(p: CreateItemParams): Promise<Item> {
  const itemId = p.id || crypto.randomUUID();
  const itemType = p.itemType || "document";

  let itemData: any;

  if (itemType === "flashcard") {
    if (!p.flashcardData?.cards)
      throw new Error("Flashcard data required for flashcard creation");
    const cardsWithIds = p.flashcardData.cards
      .map((card) => {
        if (!card || typeof card !== "object") return null;
        const front = card.front || "";
        const back = card.back || "";
        return {
          id: generateItemId(),
          front,
          back,
        };
      })
      .filter((c): c is NonNullable<typeof c> => c !== null);
    itemData = { cards: cardsWithIds };
  } else if (itemType === "youtube") {
    if (!p.youtubeData?.url)
      throw new Error("YouTube data required for youtube card creation");
    itemData = { url: p.youtubeData.url };
  } else if (itemType === "image") {
    if (!p.imageData?.url)
      throw new Error("Image data required for image card creation");
    itemData = {
      url: p.imageData.url,
      altText: p.imageData.altText,
      caption: p.imageData.caption,
      ...(p.imageData.ocrPages != null && { ocrPages: p.imageData.ocrPages }),
      ...(p.imageData.ocrStatus != null && {
        ocrStatus: p.imageData.ocrStatus,
      }),
      ...(p.imageData.ocrError != null && { ocrError: p.imageData.ocrError }),
    };
  } else if (itemType === "audio") {
    if (!p.audioData?.fileUrl)
      throw new Error("Audio data required for audio card creation");
    itemData = {
      fileUrl: p.audioData.fileUrl,
      filename: p.audioData.filename || "Recording",
      fileSize: p.audioData.fileSize,
      mimeType: p.audioData.mimeType,
      duration: p.audioData.duration,
      processingStatus: "processing",
    };
  } else if (itemType === "pdf") {
    if (!p.pdfData?.fileUrl)
      throw new Error("PDF data required for pdf card creation");
    itemData = {
      ...buildPdfDataFromUpload({
        fileUrl: p.pdfData.fileUrl,
        filename: p.pdfData.filename || "document.pdf",
        contentType: "application/pdf",
        fileSize: p.pdfData.fileSize,
        displayName: p.pdfData.filename || "document.pdf",
      }),
      ...(p.pdfData.ocrPages != null && { ocrPages: p.pdfData.ocrPages }),
      ...(p.pdfData.ocrStatus != null && { ocrStatus: p.pdfData.ocrStatus }),
      ...(p.pdfData.ocrError != null && { ocrError: p.pdfData.ocrError }),
    };
  } else if (itemType === "quiz") {
    if (!p.quizData) throw new Error("Quiz data required for quiz creation");
    itemData = p.quizData;
  } else if (itemType === "document") {
    const normalizedContent = p.content ?? "";
    itemData = {
      markdown: normalizedContent,
      ...(p.sources?.length && { sources: p.sources }),
    } as DocumentData;
  } else {
    throw new Error(`Unsupported item type for create: ${String(itemType)}`);
  }

  const defaultNames: Record<string, string> = {
    document: "New Document",
    youtube: "YouTube Video",
    image: "Image",
    quiz: "New Quiz",
    flashcard: "New Flashcard Deck",
    audio: "Audio Recording",
    pdf: "PDF Document",
  };

  return {
    id: itemId,
    type: itemType,
    name: p.title || defaultNames[itemType] || "New Document",
    subtitle: "",
    data: itemData,
    color: getRandomCardColor(),
    folderId: p.folderId,
    ...(p.layout && { layout: p.layout }),
  };
}

async function createWorkspaceItem(workspaceId: string, item: Item) {
  await db.transaction(async (tx) => {
    await insertWorkspaceItem(tx, {
      workspaceId,
      item: sanitizeWorkspaceItemForPersistence(item),
      sourceVersion: 0,
    });
  });
}

async function createWorkspaceItems(workspaceId: string, items: Item[]) {
  await db.transaction(async (tx) => {
    for (const item of items) {
      await insertWorkspaceItem(tx, {
        workspaceId,
        item: sanitizeWorkspaceItemForPersistence(item),
        sourceVersion: 0,
      });
    }
  });
}

async function updateWorkspaceItem(
  workspaceId: string,
  itemId: string,
  updater: (item: Item) => Item,
) {
  await db.transaction(async (tx) => {
    const existing = await loadWorkspaceItemRecord(tx, { workspaceId, itemId });
    if (!existing) {
      throw new Error(`Item not found with ID: ${itemId}`);
    }

    await upsertWorkspaceItem(tx, {
      workspaceId,
      sourceVersion: existing.sourceVersion,
      item: sanitizeWorkspaceItemForPersistence(updater(existing.item)),
    });
  });
}

async function deleteWorkspaceItem(workspaceId: string, itemId: string) {
  await db.transaction(async (tx) => {
    await deleteWorkspaceItemById(tx, { workspaceId, itemId });
  });
}

/**
 * WORKER 3: Workspace Management Agent
 * Manages workspace items (create, update, delete)
 * Operations are serialized per workspace to prevent version conflicts
 */
export async function workspaceWorker(
  action:
    | "create"
    | "bulkCreate"
    | "delete"
    | "edit"
    | "updateFlashcard"
    | "updateQuiz"
    | "updatePdfContent"
    | "updateImageContent",
  params: {
    workspaceId: string;
    /** For bulkCreate: array of create params (no workspaceId). Items are built and appended as one BULK_ITEMS_CREATED event. */
    items?: CreateItemParams[];
    title?: string;
    content?: string; // For create
    /** Cline convention: oldString+newString. oldString='' = full rewrite, else targeted edit (edit action) */
    oldString?: string;
    newString?: string;
    replaceAll?: boolean;
    itemId?: string;
    /** Display name for diff header (e.g. item title) */
    itemName?: string;
    /** Rename the item (edit action) */
    newName?: string;

    itemType?:
      | "flashcard"
      | "quiz"
      | "youtube"
      | "image"
      | "audio"
      | "pdf"
      | "document";
    pdfData?: {
      fileUrl: string;
      filename: string;
      fileSize?: number;
    };
    pdfOcrPages?: PdfData["ocrPages"]; // Full OCR page data from Mistral OCR
    pdfOcrStatus?: "complete" | "failed" | "processing"; // OCR run status
    pdfOcrError?: string;
    flashcardData?: {
      cards?: { front: string; back: string }[]; // For creating flashcards
      cardsToAdd?: { front: string; back: string }[]; // For updating flashcards (appending)
    };
    quizData?: QuizData; // For creating quizzes
    questionsToAdd?: QuizQuestion[]; // For updating quizzes (appending questions)
    youtubeData?: {
      url: string; // For creating youtube cards
    };
    imageData?: {
      url: string;
      altText?: string;
      caption?: string;
    };
    imageOcrPages?: ImageData["ocrPages"];
    imageOcrStatus?: "complete" | "failed";
    imageOcrError?: string;
    audioData?: {
      fileUrl: string;
      filename: string;
      fileSize?: number;
      mimeType?: string;
      duration?: number;
    };
    // Optional: sources from web search
    sources?: Array<{
      title: string;
      url: string;
      favicon?: string;
    }>;
    folderId?: string;
    /** Optional layout { x, y, w, h } for the item (lg breakpoint) */
    layout?: { x: number; y: number; w: number; h: number };
  },
): Promise<{
  success: boolean;
  message: string;
  itemId?: string;
  cardsAdded?: number;
  cardCount?: number;
  event?: unknown;
  version?: number;
}> {
  // For "create" and "bulkCreate" operations, allow parallel execution (bypass queue)
  // For other operations, serialize via queue
  const allowParallel = action === "create" || action === "bulkCreate";

  return executeWorkspaceOperation(
    params.workspaceId,
    async () => {
      try {
        const { userId } = await requireMutationIdentity();
        await requireWorkspaceEditor(params.workspaceId, userId);

        // Handle different actions
        if (action === "create") {
          const item = await buildItemFromCreateParams(params);
          const currentState = await loadWorkspaceItemsForValidation(
            params.workspaceId,
            userId,
          );
          const dupError = checkDuplicateName(
            currentState,
            item.name,
            item.type,
            item.folderId ?? null,
          );
          if (dupError) {
            return { success: false, message: dupError };
          }
          await createWorkspaceItem(params.workspaceId, item);

          // Include card count for flashcard decks (use created item.data.cards, not params)
          const flashcardCards =
            item.type === "flashcard" && item.data && "cards" in item.data
              ? (item.data as { cards: unknown[] }).cards
              : undefined;
          const cardCount = Array.isArray(flashcardCards)
            ? flashcardCards.filter(
                (c: unknown) => c != null && typeof c === "object",
              ).length
            : undefined;

          return {
            success: true,
            itemId: item.id,
            message: `Created ${item.type} "${item.name}" successfully`,
            cardCount,
          };
        }

        if (action === "bulkCreate") {
          if (!params.items?.length) {
            throw new Error("bulkCreate requires a non-empty items array");
          }

          const items = await Promise.all(
            params.items.map((p) => buildItemFromCreateParams(p)),
          );

          const currentState = await loadWorkspaceItemsForValidation(
            params.workspaceId,
            userId,
          );
          for (let i = 0; i < items.length; i++) {
            const item = items[i];
            const preceding = [...currentState, ...items.slice(0, i)];
            const dupError = checkDuplicateName(
              preceding,
              item.name,
              item.type,
              item.folderId ?? null,
            );
            if (dupError) {
              return { success: false, message: dupError };
            }
          }

          await createWorkspaceItems(params.workspaceId, items);

          return {
            success: true,
            message: `Bulk created ${items.length} items successfully`,
            itemIds: items.map((i) => i.id),
          };
        }

        if (action === "updateFlashcard") {
          if (!params.itemId) {
            throw new Error("Item ID required for flashcard update");
          }
          if (
            !params.flashcardData?.cardsToAdd ||
            params.flashcardData.cardsToAdd.length === 0
          ) {
            throw new Error("Cards to add required for flashcard update");
          }

          const currentState = await loadWorkspaceItemsForValidation(
            params.workspaceId,
            userId,
          );

          const existingItem = currentState.find(
            (i: any) => i.id === params.itemId,
          );
          if (!existingItem) {
            throw new Error(
              `Flashcard deck not found with ID: ${params.itemId}`,
            );
          }

          if (existingItem.type !== "flashcard") {
            throw new Error(
              `Item "${existingItem.name}" is not a flashcard deck (type: ${existingItem.type})`,
            );
          }

          const existingData = existingItem.data as { cards?: any[] };
          const existingCards = existingData?.cards || [];

          // Generate new cards with IDs and parsed blocks
          const newCards = params.flashcardData.cardsToAdd.map((card) => ({
            id: generateItemId(),
            front: card.front,
            back: card.back,
          }));

          // Merge existing cards with new cards
          const updatedData = {
            ...existingData,
            cards: [...existingCards, ...newCards],
          };

          const changes: any = { data: updatedData };

          // Handle title update if provided
          if (params.title) {
            const dupError = checkDuplicateName(
              currentState,
              params.title,
              existingItem.type,
              existingItem.folderId ?? null,
              params.itemId,
            );
            if (dupError) {
              return { success: false, message: dupError };
            }
            changes.name = params.title;
          }

          await updateWorkspaceItem(
            params.workspaceId,
            params.itemId,
            (item) => ({
              ...item,
              ...changes,
              data: updatedData,
            }),
          );

          return {
            success: true,
            itemId: params.itemId,
            cardsAdded: newCards.length,
            message: `Added ${newCards.length} card${newCards.length !== 1 ? "s" : ""} to flashcard deck${params.title ? ` and renamed to "${params.title}"` : ""}`,
          };
        }

        if (action === "updateQuiz") {
          if (!params.itemId) {
            throw new Error("Item ID required for updateQuiz");
          }

          const questionsToAdd =
            params.questionsToAdd || (params.quizData as any)?.questionsToAdd;
          const hasQuestions = questionsToAdd && questionsToAdd.length > 0;
          const hasTitle = !!params.title;

          if (!hasQuestions && !hasTitle) {
            throw new Error(
              "Either questions to add or a new title is required for updateQuiz",
            );
          }

          const currentState = await loadWorkspaceItemsForValidation(
            params.workspaceId,
            userId,
          );

          const existingItem = currentState.find(
            (i: any) => i.id === params.itemId,
          );
          if (!existingItem) {
            throw new Error(`Quiz not found with ID: ${params.itemId}`);
          }

          if (existingItem.type !== "quiz") {
            throw new Error(
              `Item "${existingItem.name}" is not a quiz (type: ${existingItem.type})`,
            );
          }

          const existingData = existingItem.data as QuizData;
          const existingQuestions = existingData?.questions || [];

          const updatedData: QuizData = hasQuestions
            ? {
                ...existingData,
                questions: [...existingQuestions, ...questionsToAdd!],
              }
            : existingData;

          const changes: any = hasQuestions ? { data: updatedData } : {};

          if (params.title) {
            const dupError = checkDuplicateName(
              currentState,
              params.title,
              existingItem.type,
              existingItem.folderId ?? null,
              params.itemId,
            );
            if (dupError) {
              return { success: false, message: dupError };
            }
            changes.name = params.title;
          }

          await updateWorkspaceItem(
            params.workspaceId,
            params.itemId,
            (item) => ({
              ...item,
              ...changes,
              ...(hasQuestions ? { data: updatedData } : {}),
            }),
          );

          return {
            success: true,
            itemId: params.itemId,
            questionsAdded: questionsToAdd?.length ?? 0,
            totalQuestions: updatedData.questions.length,
            message: hasQuestions
              ? `Added ${questionsToAdd!.length} question${questionsToAdd!.length !== 1 ? "s" : ""} to quiz`
              : "Quiz title updated.",
          };
        }

        if (action === "updatePdfContent") {
          if (!params.itemId) {
            throw new Error("Item ID required for PDF content update");
          }
          // OCR pages may be omitted only when OCR explicitly failed; otherwise callers must provide the full page array.
          if (
            params.pdfOcrStatus != null &&
            params.pdfOcrStatus !== "failed" &&
            (params.pdfOcrPages === undefined ||
              params.pdfOcrPages.length === 0)
          ) {
            throw new Error(
              "OCR pages required for PDF content update (or ocrStatus: failed)",
            );
          }

          const currentState = await loadWorkspaceItemsForValidation(
            params.workspaceId,
            userId,
          );
          const existingItem = currentState.find(
            (i: any) => i.id === params.itemId,
          );
          if (!existingItem) {
            throw new Error(`PDF not found with ID: ${params.itemId}`);
          }
          if (existingItem.type !== "pdf") {
            throw new Error(
              `Item "${existingItem.name}" is not a PDF (type: ${existingItem.type})`,
            );
          }

          const existingData = existingItem.data as PdfData;
          const updatedData: PdfData = {
            ...existingData,
            ...(params.pdfOcrPages != null && { ocrPages: params.pdfOcrPages }),
            ...(params.pdfOcrStatus != null && {
              ocrStatus: params.pdfOcrStatus,
            }),
            ...(params.pdfOcrError != null && { ocrError: params.pdfOcrError }),
          };

          const changes: Partial<Item> = { data: updatedData };

          if (params.title) {
            const dupError = checkDuplicateName(
              currentState,
              params.title,
              existingItem.type,
              existingItem.folderId ?? null,
              params.itemId,
            );
            if (dupError) {
              return { success: false, message: dupError };
            }
            changes.name = params.title;
          }

          await updateWorkspaceItem(
            params.workspaceId,
            params.itemId,
            (item) => ({
              ...item,
              ...changes,
              data: updatedData,
            }),
          );

          return {
            success: true,
            itemId: params.itemId,
            message: `Cached OCR content for PDF "${existingItem.name}"`,
          };
        }

        if (action === "updateImageContent") {
          if (!params.itemId) {
            throw new Error("Item ID required for image content update");
          }
          // OCR pages may be omitted only when OCR explicitly failed; otherwise callers must provide the full page array.
          if (
            params.imageOcrStatus !== "failed" &&
            params.imageOcrPages === undefined
          ) {
            throw new Error(
              "OCR pages required for image content update (or ocrStatus: failed)",
            );
          }

          const currentState = await loadWorkspaceItemsForValidation(
            params.workspaceId,
            userId,
          );
          const existingItem = currentState.find(
            (i: any) => i.id === params.itemId,
          );
          if (!existingItem) {
            throw new Error(`Image not found with ID: ${params.itemId}`);
          }
          if (existingItem.type !== "image") {
            throw new Error(
              `Item "${existingItem.name}" is not an image (type: ${existingItem.type})`,
            );
          }

          const existingData = existingItem.data as ImageData;
          const updatedData: ImageData = {
            ...existingData,
            ...(params.imageOcrPages != null && {
              ocrPages: params.imageOcrPages,
            }),
            ...(params.imageOcrStatus != null && {
              ocrStatus: params.imageOcrStatus,
            }),
            ...(params.imageOcrError != null && {
              ocrError: params.imageOcrError,
            }),
          };

          const changes: Partial<Item> = { data: updatedData };
          await updateWorkspaceItem(
            params.workspaceId,
            params.itemId,
            (item) => ({
              ...item,
              ...changes,
              data: updatedData,
            }),
          );

          return {
            success: true,
            itemId: params.itemId,
            message:
              params.imageOcrStatus === "failed"
                ? "Marked image OCR as failed"
                : `Cached OCR content for image "${existingItem.name}"`,
          };
        }

        if (action === "edit") {
          if (!params.itemId || !params.itemType) {
            throw new Error("Item ID and itemType required for edit");
          }
          const isRenameOnly =
            params.newName &&
            (params.oldString === undefined || params.oldString === "") &&
            (params.newString === undefined || params.newString === "");
          if (
            !isRenameOnly &&
            (params.oldString === undefined || params.newString === undefined)
          ) {
            throw new Error("oldString and newString required for edit");
          }

          const currentState = await loadWorkspaceItemsForValidation(
            params.workspaceId,
            userId,
          );
          const existingItem = currentState.find(
            (i: Item) => i.id === params.itemId,
          );
          if (!existingItem) {
            throw new Error(`Item not found with ID: ${params.itemId}`);
          }

          const rename = params.newName;
          const replaceAll = !!params.replaceAll;
          const oldStr = String(params.oldString ?? "");
          const newStr = String(params.newString ?? "");

          if (existingItem.type === "flashcard") {
            const data = existingItem.data as FlashcardData;
            const cards: FlashcardItem[] = data.cards ?? [];

            const payload = {
              cards: cards.map((c) => ({
                id: c.id,
                front: c.front,
                back: c.back,
              })),
            };
            let serialized = JSON.stringify(payload, null, 2);
            if (!isRenameOnly) {
              serialized = applyReplace(
                normalizeLineEndings(serialized),
                normalizeLineEndings(oldStr),
                normalizeLineEndings(newStr),
                replaceAll,
              );
            }

            let parsed: {
              cards?: Array<{ id?: string; front?: string; back?: string }>;
            };
            try {
              const parsedResult = parseJsonWithRepair<{
                cards?: Array<{ id?: string; front?: string; back?: string }>;
              }>(serialized);
              parsed = parsedResult.value;
            } catch (e) {
              const detail = e instanceof Error ? e.message : String(e);
              throw new Error(
                `Invalid JSON after edit. The edited flashcard content is not valid JSON (even after repair). ` +
                  `Try replacing a larger unique block, or use full rewrite with oldString='' and a complete {"cards":[...]} JSON object. ` +
                  `Details: ${detail}`,
              );
            }
            if (!Array.isArray(parsed.cards)) {
              throw new Error("Invalid structure: cards must be an array.");
            }

            const newCards: FlashcardItem[] = parsed.cards.map((c) => ({
              id: c.id ?? generateItemId(),
              front: String(c.front ?? ""),
              back: String(c.back ?? ""),
            }));

            const changes: Partial<Item> = {
              data: { ...data, cards: newCards } as FlashcardData,
            };
            if (rename) {
              const dupError = checkDuplicateName(
                currentState,
                rename,
                "flashcard",
                existingItem.folderId ?? null,
                params.itemId,
              );
              if (dupError) {
                return { success: false, message: dupError };
              }
              changes.name = rename;
            }

            await updateWorkspaceItem(
              params.workspaceId,
              params.itemId,
              (item) => ({
                ...item,
                ...changes,
                data: { ...data, cards: newCards } as FlashcardData,
              }),
            );

            return {
              success: true,
              itemId: params.itemId,
              message: `Updated flashcard deck (${newCards.length} cards)`,
              cardCount: newCards.length,
            };
          }

          if (existingItem.type === "quiz") {
            const data = existingItem.data as QuizData;
            const questions = data.questions ?? [];
            const payload = { questions };
            let serialized = JSON.stringify(payload, null, 2);
            if (!isRenameOnly) {
              serialized = applyReplace(
                normalizeLineEndings(serialized),
                normalizeLineEndings(oldStr),
                normalizeLineEndings(newStr),
                replaceAll,
              );
            }

            let parsed: { questions?: QuizQuestion[] };
            try {
              const parsedResult = parseJsonWithRepair<{
                questions?: QuizQuestion[];
              }>(serialized);
              parsed = parsedResult.value;
            } catch (e) {
              const detail = e instanceof Error ? e.message : String(e);
              throw new Error(
                `Invalid JSON after edit. The edited quiz content is not valid JSON (even after repair). ` +
                  `Only edit the {"questions":[...]} JSON, and replace a larger unique block (or do full rewrite with oldString=''). ` +
                  `Details: ${detail}`,
              );
            }
            if (!Array.isArray(parsed.questions)) {
              throw new Error("Invalid structure: questions must be an array.");
            }

            const validatedQuestions: QuizQuestion[] = parsed.questions.map(
              (q, i) => {
                const id = q?.id ?? generateItemId();
                const type =
                  q?.type === "true_false" ? "true_false" : "multiple_choice";
                const questionText = String(q?.questionText ?? "");
                const options = Array.isArray(q?.options)
                  ? q.options.map(String)
                  : [];
                const correctIndex =
                  typeof q?.correctIndex === "number"
                    ? Math.max(0, Math.min(q.correctIndex, options.length - 1))
                    : 0;
                if (
                  (type === "multiple_choice" && options.length !== 4) ||
                  (type === "true_false" && options.length !== 2)
                ) {
                  throw new Error(
                    `Question ${i + 1}: multiple_choice needs 4 options, true_false needs 2`,
                  );
                }
                return {
                  id,
                  type,
                  questionText,
                  options,
                  correctIndex,
                };
              },
            );

            const updatedData: QuizData = {
              ...data,
              questions: validatedQuestions,
            };

            const changes: Partial<Item> = { data: updatedData };
            if (rename) {
              const dupError = checkDuplicateName(
                currentState,
                rename,
                "quiz",
                existingItem.folderId ?? null,
                params.itemId,
              );
              if (dupError) {
                return { success: false, message: dupError };
              }
              changes.name = rename;
            }

            await updateWorkspaceItem(
              params.workspaceId,
              params.itemId,
              (item) => ({
                ...item,
                ...changes,
                data: updatedData,
              }),
            );

            return {
              success: true,
              itemId: params.itemId,
              message: `Updated quiz (${validatedQuestions.length} questions)`,
              questionCount: validatedQuestions.length,
            };
          }

          if (existingItem.type === "document") {
            const changes: Partial<Item> = {};
            const docData = existingItem.data as DocumentData;
            if (rename) {
              const dupError = checkDuplicateName(
                currentState,
                rename,
                "document",
                existingItem.folderId ?? null,
                params.itemId,
              );
              if (dupError) {
                return { success: false, message: dupError };
              }
              changes.name = rename;
            }

            let contentOld = "";
            let contentNew = "";
            if (isRenameOnly) {
              contentOld = "";
              contentNew = "";
            } else {
              if (oldStr === "") {
                contentOld = "";
                contentNew = newStr;
              } else {
                contentOld = normalizeLineEndings(docData.markdown ?? "");
                const normOld = normalizeLineEndings(oldStr);
                const normNew = normalizeLineEndings(newStr);
                contentNew = applyReplace(
                  contentOld,
                  normOld,
                  normNew,
                  replaceAll,
                );
              }
              changes.data = {
                markdown: contentNew,
                ...(params.sources !== undefined
                  ? { sources: params.sources }
                  : docData.sources != null
                    ? { sources: docData.sources }
                    : {}),
              } as DocumentData;
            }

            if (params.sources !== undefined && !changes.data) {
              changes.data = {
                ...docData,
                sources: params.sources,
              } as DocumentData;
            }

            if (Object.keys(changes).length === 0) {
              return {
                success: true,
                itemId: params.itemId,
                message: "No changes to update",
              };
            }

            await updateWorkspaceItem(
              params.workspaceId,
              params.itemId,
              (item) => ({
                ...item,
                ...changes,
                ...(changes.data ? { data: changes.data } : {}),
              }),
            );

            const diffOutput = trimDiff(
              createPatch(
                params.itemName ?? "document",
                normalizeLineEndings(contentOld),
                normalizeLineEndings(contentNew),
              ),
            );
            let filediffAdditions = 0;
            let filediffDeletions = 0;
            for (const ch of diffLines(contentOld, contentNew)) {
              if (ch.added) filediffAdditions += ch.count || 0;
              if (ch.removed) filediffDeletions += ch.count || 0;
            }

            return {
              success: true,
              itemId: params.itemId,
              message: "Updated document successfully",
              diff: diffOutput,
              filediff: {
                additions: filediffAdditions,
                deletions: filediffDeletions,
              },
            };
          }

          if (existingItem.type === "pdf") {
            if (!isRenameOnly || !rename) {
              return {
                success: false,
                message:
                  "PDFs can only be renamed. Use oldString='', newString='', and newName='new name'.",
              };
            }
            const dupError = checkDuplicateName(
              currentState,
              rename,
              "pdf",
              existingItem.folderId ?? null,
              params.itemId,
            );
            if (dupError) {
              return { success: false, message: dupError };
            }
            const changes: Partial<Item> = { name: rename };
            await updateWorkspaceItem(
              params.workspaceId,
              params.itemId,
              (item) => ({
                ...item,
                ...changes,
              }),
            );
            return {
              success: true,
              itemId: params.itemId,
              message: `Renamed PDF to "${rename}"`,
            };
          }

          throw new Error(`Item type "${existingItem.type}" is not editable`);
        }

        if (action === "delete") {
          if (!params.itemId) {
            throw new Error("Item ID required for delete");
          }

          const currentState = await loadWorkspaceItemsForValidation(
            params.workspaceId,
            userId,
          );
          const existingItem = currentState.find(
            (i: any) => i.id === params.itemId,
          );
          await deleteWorkspaceItem(params.workspaceId, params.itemId);

          return {
            success: true,
            itemId: params.itemId,
            message: existingItem
              ? `Deleted \"${existingItem.name}\" successfully`
              : "Deleted item successfully",
          };
        }

        // Fallback for unhandled actions
        return {
          success: false,
          message: `Action ${action} not implemented`,
        };
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : "Unknown error";
        logger.error("[WORKSPACE-WORKER] Error:", errorMessage);
        return {
          success: false,
          message: `Failed: ${errorMessage}`,
        };
      }
    },
    { allowParallel },
  );
}
