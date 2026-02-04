import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { db, workspaces } from "@/lib/db/client";
import { workspaceCollaborators } from "@/lib/db/schema";
import { eq, sql, and } from "drizzle-orm";
import { createEvent } from "@/lib/workspace/events";
import { generateItemId } from "@/lib/workspace-state/item-helpers";
import { getRandomCardColor } from "@/lib/workspace-state/colors";
import { logger } from "@/lib/utils/logger";
import type { Item, NoteData, QuizData, QuizQuestion } from "@/lib/workspace-state/types";
import { markdownToBlocks } from "@/lib/editor/markdown-to-blocks";
import { executeWorkspaceOperation } from "./common";
import { loadWorkspaceState } from "@/lib/workspace/state-loader";
import type { WorkspaceEvent } from "@/lib/workspace/events";

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
    action: "create" | "update" | "delete" | "updateFlashcard" | "updateQuiz",
    params: {
        workspaceId: string;
        title?: string;
        content?: string; // For notes
        itemId?: string;

        itemType?: "note" | "flashcard" | "quiz" | "youtube"; // Defaults to "note" if undefined
        flashcardData?: {
            cards?: { front: string; back: string }[]; // For creating flashcards
            cardsToAdd?: { front: string; back: string }[]; // For updating flashcards (appending)
        };
        quizData?: QuizData; // For creating quizzes
        questionsToAdd?: QuizQuestion[]; // For updating quizzes (appending questions)
        youtubeData?: {
            url: string; // For creating youtube cards
        };
        // Optional: deep research metadata to attach to a note
        deepResearchData?: {
            prompt: string;
            interactionId: string;
        };
        // Optional: sources from web search or deep research
        sources?: Array<{
            title: string;
            url: string;
            favicon?: string;
        }>;
        folderId?: string;
    }
): Promise<{ success: boolean; message: string; itemId?: string; cardsAdded?: number; cardCount?: number; event?: WorkspaceEvent; version?: number }> {
    // For "create" operations, allow parallel execution (bypass queue)
    // For "update" and "delete" operations, serialize via queue
    const allowParallel = action === "create";

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
                const itemId = generateItemId();
                const itemType = params.itemType || "note";

                let itemData: any;

                if (itemType === "flashcard") {
                    logger.debug("🎴 [WORKSPACE-WORKER] Creating flashcard deck with data:", {
                        hasFlashcardData: !!params.flashcardData,
                        hasCards: !!params.flashcardData?.cards,
                        cardsType: typeof params.flashcardData?.cards,
                        cardsIsArray: Array.isArray(params.flashcardData?.cards),
                    });

                    if (!params.flashcardData || !params.flashcardData.cards) {
                        logger.error("❌ [WORKSPACE-WORKER] Flashcard data missing cards");
                        throw new Error("Flashcard data required for flashcard creation");
                    }

                    // Generate IDs for each card in the deck
                    const cardsWithIdsOrNull = await Promise.all(params.flashcardData.cards.map(async (card, index) => {
                        if (!card || typeof card !== 'object') {
                            logger.error(`❌ [WORKSPACE-WORKER] Invalid card at index ${index}:`, card);
                            return null; // Skip invalid cards
                        }

                        // Parse markdown/math into blocks for the frontend editor
                        // This ensures LaTeX like $$...$$ is converted to inlineMath blocks
                        const frontBlocks = await markdownToBlocks(card.front || "");
                        const backBlocks = await markdownToBlocks(card.back || "");

                        return {
                            id: generateItemId(),
                            front: card.front || "",
                            back: card.back || "",
                            frontBlocks,
                            backBlocks
                        };
                    }));

                    // Filter out null entries (invalid cards)
                    const cardsWithIds = cardsWithIdsOrNull.filter((card): card is NonNullable<typeof card> => card !== null);

                    itemData = {
                        cards: cardsWithIds
                    };
                } else if (itemType === "youtube") {
                    // YouTube type
                    if (!params.youtubeData || !params.youtubeData.url) {
                        throw new Error("YouTube data required for youtube card creation");
                    }
                    itemData = {
                        url: params.youtubeData.url
                    };
                } else if (itemType === "quiz") {
                    // Quiz type
                    if (!params.quizData) {
                        throw new Error("Quiz data required for quiz creation");
                    }

                    logger.debug("🎯 [WORKSPACE-WORKER] Creating quiz with data:", {
                        title: params.quizData.title,
                        difficulty: params.quizData.difficulty,
                        questionCount: params.quizData.questions?.length,
                    });

                    itemData = params.quizData;
                } else {
                    // "note" type
                    // Convert markdown to blocks on the server
                    const blockContent = params.content
                        ? await markdownToBlocks(params.content)
                        : undefined;

                    itemData = {
                        field1: params.content || "", // Keep for backwards compatibility and search
                        blockContent: blockContent, // Always store blocks
                    };

                    // If this is a deep research note, attach the metadata
                    if (params.deepResearchData) {
                        itemData.deepResearch = {
                            prompt: params.deepResearchData.prompt,
                            interactionId: params.deepResearchData.interactionId,
                            status: "researching",
                            thoughts: [],
                        };
                    }

                    // If sources are provided, attach them
                    if (params.sources && params.sources.length > 0) {
                        itemData.sources = params.sources;
                        logger.debug("📚 [WORKSPACE-WORKER] Attaching sources to note:", {
                            count: params.sources.length,
                            sources: params.sources,
                        });
                    }
                }

                const item: Item = {
                    id: itemId,
                    type: itemType,
                    name: params.title || (itemType === "youtube" ? "YouTube Video" : itemType === "quiz" ? "New Quiz" : itemType === "flashcard" ? "New Flashcard Deck" : "New Note"),
                    subtitle: "",
                    data: itemData,
                    color: getRandomCardColor(),
                    folderId: params.folderId,
                };

                const event = createEvent("ITEM_CREATED", { id: itemId, item }, userId);

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
              NULL::text
            ) as result
          `);

                    if (!eventResult || eventResult.length === 0) {
                        throw new Error(`Failed to create ${itemType}`);
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

                logger.info(`📝 [WORKSPACE-WORKER] Created ${itemType}:`, item.name);

                // Include card count for flashcard decks
                const cardCount = itemType === "flashcard" && params.flashcardData?.cards
                    ? params.flashcardData.cards.length
                    : undefined;

                return {
                    success: true,
                    itemId,
                    message: `Created ${itemType} "${item.name}" successfully`,
                    cardCount,
                    event,
                    version: appendResult.version,
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

                    // Update content if provided (allow empty string to clear content)
                    if (params.content !== undefined) {
                        const contentStr = typeof params.content === 'string' ? params.content : String(params.content);

                        logger.time("📝 [UPDATE-NOTE] markdownToBlocks conversion");
                        const blockContent = await markdownToBlocks(contentStr);
                        logger.timeEnd("📝 [UPDATE-NOTE] markdownToBlocks conversion");

                        changes.data = {
                            field1: contentStr,
                            blockContent: blockContent,
                        } as NoteData;
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

                    logger.time("📝 [UPDATE-NOTE] Event creation");
                    const event = createEvent("ITEM_UPDATED", { id: params.itemId, changes, source: 'agent' }, userId);
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
              NULL::text
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

                    return {
                        success: true,
                        itemId: params.itemId,
                        message: `Updated note successfully`,
                        event,
                        version: appendResult.version,
                    };
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
                    changes.name = params.title;
                }

                const event = createEvent("ITEM_UPDATED", { id: params.itemId, changes, source: 'agent' }, userId);

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
            NULL::text
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

                // Allow questionsToAdd to be at top level or nested in quizData (for backward compatibility)
                const questionsToAdd = params.questionsToAdd || (params.quizData as any)?.questionsToAdd;

                if (!questionsToAdd || questionsToAdd.length === 0) {
                    throw new Error("Questions to add required for updateQuiz");
                }

                logger.debug("🎯 [WORKSPACE-WORKER] Updating quiz with new questions:", {
                    itemId: params.itemId,
                    questionsToAdd: questionsToAdd.length,
                });

                // Use helper to load current state (duplicated logic removed)
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

                // Merge existing questions with new questions
                const updatedData: QuizData = {
                    ...existingData,
                    questions: [...existingQuestions, ...questionsToAdd],
                };

                const changes: any = { data: updatedData };

                // Handle title update if provided
                if (params.title) {
                    logger.debug("🎯 [UPDATE-QUIZ] Updating title:", params.title);
                    changes.name = params.title;
                }

                const event = createEvent("ITEM_UPDATED", { id: params.itemId, changes, source: 'agent' }, userId);

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
            NULL::text
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
                    questionsAdded: questionsToAdd.length,
                    totalQuestions: updatedData.questions.length,
                });

                return {
                    success: true,
                    itemId: params.itemId,
                    questionsAdded: questionsToAdd.length,
                    totalQuestions: updatedData.questions.length,
                    message: `Added ${questionsToAdd.length} question${questionsToAdd.length !== 1 ? 's' : ''} to quiz`,
                    event,
                    version: appendResult.version,
                };
            }

            if (action === "delete") {
                if (!params.itemId) {
                    throw new Error("Item ID required for delete");
                }

                const event = createEvent("ITEM_DELETED", { id: params.itemId }, userId);

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
            NULL::text
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
