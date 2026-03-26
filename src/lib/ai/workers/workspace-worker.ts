import { headers } from "next/headers";
import { createPatch, diffLines } from "diff";
import { auth } from "@/lib/auth";
import { db, workspaces } from "@/lib/db/client";
import { workspaceCollaborators } from "@/lib/db/schema";
import { eq, sql, and } from "drizzle-orm";
import { createEvent } from "@/lib/workspace/events";
import { generateItemId } from "@/lib/workspace-state/item-helpers";
import { getRandomCardColor } from "@/lib/workspace-state/colors";
import { logger } from "@/lib/utils/logger";
import type { Item, NoteData, PdfData, ImageData, QuizData, QuizQuestion, FlashcardData, FlashcardItem } from "@/lib/workspace-state/types";
import { getOcrPagesTextContent } from "@/lib/utils/ocr-pages";
import { markdownToBlocks, fixLLMDoubleEscaping } from "@/lib/editor/markdown-to-blocks";
import { executeWorkspaceOperation } from "./common";
import { loadWorkspaceState } from "@/lib/workspace/state-loader";
import { hasDuplicateName } from "@/lib/workspace/unique-name";
import type { WorkspaceEvent } from "@/lib/workspace/events";
import { replace as applyReplace, trimDiff, normalizeLineEndings } from "@/lib/utils/edit-replace";
import { parseJsonWithRepair } from "@/lib/utils/json-repair";
import { getNoteContentAsMarkdown } from "@/lib/utils/format-workspace-context";
import { serializeBlockNote } from "@/lib/utils/serialize-blocknote";
import type { Block } from "@/components/editor/BlockNoteEditor";
import { buildPdfDataFromUpload } from "@/lib/pdf/pdf-item";

/** Create params for a single item (used by create and bulkCreate). Exported for autogen. */
export type CreateItemParams = {
    id?: string; // Optional pre-generated item ID (if not provided, one is generated)
    title?: string;
    content?: string;
    itemType?: "note" | "flashcard" | "quiz" | "youtube" | "image" | "audio" | "pdf";
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
    imageData?: { url: string; altText?: string; caption?: string; ocrStatus?: ImageData["ocrStatus"]; ocrError?: string; ocrPages?: ImageData["ocrPages"] };
    audioData?: { fileUrl: string; filename: string; fileSize?: number; mimeType?: string; duration?: number };
    sources?: Array<{ title: string; url: string; favicon?: string }>;
    folderId?: string;
    layout?: { x: number; y: number; w: number; h: number };
};

/**
 * Build an Item from create params. Used by both create and bulkCreate.
 */
async function buildItemFromCreateParams(p: CreateItemParams): Promise<Item> {
    const itemId = p.id || generateItemId();
    const itemType = p.itemType || "note";

    let itemData: any;

    if (itemType === "flashcard") {
        if (!p.flashcardData?.cards) throw new Error("Flashcard data required for flashcard creation");
        const cardsWithIds = await Promise.all(
            p.flashcardData.cards.map(async (card) => {
                if (!card || typeof card !== "object") return null;
                const front = fixLLMDoubleEscaping(card.front || "");
                const back = fixLLMDoubleEscaping(card.back || "");
                const [frontBlocks, backBlocks] = await Promise.all([
                    markdownToBlocks(front),
                    markdownToBlocks(back),
                ]);
                return {
                    id: generateItemId(),
                    front,
                    back,
                    frontBlocks,
                    backBlocks,
                };
            })
        ).then((arr) => arr.filter((c): c is NonNullable<typeof c> => c !== null));
        itemData = { cards: cardsWithIds };
    } else if (itemType === "youtube") {
        if (!p.youtubeData?.url) throw new Error("YouTube data required for youtube card creation");
        itemData = { url: p.youtubeData.url };
    } else if (itemType === "image") {
        if (!p.imageData?.url) throw new Error("Image data required for image card creation");
        itemData = {
            url: p.imageData.url,
            altText: p.imageData.altText,
            caption: p.imageData.caption,
            ...(p.imageData.ocrPages != null && { ocrPages: p.imageData.ocrPages }),
            ...(p.imageData.ocrStatus != null && { ocrStatus: p.imageData.ocrStatus }),
            ...(p.imageData.ocrError != null && { ocrError: p.imageData.ocrError }),
        };
    } else if (itemType === "audio") {
        if (!p.audioData?.fileUrl) throw new Error("Audio data required for audio card creation");
        itemData = {
            fileUrl: p.audioData.fileUrl,
            filename: p.audioData.filename || "Recording",
            fileSize: p.audioData.fileSize,
            mimeType: p.audioData.mimeType,
            duration: p.audioData.duration,
            processingStatus: "processing",
        };
    } else if (itemType === "pdf") {
        if (!p.pdfData?.fileUrl) throw new Error("PDF data required for pdf card creation");
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
    } else {
        const normalizedContent = p.content ? fixLLMDoubleEscaping(p.content) : "";
        const blockContent = normalizedContent ? await markdownToBlocks(normalizedContent) : undefined;
        itemData = {
            field1: normalizedContent,
            blockContent,
            ...(p.sources?.length && { sources: p.sources }),
        };
    }

    const defaultNames: Record<string, string> = {
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
        name: p.title || defaultNames[itemType] || "New Note",
        subtitle: "",
        data: itemData,
        color: getRandomCardColor(),
        folderId: p.folderId,
        ...(p.layout && { layout: p.layout }),
    };
}

/**
 * Parse the PostgreSQL result from append_workspace_event
 * Returns { version: number, conflict: boolean }
 * Defensively handles various formats and falls back to safe defaults on parse failure.
 */
function parseAppendResult(rawResult: string | any): { version: number; conflict: boolean } {
    // If it's already an object, try to extract version and conflict
    if (typeof rawResult === 'object' && rawResult !== null) {
        // Coerce version to number, handling string-typed fields
        const versionNum = typeof rawResult.version === 'number'
            ? rawResult.version
            : Number(rawResult.version);
        const version = isNaN(versionNum) ? 0 : versionNum;

        // Normalize conflict from boolean or string ('t'/'f'/'true'/'false')
        let conflict = false;
        if (typeof rawResult.conflict === 'boolean') {
            conflict = rawResult.conflict;
        } else if (typeof rawResult.conflict === 'string') {
            const conflictStr = rawResult.conflict.toLowerCase().trim();
            conflict = conflictStr === 't' || conflictStr === 'true';
        }

        return { version, conflict };
    }

    // PostgreSQL returns result as string like "(6,t)" - need to parse it
    // Make regex more lenient: allow whitespace, case-insensitive, accept 'true'/'false'
    const resultString = typeof rawResult === 'string' ? rawResult : String(rawResult);
    // Match: (number, t|f|true|false) with optional whitespace
    const match = resultString.match(/\(\s*(\d+)\s*,\s*(t|f|true|false)\s*\)/i);

    if (!match) {
        logger.error(`[WORKSPACE-WORKER] Failed to parse PostgreSQL result:`, rawResult);
        // Fall back to safe defaults instead of throwing
        return { version: 0, conflict: false };
    }

    const versionNum = parseInt(match[1], 10);
    const conflictStr = match[2].toLowerCase();
    const conflict = conflictStr === 't' || conflictStr === 'true';

    return {
        version: isNaN(versionNum) ? 0 : versionNum,
        conflict,
    };
}

/**
 * WORKER 3: Workspace Management Agent
 * Manages workspace items (create, update, delete notes)
 * Operations are serialized per workspace to prevent version conflicts
 */
export async function workspaceWorker(
    action: "create" | "bulkCreate" | "update" | "delete" | "edit" | "updateFlashcard" | "updateQuiz" | "updatePdfContent" | "updateImageContent",
    params: {
        workspaceId: string;
        /** For bulkCreate: array of create params (no workspaceId). Items are built and appended as one BULK_ITEMS_CREATED event. */
        items?: CreateItemParams[];
        title?: string;
        content?: string; // For create
        /** Cline convention: oldString+newString. oldString='' = full rewrite, else targeted edit (update only) */
        oldString?: string;
        newString?: string;
        replaceAll?: boolean;
        itemId?: string;
        /** Display name for diff header (e.g. note title) */
        itemName?: string;
        /** Rename the item (edit action) */
        newName?: string;

        itemType?: "note" | "flashcard" | "quiz" | "youtube" | "image" | "audio" | "pdf"; // Defaults to "note" if undefined
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
    }
): Promise<{ success: boolean; message: string; itemId?: string; cardsAdded?: number; cardCount?: number; event?: WorkspaceEvent; version?: number }> {
    // For "create" and "bulkCreate" operations, allow parallel execution (bypass queue)
    // For "update" and "delete" operations, serialize via queue
    const allowParallel = action === "create" || action === "bulkCreate";

    return executeWorkspaceOperation(params.workspaceId, async () => {
        try {
            logger.debug("📝 [WORKSPACE-WORKER] Action:", action, params);

            // Get current user
            const session = await auth.api.getSession({
                headers: await headers(),
            });
            if (!session) {
                throw new Error("User not authenticated");
            }
            const userId = session.user.id;
            const userName = session.user.name || session.user.email || undefined;

            // Verify workspace access - owner OR editor collaborator
            const workspace = await db
                .select({ userId: workspaces.userId })
                .from(workspaces)
                .where(eq(workspaces.id, params.workspaceId))
                .limit(1);

            if (!workspace[0]) {
                throw new Error("Workspace not found");
            }

            // Check if user is owner
            const isOwner = workspace[0].userId === userId;

            // If not owner, check if user is an editor collaborator
            if (!isOwner) {
                const [collaborator] = await db
                    .select({ permissionLevel: workspaceCollaborators.permissionLevel })
                    .from(workspaceCollaborators)
                    .where(
                        and(
                            eq(workspaceCollaborators.workspaceId, params.workspaceId),
                            eq(workspaceCollaborators.userId, userId)
                        )
                    )
                    .limit(1);

                if (!collaborator || collaborator.permissionLevel !== 'editor') {
                    throw new Error("Access denied - editor permission required");
                }
            }


            // Handle different actions
            if (action === "create") {
                const item = await buildItemFromCreateParams(params);
                const currentState = await loadWorkspaceState(params.workspaceId);
                if (hasDuplicateName(currentState.items, item.name, item.type, item.folderId ?? null)) {
                    return {
                        success: false,
                        message: `A ${item.type} named "${item.name}" already exists in this folder`,
                    };
                }
                const event = createEvent("ITEM_CREATED", { id: item.id, item }, userId, userName);

                // For create operations, retry on version conflicts since creates are independent
                // The database uses FOR UPDATE which serializes, but parallel creates may still
                // read the same baseVersion before the lock, causing conflicts. Retry with the
                // conflict version (which the DB returns) to handle this gracefully.
                let baseVersion = 0;
                let appendResult: { version: number; conflict: boolean } = { version: 0, conflict: false };
                const maxRetries = 2; // Conflicts should be rare due to FOR UPDATE lock
                let retryCount = 0;

                // Get initial version
                const currentVersionResult = await db.execute(sql`
          SELECT get_workspace_version(${params.workspaceId}::uuid) as version
        `);
                const baseVersionRaw = currentVersionResult[0]?.version;
                baseVersion =
                    typeof baseVersionRaw === "number"
                        ? baseVersionRaw
                        : Number(baseVersionRaw) || 0;
                appendResult = { version: baseVersion, conflict: false };

                while (retryCount <= maxRetries) {
                    const eventResult = await db.execute(sql`
            SELECT append_workspace_event(
              ${params.workspaceId}::uuid,
              ${event.id}::text,
              ${event.type}::text,
              ${JSON.stringify(event.payload)}::jsonb,
              ${event.timestamp}::bigint,
              ${event.userId}::text,
              ${baseVersion}::integer,
              ${event.userName ?? null}::text
            ) as result
          `);

                    if (!eventResult || eventResult.length === 0) {
                        throw new Error(`Failed to create ${item.type}`);
                    }

                    appendResult = parseAppendResult(eventResult[0].result);

                    // If no conflict, we're done
                    if (!appendResult.conflict) {
                        break;
                    }

                    // Conflict occurred - use the version returned by the DB for retry
                    // This is more efficient than re-reading get_workspace_version
                    baseVersion = appendResult.version;
                    retryCount++;

                    if (retryCount <= maxRetries) {
                        logger.debug(`🔄 [WORKSPACE-WORKER] Version conflict on create, retrying (attempt ${retryCount + 1}/${maxRetries + 1}):`, {
                            expectedVersion: baseVersion - 1,
                            currentVersion: baseVersion,
                        });
                    }
                }

                // If we still have a conflict after retries, throw error
                if (appendResult.conflict) {
                    throw new Error("Workspace was modified by another user, please try again");
                }

                logger.info(`📝 [WORKSPACE-WORKER] Created ${item.type}:`, item.name);

                // Include card count for flashcard decks (use created item.data.cards, not params)
                const flashcardCards = item.type === "flashcard" && item.data && "cards" in item.data
                    ? (item.data as { cards: unknown[] }).cards
                    : undefined;
                const cardCount = Array.isArray(flashcardCards)
                    ? flashcardCards.filter((c: unknown) => c != null && typeof c === "object").length
                    : undefined;

                return {
                    success: true,
                    itemId: item.id,
                    message: `Created ${item.type} "${item.name}" successfully`,
                    cardCount,
                    event,
                    version: appendResult.version,
                };
            }

            if (action === "bulkCreate") {
                if (!params.items?.length) {
                    throw new Error("bulkCreate requires a non-empty items array");
                }

                const items = await Promise.all(params.items.map((p) => buildItemFromCreateParams(p)));
                const event = createEvent("BULK_ITEMS_CREATED", { items }, userId, userName);

                const currentVersionResult = await db.execute(sql`
                    SELECT get_workspace_version(${params.workspaceId}::uuid) as version
                `);
                const baseVersion = Number(currentVersionResult[0]?.version) || 0;

                const eventResult = await db.execute(sql`
                    SELECT append_workspace_event(
                        ${params.workspaceId}::uuid,
                        ${event.id}::text,
                        ${event.type}::text,
                        ${JSON.stringify(event.payload)}::jsonb,
                        ${event.timestamp}::bigint,
                        ${event.userId}::text,
                        ${baseVersion}::integer,
                        ${event.userName ?? null}::text
                    ) as result
                `);

                if (!eventResult || eventResult.length === 0) {
                    throw new Error("Failed to bulk create items");
                }

                const appendResult = parseAppendResult(eventResult[0].result);
                if (appendResult.conflict) {
                    throw new Error("Workspace was modified by another user, please try again");
                }

                logger.info(`📝 [WORKSPACE-WORKER] Bulk created ${items.length} items`);
                return {
                    success: true,
                    message: `Bulk created ${items.length} items successfully`,
                    version: appendResult.version,
                    itemIds: items.map((i) => i.id),
                };
            }

            if (action === "update") {
                try {
                    logger.group("📝 [UPDATE-NOTE] Starting update operation", true);
                    logger.debug("Raw params received:", {
                        paramsType: typeof params,
                        paramsKeys: params ? Object.keys(params) : [],
                        paramsValue: params,
                    });
                    logger.debug("Input parameters:", {
                        itemId: params?.itemId,
                        itemIdType: typeof params?.itemId,
                        workspaceId: params?.workspaceId,
                        workspaceIdType: typeof params?.workspaceId,
                        userId,
                    });
                    logger.groupEnd();

                    if (!params) {
                        logger.error("❌ [UPDATE-NOTE] Params object is missing");
                        throw new Error("Params object is required for update");
                    }

                    if (!params.itemId) {
                        logger.error("❌ [UPDATE-NOTE] Item ID required for update");
                        throw new Error("Item ID required for update");
                    }

                    if (typeof params.itemId !== 'string') {
                        logger.error("❌ [UPDATE-NOTE] Item ID must be a string");
                        throw new Error("Item ID must be a string");
                    }

                    if (!params.workspaceId) {
                        logger.error("❌ [UPDATE-NOTE] Workspace ID required for update");
                        throw new Error("Workspace ID required for update");
                    }

                    if (typeof params.workspaceId !== 'string') {
                        logger.error("❌ [UPDATE-NOTE] Workspace ID must be a string");
                        throw new Error("Workspace ID must be a string");
                    }

                    const changes: Partial<Item> = {};

                    // Update title if provided
                    if (params.title !== undefined) {
                        const titleStr = typeof params.title === 'string' ? params.title : String(params.title);
                        logger.debug("📝 [UPDATE-NOTE] Updating title:", {
                            newTitle: titleStr,
                        });
                        changes.name = titleStr;
                    }

                    // Update content: Cline convention (oldString + newString)
                    let contentOld = "";
                    let contentNew = "";
                    let diffOutput = "";
                    let filediffAdditions = 0;
                    let filediffDeletions = 0;

                    if (params.oldString !== undefined && params.newString !== undefined) {
                        const oldStr = typeof params.oldString === "string" ? params.oldString : String(params.oldString);
                        const newStr = typeof params.newString === "string" ? params.newString : String(params.newString);
                        const replaceAll = !!params.replaceAll;

                        if (oldStr === newStr) {
                            throw new Error("No changes to apply: oldString and newString are identical.");
                        }

                        if (oldStr === "") {
                            // Full rewrite: newString is entire note content
                            contentOld = "";
                            contentNew = newStr;
                        } else {
                            // Targeted edit: load note, find and replace
                            const currentState = await loadWorkspaceState(params.workspaceId);
                            const existingItem = currentState.items.find((i: Item) => i.id === params.itemId);
                            if (!existingItem) {
                                throw new Error(`Note not found with ID: ${params.itemId}`);
                            }
                            if (existingItem.type !== "note") {
                                throw new Error(`Item "${existingItem.name}" is not a note (type: ${existingItem.type})`);
                            }
                            contentOld = normalizeLineEndings(getNoteContentAsMarkdown(existingItem.data as NoteData));
                            const normOld = normalizeLineEndings(oldStr);
                            const normNew = normalizeLineEndings(newStr);
                            contentNew = applyReplace(contentOld, normOld, normNew, replaceAll);
                        }

                        contentNew = fixLLMDoubleEscaping(contentNew);

                        logger.time("📝 [UPDATE-NOTE] markdownToBlocks conversion");
                        const blockContent = await markdownToBlocks(contentNew);
                        logger.timeEnd("📝 [UPDATE-NOTE] markdownToBlocks conversion");

                        changes.data = {
                            field1: contentNew,
                            blockContent,
                        } as NoteData;

                        const patchName = params.itemName ?? "note";
                        diffOutput = trimDiff(
                            createPatch(
                                patchName,
                                normalizeLineEndings(contentOld),
                                normalizeLineEndings(contentNew)
                            )
                        );
                        for (const change of diffLines(contentOld, contentNew)) {
                            if (change.added) filediffAdditions += change.count || 0;
                            if (change.removed) filediffDeletions += change.count || 0;
                        }
                    }

                    // Update sources if provided
                    if (params.sources !== undefined) {
                        if (!changes.data) {
                            changes.data = {} as NoteData;
                        }
                        (changes.data as NoteData).sources = params.sources;
                        logger.debug("📚 [UPDATE-NOTE] Updating sources:", {
                            count: params.sources.length,
                            sources: params.sources,
                        });
                    }

                    // If no changes, return early
                    if (Object.keys(changes).length === 0) {
                        logger.warn("⚠️ [UPDATE-NOTE] No changes detected, returning early");
                        return {
                            success: true,
                            message: "No changes to update",
                            itemId: params.itemId,
                        };
                    }

                    const currentState = await loadWorkspaceState(params.workspaceId);
                    const existingItem = currentState.items.find((i: any) => i.id === params.itemId);
                    const itemName = (changes as Partial<Item>).name ?? existingItem?.name;
                    const newFolderId = (changes as Partial<Item>).folderId ?? existingItem?.folderId ?? null;

                    if (itemName && existingItem) {
                        if (hasDuplicateName(currentState.items, itemName, existingItem.type, newFolderId, params.itemId)) {
                            return {
                                success: false,
                                message: `A ${existingItem.type} named "${itemName}" already exists in this folder`,
                            };
                        }
                    }

                    logger.time("📝 [UPDATE-NOTE] Event creation");
                    const event = createEvent("ITEM_UPDATED", { id: params.itemId, changes, source: 'agent', name: itemName }, userId, userName);
                    logger.timeEnd("📝 [UPDATE-NOTE] Event creation");

                    logger.time("📝 [UPDATE-NOTE] Get workspace version");
                    const currentVersionResult = await db.execute(sql`
            SELECT get_workspace_version(${params.workspaceId}::uuid) as version
          `);
                    logger.timeEnd("📝 [UPDATE-NOTE] Get workspace version");

                    const baseVersion = currentVersionResult[0]?.version || 0;
                    logger.debug("📝 [UPDATE-NOTE] Current workspace version:", baseVersion);

                    logger.time("📝 [UPDATE-NOTE] Append workspace event");
                    const eventResult = await db.execute(sql`
            SELECT append_workspace_event(
              ${params.workspaceId}::uuid,
              ${event.id}::text,
              ${event.type}::text,
              ${JSON.stringify(event.payload)}::jsonb,
              ${event.timestamp}::bigint,
              ${event.userId}::text,
              ${baseVersion}::integer,
              ${event.userName ?? null}::text
            ) as result
          `);
                    logger.timeEnd("📝 [UPDATE-NOTE] Append workspace event");

                    if (!eventResult || eventResult.length === 0) {
                        logger.error("❌ [UPDATE-NOTE] Failed to append event - no result returned");
                        throw new Error("Failed to update note");
                    }

                    const appendResult = parseAppendResult(eventResult[0].result);

                    if (appendResult.conflict) {
                        logger.error("❌ [UPDATE-NOTE] Conflict detected - workspace was modified by another user");
                        throw new Error("Workspace was modified by another user, please try again");
                    }

                    logger.group("✅ [UPDATE-NOTE] Update completed successfully", true);
                    logger.groupEnd();

                    const result: {
                        success: boolean;
                        itemId?: string;
                        message: string;
                        event?: WorkspaceEvent;
                        version?: number;
                        diff?: string;
                        filediff?: { additions: number; deletions: number };
                    } = {
                        success: true,
                        itemId: params.itemId,
                        message: `Updated note successfully`,
                        event,
                        version: appendResult.version,
                    };
                    if (diffOutput) {
                        result.diff = diffOutput;
                        result.filediff = { additions: filediffAdditions, deletions: filediffDeletions };
                    }
                    return result;
                } catch (error: any) {
                    logger.group("❌ [UPDATE-NOTE] Error during update operation", false);
                    logger.error("Error type:", error?.constructor?.name || typeof error);
                    logger.error("Error message:", error?.message || String(error));
                    logger.error("Full error object:", error);
                    logger.groupEnd();

                    // Re-throw to be handled by the caller
                    throw error;
                }
            }

            if (action === "updateFlashcard") {
                if (!params.itemId) {
                    throw new Error("Item ID required for flashcard update");
                }
                if (!params.flashcardData?.cardsToAdd || params.flashcardData.cardsToAdd.length === 0) {
                    throw new Error("Cards to add required for flashcard update");
                }

                // Use helper to load current state (duplicated logic removed)
                const currentState = await loadWorkspaceState(params.workspaceId);

                const existingItem = currentState.items.find((i: any) => i.id === params.itemId);
                if (!existingItem) {
                    throw new Error(`Flashcard deck not found with ID: ${params.itemId}`);
                }

                if (existingItem.type !== "flashcard") {
                    throw new Error(`Item "${existingItem.name}" is not a flashcard deck (type: ${existingItem.type})`);
                }

                const existingData = existingItem.data as { cards?: any[] };
                const existingCards = existingData?.cards || [];

                // Generate new cards with IDs and parsed blocks
                const newCards = await Promise.all(
                    params.flashcardData.cardsToAdd.map(async (card) => {
                        const frontBlocks = await markdownToBlocks(card.front);
                        const backBlocks = await markdownToBlocks(card.back);
                        return {
                            id: generateItemId(),
                            front: card.front,
                            back: card.back,
                            frontBlocks,
                            backBlocks,
                        };
                    })
                );

                // Merge existing cards with new cards
                const updatedData = {
                    ...existingData,
                    cards: [...existingCards, ...newCards],
                };

                const changes: any = { data: updatedData };

                // Handle title update if provided
                if (params.title) {
                    logger.debug("🎴 [UPDATE-FLASHCARD] Updating title:", params.title);
                    if (hasDuplicateName(currentState.items, params.title, existingItem.type, existingItem.folderId ?? null, params.itemId)) {
                        return {
                            success: false,
                            message: `A ${existingItem.type} named "${params.title}" already exists in this folder`,
                        };
                    }
                    changes.name = params.title;
                }

                const event = createEvent("ITEM_UPDATED", { id: params.itemId, changes, source: 'agent', name: (changes.name ?? existingItem.name) }, userId, userName);

                const currentVersionResult = await db.execute(sql`
          SELECT get_workspace_version(${params.workspaceId}::uuid) as version
        `);

                const baseVersion = currentVersionResult[0]?.version || 0;

                const eventResult = await db.execute(sql`
          SELECT append_workspace_event(
            ${params.workspaceId}::uuid,
            ${event.id}::text,
            ${event.type}::text,
            ${JSON.stringify(event.payload)}::jsonb,
            ${event.timestamp}::bigint,
              ${event.userId}::text,
              ${baseVersion}::integer,
              ${event.userName ?? null}::text
          ) as result
        `);

                if (!eventResult || eventResult.length === 0) {
                    throw new Error("Failed to update flashcard deck: database returned no result");
                }

                const appendResult = parseAppendResult(eventResult[0].result);

                if (appendResult.conflict) {
                    throw new Error("Workspace was modified by another user, please try again");
                }

                logger.info("🎴 [WORKSPACE-WORKER] Updated flashcard deck:", {
                    itemId: params.itemId,
                    cardsAdded: newCards.length,
                    totalCards: updatedData.cards.length,
                    newTitle: params.title
                });

                return {
                    success: true,
                    itemId: params.itemId,
                    cardsAdded: newCards.length,
                    message: `Added ${newCards.length} card${newCards.length !== 1 ? 's' : ''} to flashcard deck${params.title ? ` and renamed to "${params.title}"` : ''}`,
                    event,
                    version: appendResult.version,
                };
            }

            if (action === "updateQuiz") {
                if (!params.itemId) {
                    throw new Error("Item ID required for updateQuiz");
                }

                const questionsToAdd = params.questionsToAdd || (params.quizData as any)?.questionsToAdd;
                const hasQuestions = questionsToAdd && questionsToAdd.length > 0;
                const hasTitle = !!params.title;

                if (!hasQuestions && !hasTitle) {
                    throw new Error("Either questions to add or a new title is required for updateQuiz");
                }

                logger.debug("🎯 [WORKSPACE-WORKER] Updating quiz:", {
                    itemId: params.itemId,
                    questionsToAdd: questionsToAdd?.length ?? 0,
                    titleUpdate: hasTitle,
                });

                const currentState = await loadWorkspaceState(params.workspaceId);

                const existingItem = currentState.items.find((i: any) => i.id === params.itemId);
                if (!existingItem) {
                    throw new Error(`Quiz not found with ID: ${params.itemId}`);
                }

                if (existingItem.type !== "quiz") {
                    throw new Error(`Item "${existingItem.name}" is not a quiz (type: ${existingItem.type})`);
                }

                const existingData = existingItem.data as QuizData;
                const existingQuestions = existingData?.questions || [];

                const updatedData: QuizData = hasQuestions
                    ? { ...existingData, questions: [...existingQuestions, ...questionsToAdd!] }
                    : existingData;

                const changes: any = hasQuestions ? { data: updatedData } : {};

                if (params.title) {
                    logger.debug("🎯 [UPDATE-QUIZ] Updating title:", params.title);
                    if (hasDuplicateName(currentState.items, params.title, existingItem.type, existingItem.folderId ?? null, params.itemId)) {
                        return {
                            success: false,
                            message: `A ${existingItem.type} named "${params.title}" already exists in this folder`,
                        };
                    }
                    changes.name = params.title;
                }

                const event = createEvent("ITEM_UPDATED", { id: params.itemId, changes, source: 'agent', name: (changes.name ?? existingItem.name) }, userId, userName);

                logger.debug("📝 [UPDATE-QUIZ-DB] Created event:", {
                    eventId: event.id,
                    eventType: event.type,
                    payloadId: event.payload.id,
                    questionsInPayload: (event.payload.changes?.data as any)?.questions?.length,
                });

                const currentVersionResult = await db.execute(sql`
          SELECT get_workspace_version(${params.workspaceId}::uuid) as version
        `);

                const baseVersion = currentVersionResult[0]?.version || 0;
                logger.debug("📝 [UPDATE-QUIZ-DB] Current version:", { baseVersion });

                logger.debug("📝 [UPDATE-QUIZ-DB] Calling append_workspace_event...");
                const eventResult = await db.execute(sql`
          SELECT append_workspace_event(
            ${params.workspaceId}::uuid,
            ${event.id}::text,
            ${event.type}::text,
            ${JSON.stringify(event.payload)}::jsonb,
            ${event.timestamp}::bigint,
            ${event.userId}::text,
            ${baseVersion}::integer,
            ${event.userName ?? null}::text
          ) as result
        `);

                logger.info("📝 [UPDATE-QUIZ-DB] append_workspace_event result:", {
                    hasResult: !!eventResult,
                    resultLength: eventResult?.length,
                    rawResult: JSON.stringify(eventResult),
                });

                if (!eventResult || eventResult.length === 0) {
                    logger.error("❌ [UPDATE-QUIZ-DB] No result from append_workspace_event");
                    throw new Error("Failed to update quiz: database returned no result");
                }

                const appendResult = parseAppendResult(eventResult[0].result);
                logger.info("📝 [UPDATE-QUIZ-DB] Parsed result:", {
                    version: appendResult.version,
                    conflict: appendResult.conflict,
                });

                if (appendResult.conflict) {
                    logger.error("❌ [UPDATE-QUIZ-DB] Version conflict detected");
                    throw new Error("Workspace was modified by another user, please try again");
                }

                logger.info("🎯 [WORKSPACE-WORKER] Updated quiz:", {
                    itemId: params.itemId,
                    questionsAdded: questionsToAdd?.length ?? 0,
                    totalQuestions: updatedData.questions.length,
                });

                return {
                    success: true,
                    itemId: params.itemId,
                    questionsAdded: questionsToAdd?.length ?? 0,
                    totalQuestions: updatedData.questions.length,
                    message: hasQuestions
                        ? `Added ${questionsToAdd!.length} question${questionsToAdd!.length !== 1 ? "s" : ""} to quiz`
                        : "Quiz title updated.",
                    event,
                    version: appendResult.version,
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
                    (params.pdfOcrPages === undefined || params.pdfOcrPages.length === 0)
                ) {
                    throw new Error("OCR pages required for PDF content update (or ocrStatus: failed)");
                }

                const currentState = await loadWorkspaceState(params.workspaceId);
                const existingItem = currentState.items.find((i: any) => i.id === params.itemId);
                if (!existingItem) {
                    throw new Error(`PDF not found with ID: ${params.itemId}`);
                }
                if (existingItem.type !== "pdf") {
                    throw new Error(`Item "${existingItem.name}" is not a PDF (type: ${existingItem.type})`);
                }

                const existingData = existingItem.data as PdfData;
                const updatedData: PdfData = {
                    ...existingData,
                    ...(params.pdfOcrPages != null && { ocrPages: params.pdfOcrPages }),
                    ...(params.pdfOcrStatus != null && { ocrStatus: params.pdfOcrStatus }),
                    ...(params.pdfOcrError != null && { ocrError: params.pdfOcrError }),
                };

                const changes: Partial<Item> = { data: updatedData };

                if (params.title) {
                    if (hasDuplicateName(currentState.items, params.title, existingItem.type, existingItem.folderId ?? null, params.itemId)) {
                        return {
                            success: false,
                            message: `A ${existingItem.type} named "${params.title}" already exists in this folder`,
                        };
                    }
                    changes.name = params.title;
                }

                const event = createEvent("ITEM_UPDATED", { id: params.itemId, changes, source: 'agent', name: (changes.name ?? existingItem.name) }, userId, userName);

                const currentVersionResult = await db.execute(sql`
          SELECT get_workspace_version(${params.workspaceId}::uuid) as version
        `);
                const baseVersion = currentVersionResult[0]?.version || 0;

                const eventResult = await db.execute(sql`
          SELECT append_workspace_event(
            ${params.workspaceId}::uuid,
            ${event.id}::text,
            ${event.type}::text,
            ${JSON.stringify(event.payload)}::jsonb,
            ${event.timestamp}::bigint,
              ${event.userId}::text,
              ${baseVersion}::integer,
              ${event.userName ?? null}::text
          ) as result
        `);

                if (!eventResult || eventResult.length === 0) {
                    throw new Error("Failed to update PDF content: database returned no result");
                }

                const appendResult = parseAppendResult(eventResult[0].result);
                if (appendResult.conflict) {
                    throw new Error("Workspace was modified by another user, please try again");
                }

                const contentLen = getOcrPagesTextContent(params.pdfOcrPages).length;
                logger.info("📄 [WORKSPACE-WORKER] Updated PDF OCR content:", {
                    itemId: params.itemId,
                    contentLength: contentLen,
                });

                return {
                    success: true,
                    itemId: params.itemId,
                    message: `Cached OCR content for PDF "${existingItem.name}" (${contentLen} chars)`,
                    event,
                    version: appendResult.version,
                };
            }

            if (action === "updateImageContent") {
                if (!params.itemId) {
                    throw new Error("Item ID required for image content update");
                }
                // OCR pages may be omitted only when OCR explicitly failed; otherwise callers must provide the full page array.
                if (params.imageOcrStatus !== "failed" && params.imageOcrPages === undefined) {
                    throw new Error("OCR pages required for image content update (or ocrStatus: failed)");
                }

                const currentState = await loadWorkspaceState(params.workspaceId);
                const existingItem = currentState.items.find((i: any) => i.id === params.itemId);
                if (!existingItem) {
                    throw new Error(`Image not found with ID: ${params.itemId}`);
                }
                if (existingItem.type !== "image") {
                    throw new Error(`Item "${existingItem.name}" is not an image (type: ${existingItem.type})`);
                }

                const existingData = existingItem.data as ImageData;
                const updatedData: ImageData = {
                    ...existingData,
                    ...(params.imageOcrPages != null && { ocrPages: params.imageOcrPages }),
                    ...(params.imageOcrStatus != null && { ocrStatus: params.imageOcrStatus }),
                    ...(params.imageOcrError != null && { ocrError: params.imageOcrError }),
                };

                const changes: Partial<Item> = { data: updatedData };
                const event = createEvent("ITEM_UPDATED", { id: params.itemId, changes, source: "agent", name: existingItem.name }, userId, userName);

                const currentVersionResult = await db.execute(sql`
          SELECT get_workspace_version(${params.workspaceId}::uuid) as version
        `);
                const baseVersion = currentVersionResult[0]?.version || 0;

                const eventResult = await db.execute(sql`
          SELECT append_workspace_event(
            ${params.workspaceId}::uuid,
            ${event.id}::text,
            ${event.type}::text,
            ${JSON.stringify(event.payload)}::jsonb,
            ${event.timestamp}::bigint,
            ${event.userId}::text,
            ${baseVersion}::integer,
            ${event.userName ?? null}::text
          ) as result
        `);

                if (!eventResult || eventResult.length === 0) {
                    throw new Error("Failed to update image content: database returned no result");
                }

                const appendResult = parseAppendResult(eventResult[0].result);
                if (appendResult.conflict) {
                    throw new Error("Workspace was modified by another user, please try again");
                }

                return {
                    success: true,
                    itemId: params.itemId,
                    message: params.imageOcrStatus === "failed" ? "Marked image OCR as failed" : `Cached OCR content for image "${existingItem.name}"`,
                    event,
                    version: appendResult.version,
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
                if (!isRenameOnly && (params.oldString === undefined || params.newString === undefined)) {
                    throw new Error("oldString and newString required for edit");
                }

                const currentState = await loadWorkspaceState(params.workspaceId);
                const existingItem = currentState.items.find((i: Item) => i.id === params.itemId);
                if (!existingItem) {
                    throw new Error(`Item not found with ID: ${params.itemId}`);
                }

                const rename = params.newName;
                const replaceAll = !!params.replaceAll;
                const oldStr = String(params.oldString ?? "");
                const newStr = String(params.newString ?? "");

                if (existingItem.type === "note") {
                    const changes: Partial<Item> = {};
                    if (rename) {
                        if (hasDuplicateName(currentState.items, rename, "note", existingItem.folderId ?? null, params.itemId)) {
                            return { success: false, message: `A note named "${rename}" already exists in this folder` };
                        }
                        changes.name = rename;
                    }

                    let contentOld = "";
                    let contentNew = "";
                    if (isRenameOnly) {
                        contentOld = "";
                        contentNew = "";
                        // Skip content update - only apply rename via changes.name above
                    } else {
                        if (oldStr === "") {
                            contentOld = "";
                            contentNew = newStr;
                        } else {
                            contentOld = normalizeLineEndings(getNoteContentAsMarkdown(existingItem.data as NoteData));
                            const normOld = normalizeLineEndings(oldStr);
                            const normNew = normalizeLineEndings(newStr);
                            contentNew = applyReplace(contentOld, normOld, normNew, replaceAll);
                        }
                        contentNew = fixLLMDoubleEscaping(contentNew);
                        const blockContent = await markdownToBlocks(contentNew);
                        changes.data = { field1: contentNew, blockContent } as NoteData;
                        if (params.sources !== undefined) {
                            (changes.data as NoteData).sources = params.sources;
                        }
                    }

                    if (Object.keys(changes).length === 0) {
                        return { success: true, itemId: params.itemId, message: "No changes to update" };
                    }

                    const itemName = (changes.name ?? existingItem.name) as string;
                    const event = createEvent("ITEM_UPDATED", { id: params.itemId, changes, source: "agent", name: itemName }, userId, userName);
                    const currentVersionResult = await db.execute(sql`
                        SELECT get_workspace_version(${params.workspaceId}::uuid) as version
                    `);
                    const baseVersion = currentVersionResult[0]?.version || 0;
                    const eventResult = await db.execute(sql`
                        SELECT append_workspace_event(
                            ${params.workspaceId}::uuid, ${event.id}::text, ${event.type}::text,
                            ${JSON.stringify(event.payload)}::jsonb, ${event.timestamp}::bigint, ${event.userId}::text,
                            ${baseVersion}::integer, ${event.userName ?? null}::text
                        ) as result
                    `);
                    if (!eventResult?.length) throw new Error("Failed to update note");
                    const appendResult = parseAppendResult(eventResult[0].result);
                    if (appendResult.conflict) throw new Error("Workspace was modified by another user, please try again");

                    const diffOutput = trimDiff(
                        createPatch(params.itemName ?? "note", normalizeLineEndings(contentOld), normalizeLineEndings(contentNew))
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
                        message: "Updated note successfully",
                        event,
                        version: appendResult.version,
                        diff: diffOutput,
                        filediff: { additions: filediffAdditions, deletions: filediffDeletions },
                    };
                }

                if (existingItem.type === "flashcard") {
                    const data = existingItem.data as FlashcardData;
                    let cards: FlashcardItem[] = data.cards ?? [];
                    if (cards.length === 0 && (data.front || data.back)) {
                        const front = data.front ?? "";
                        const back = data.back ?? "";
                        cards = [{ id: "legacy", front, back }];
                    }

                    const payload = {
                        cards: cards.map((c) => ({
                            id: c.id,
                            front: c.frontBlocks ? serializeBlockNote(c.frontBlocks as Block[]) : c.front,
                            back: c.backBlocks ? serializeBlockNote(c.backBlocks as Block[]) : c.back,
                        })),
                    };
                    let serialized = JSON.stringify(payload, null, 2);
                    if (!isRenameOnly) {
                        serialized = applyReplace(
                            normalizeLineEndings(serialized),
                            normalizeLineEndings(oldStr),
                            normalizeLineEndings(newStr),
                            replaceAll
                        );
                    }

                    let parsed: { cards?: Array<{ id?: string; front?: string; back?: string }> };
                    try {
                        const parsedResult = parseJsonWithRepair<{ cards?: Array<{ id?: string; front?: string; back?: string }> }>(
                            serialized
                        );
                        parsed = parsedResult.value;
                    } catch (e) {
                        const detail = e instanceof Error ? e.message : String(e);
                        throw new Error(
                            `Invalid JSON after edit. The edited flashcard content is not valid JSON (even after repair). ` +
                            `Try replacing a larger unique block, or use full rewrite with oldString='' and a complete {"cards":[...]} JSON object. ` +
                            `Details: ${detail}`
                        );
                    }
                    if (!Array.isArray(parsed.cards)) {
                        throw new Error("Invalid structure: cards must be an array.");
                    }

                    const newCards: FlashcardItem[] = await Promise.all(
                        parsed.cards.map(async (c) => {
                            const id = c.id ?? generateItemId();
                            const front = String(c.front ?? "");
                            const back = String(c.back ?? "");
                            const [frontBlocks, backBlocks] = await Promise.all([markdownToBlocks(front), markdownToBlocks(back)]);
                            return { id, front, back, frontBlocks, backBlocks };
                        })
                    );

                    const changes: Partial<Item> = {
                        data: { ...data, cards: newCards } as FlashcardData,
                    };
                    if (rename) {
                        if (hasDuplicateName(currentState.items, rename, "flashcard", existingItem.folderId ?? null, params.itemId)) {
                            return { success: false, message: `A flashcard deck named "${rename}" already exists in this folder` };
                        }
                        changes.name = rename;
                    }

                    const event = createEvent("ITEM_UPDATED", { id: params.itemId, changes, source: "agent", name: changes.name ?? existingItem.name }, userId, userName);
                    const currentVersionResult = await db.execute(sql`
                        SELECT get_workspace_version(${params.workspaceId}::uuid) as version
                    `);
                    const baseVersion = currentVersionResult[0]?.version || 0;
                    const eventResult = await db.execute(sql`
                        SELECT append_workspace_event(
                            ${params.workspaceId}::uuid, ${event.id}::text, ${event.type}::text,
                            ${JSON.stringify(event.payload)}::jsonb, ${event.timestamp}::bigint, ${event.userId}::text,
                            ${baseVersion}::integer, ${event.userName ?? null}::text
                        ) as result
                    `);
                    if (!eventResult?.length) throw new Error("Failed to update flashcard deck");
                    const appendResult = parseAppendResult(eventResult[0].result);
                    if (appendResult.conflict) throw new Error("Workspace was modified by another user, please try again");

                    return {
                        success: true,
                        itemId: params.itemId,
                        message: `Updated flashcard deck (${newCards.length} cards)`,
                        event,
                        version: appendResult.version,
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
                            replaceAll
                        );
                    }

                    let parsed: { questions?: QuizQuestion[] };
                    try {
                        const parsedResult = parseJsonWithRepair<{ questions?: QuizQuestion[] }>(serialized);
                        parsed = parsedResult.value;
                    } catch (e) {
                        const detail = e instanceof Error ? e.message : String(e);
                        throw new Error(
                            `Invalid JSON after edit. The edited quiz content is not valid JSON (even after repair). ` +
                            `Only edit the {"questions":[...]} JSON, and replace a larger unique block (or do full rewrite with oldString=''). ` +
                            `Details: ${detail}`
                        );
                    }
                    if (!Array.isArray(parsed.questions)) {
                        throw new Error("Invalid structure: questions must be an array.");
                    }

                    const validatedQuestions: QuizQuestion[] = parsed.questions.map((q, i) => {
                        const id = q?.id ?? generateItemId();
                        const type = q?.type === "true_false" ? "true_false" : "multiple_choice";
                        const questionText = String(q?.questionText ?? "");
                        const options = Array.isArray(q?.options) ? q.options.map(String) : [];
                        const correctIndex = typeof q?.correctIndex === "number" ? Math.max(0, Math.min(q.correctIndex, options.length - 1)) : 0;
                        if ((type === "multiple_choice" && options.length !== 4) || (type === "true_false" && options.length !== 2)) {
                            throw new Error(`Question ${i + 1}: multiple_choice needs 4 options, true_false needs 2`);
                        }
                        return {
                            id,
                            type,
                            questionText,
                            options,
                            correctIndex,
                            hint: q?.hint,
                            explanation: String(q?.explanation ?? ""),
                        };
                    });

                    const updatedData: QuizData = { ...data, questions: validatedQuestions };
                    if (data.session) updatedData.session = data.session;

                    const changes: Partial<Item> = { data: updatedData };
                    if (rename) {
                        if (hasDuplicateName(currentState.items, rename, "quiz", existingItem.folderId ?? null, params.itemId)) {
                            return { success: false, message: `A quiz named "${rename}" already exists in this folder` };
                        }
                        changes.name = rename;
                    }

                    const event = createEvent("ITEM_UPDATED", { id: params.itemId, changes, source: "agent", name: changes.name ?? existingItem.name }, userId, userName);
                    const currentVersionResult = await db.execute(sql`
                        SELECT get_workspace_version(${params.workspaceId}::uuid) as version
                    `);
                    const baseVersion = currentVersionResult[0]?.version || 0;
                    const eventResult = await db.execute(sql`
                        SELECT append_workspace_event(
                            ${params.workspaceId}::uuid, ${event.id}::text, ${event.type}::text,
                            ${JSON.stringify(event.payload)}::jsonb, ${event.timestamp}::bigint, ${event.userId}::text,
                            ${baseVersion}::integer, ${event.userName ?? null}::text
                        ) as result
                    `);
                    if (!eventResult?.length) throw new Error("Failed to update quiz");
                    const appendResult = parseAppendResult(eventResult[0].result);
                    if (appendResult.conflict) throw new Error("Workspace was modified by another user, please try again");

                    return {
                        success: true,
                        itemId: params.itemId,
                        message: `Updated quiz (${validatedQuestions.length} questions)`,
                        event,
                        version: appendResult.version,
                        questionCount: validatedQuestions.length,
                    };
                }

                if (existingItem.type === "pdf") {
                    if (!isRenameOnly || !rename) {
                        return {
                            success: false,
                            message: "PDFs can only be renamed. Use oldString='', newString='', and newName='new name'.",
                        };
                    }
                    if (hasDuplicateName(currentState.items, rename, "pdf", existingItem.folderId ?? null, params.itemId)) {
                        return { success: false, message: `A PDF named "${rename}" already exists in this folder` };
                    }
                    const changes: Partial<Item> = { name: rename };
                    const event = createEvent("ITEM_UPDATED", { id: params.itemId, changes, source: "agent", name: rename }, userId, userName);
                    const currentVersionResult = await db.execute(sql`
                        SELECT get_workspace_version(${params.workspaceId}::uuid) as version
                    `);
                    const baseVersion = currentVersionResult[0]?.version || 0;
                    const eventResult = await db.execute(sql`
                        SELECT append_workspace_event(
                            ${params.workspaceId}::uuid, ${event.id}::text, ${event.type}::text,
                            ${JSON.stringify(event.payload)}::jsonb, ${event.timestamp}::bigint, ${event.userId}::text,
                            ${baseVersion}::integer, ${event.userName ?? null}::text
                        ) as result
                    `);
                    if (!eventResult?.length) throw new Error("Failed to update PDF");
                    const appendResult = parseAppendResult(eventResult[0].result);
                    if (appendResult.conflict) throw new Error("Workspace was modified by another user, please try again");
                    return {
                        success: true,
                        itemId: params.itemId,
                        message: `Renamed PDF to "${rename}"`,
                        event,
                        version: appendResult.version,
                    };
                }

                throw new Error(`Item type "${existingItem.type}" is not editable`);
            }

            if (action === "delete") {
                if (!params.itemId) {
                    throw new Error("Item ID required for delete");
                }

                const currentState = await loadWorkspaceState(params.workspaceId);
                const existingItem = currentState.items.find((i: any) => i.id === params.itemId);
                const event = createEvent("ITEM_DELETED", { id: params.itemId, name: existingItem?.name }, userId, userName);

                const currentVersionResult = await db.execute(sql`
          SELECT get_workspace_version(${params.workspaceId}::uuid) as version
        `);

                const baseVersion = currentVersionResult[0]?.version || 0;

                const eventResult = await db.execute(sql`
          SELECT append_workspace_event(
            ${params.workspaceId}::uuid,
            ${event.id}::text,
            ${event.type}::text,
            ${JSON.stringify(event.payload)}::jsonb,
            ${event.timestamp}::bigint,
              ${event.userId}::text,
              ${baseVersion}::integer,
              ${event.userName ?? null}::text
          ) as result
        `);

                if (!eventResult || eventResult.length === 0) {
                    throw new Error("Failed to delete note");
                }

                const appendResult = parseAppendResult(eventResult[0].result);
                if (appendResult.conflict) {
                    throw new Error("Workspace was modified by another user, please try again");
                }

                logger.info("📝 [WORKSPACE-WORKER] Deleted note:", params.itemId);

                return {
                    success: true,
                    itemId: params.itemId,
                    message: `Deleted note successfully`,
                    event,
                    version: appendResult.version,
                };
            }

            // Fallback for unhandled actions
            return {
                success: false,
                message: `Action ${action} not implemented`,
            };

        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : "Unknown error";
            logger.error("📝 [WORKSPACE-WORKER] Error:", errorMessage);
            return {
                success: false,
                message: `Failed: ${errorMessage}`,
            };
        }
    }, { allowParallel });
}
