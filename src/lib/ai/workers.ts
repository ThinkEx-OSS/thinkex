/**
 * Specialized AI Workers
 * Each worker uses only ONE type of tool to comply with Google Vertex constraints
 */

import { vertex } from "@ai-sdk/google-vertex/edge";
import { google } from "@ai-sdk/google";
import { generateText } from "ai";
import type { GoogleGenerativeAIProviderMetadata } from "@ai-sdk/google";
import { z } from "zod";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { db, workspaces } from "@/lib/db/client";
import { eq, sql } from "drizzle-orm";
import { createEvent } from "@/lib/workspace/events";
import { generateItemId } from "@/lib/workspace-state/item-helpers";
import { getRandomCardColor } from "@/lib/workspace-state/colors";
import { logger } from "@/lib/utils/logger";
import type { Item, NoteData, QuizData, QuizQuestion, QuestionType } from "@/lib/workspace-state/types";
import { markdownToBlocks } from "@/lib/editor/markdown-to-blocks";

/**
 * Workspace operation queue to serialize concurrent operations
 * Maps workspaceId -> Promise representing the last operation
 */
const workspaceOperationQueues = new Map<string, Promise<any>>();

/**
 * WORKER 1: Search Agent
 * Uses Google Search Grounding to find current information with sources
 */
export async function searchWorker(query: string): Promise<string> {
  try {
    logger.debug("🔍 [SEARCH-WORKER] Starting search for:", query);

    const { text, sources, providerMetadata } = await generateText({
      model: google("gemini-2.5-pro"),
      tools: {
        google_search: google.tools.googleSearch({}),
      },
      prompt: `Search for information about: ${query}

Provide a comprehensive answer based on the search results. Include relevant details and context from the sources.`,
    });

    // Access grounding metadata for additional context
    const metadata = providerMetadata?.vertex as GoogleGenerativeAIProviderMetadata | undefined;
    const groundingMetadata = metadata?.groundingMetadata;

    logger.debug("🔍 [SEARCH-WORKER] Search completed", {
      hasGroundingMetadata: !!groundingMetadata,
      webSearchQueries: groundingMetadata?.webSearchQueries?.length || 0,
      groundingSupports: groundingMetadata?.groundingSupports?.length || 0,
    });

    // Enhanced response with source information
    let enhancedResponse = text;

    // Add sources information if available
    if (sources && sources.length > 0) {
      enhancedResponse += "\n\n**Sources:**\n";
      sources.forEach((source, index) => {
        // Check if source has a URL property (for web sources)
        // Google grounding sources may have different structures
        const sourceUrl = 'url' in source ? (source as any).url :
          'id' in source && typeof source.id === 'string' && source.id.startsWith('http') ? source.id :
            undefined;

        if (sourceUrl) {
          enhancedResponse += `${index + 1}. [${sourceUrl}](${sourceUrl})\n`;
        } else if (source.title) {
          // Fallback to title if no URL available
          enhancedResponse += `${index + 1}. ${source.title}\n`;
        }
      });
    }

    return enhancedResponse;
  } catch (error) {
    logger.error("🔍 [SEARCH-WORKER] Error:", error);
    throw error;
  }
}

/**
 * WORKER 2: Code Execution Agent
 * Executes Python code for calculations and data processing
 */
export async function codeExecutionWorker(task: string): Promise<string> {
  try {
    logger.debug("⚙️ [CODE-WORKER] Starting code execution for:", task);

    const result = await generateText({
      model: vertex("gemini-2.5-flash"),
      tools: {
        code_execution: vertex.tools.codeExecution({}),
      },
      prompt: `${task}

Use Python code execution to solve this problem. Show your work and explain the result.`,
    });

    logger.debug("⚙️ [CODE-WORKER] Code execution completed");
    return result.text;
  } catch (error) {
    logger.error("⚙️ [CODE-WORKER] Error:", error);
    throw error;
  }
}

/**
 * Execute workspace operation with serialization
 * Ensures operations on the same workspace are executed sequentially
 */
async function executeWorkspaceOperation<T>(
  workspaceId: string,
  operation: () => Promise<T>
): Promise<T> {
  const queueSize = workspaceOperationQueues.size;
  const hasExistingQueue = workspaceOperationQueues.has(workspaceId);

  logger.debug("🔒 [QUEUE] Queuing operation for workspace:", {
    workspaceId: workspaceId.substring(0, 8),
    hasExistingQueue,
    totalQueues: queueSize,
  });

  // Get or create the queue for this workspace
  const currentQueue = workspaceOperationQueues.get(workspaceId) || Promise.resolve();

  // Chain the new operation after the current queue
  const newOperation = currentQueue
    .then(() => {
      logger.debug("🔓 [QUEUE] Executing queued operation for workspace:", workspaceId.substring(0, 8));
      return operation();
    })
    .catch((error) => {
      // Even if the previous operation failed, we still want to execute this one
      logger.debug("🔓 [QUEUE] Previous operation failed, executing anyway for workspace:", workspaceId.substring(0, 8));
      return operation();
    });

  // Update the queue
  workspaceOperationQueues.set(workspaceId, newOperation);

  // Clean up the queue after the operation completes
  newOperation.finally(() => {
    // Only delete if this is still the current operation
    if (workspaceOperationQueues.get(workspaceId) === newOperation) {
      workspaceOperationQueues.delete(workspaceId);
      logger.debug("✅ [QUEUE] Cleaned up queue for workspace:", workspaceId.substring(0, 8));
    }
  });

  return newOperation;
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

    itemType?: "note" | "flashcard" | "quiz"; // Defaults to "note" if undefined
    flashcardData?: {
      cards?: { front: string; back: string }[]; // For creating flashcards
      cardsToAdd?: { front: string; back: string }[]; // For updating flashcards (appending)
    };
    quizData?: QuizData; // For creating quizzes
    questionsToAdd?: QuizQuestion[]; // For updating quizzes (appending questions)
    // Optional: deep research metadata to attach to a note
    deepResearchData?: {
      prompt: string;
      interactionId: string;
    };
    folderId?: string;
  }
): Promise<{ success: boolean; message: string; itemId?: string; cardsAdded?: number }> {
  // Serialize operations on the same workspace
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

      // Verify workspace access - ownership only (sharing is fork-based)
      const workspace = await db
        .select({ userId: workspaces.userId })
        .from(workspaces)
        .where(eq(workspaces.id, params.workspaceId))
        .limit(1);

      if (!workspace[0]) {
        throw new Error("Workspace not found");
      }

      // Enforce strict ownership (sharing is fork-based)
      if (workspace[0].userId !== userId) {
        throw new Error("Access denied");
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
          const cardsWithIds = await Promise.all(params.flashcardData.cards.map(async (card, index) => {
            if (!card || typeof card !== 'object') {
              logger.error(`❌ [WORKSPACE-WORKER] Invalid card at index ${index}:`, card);
            }

            // Parse markdown/math into blocks for the frontend editor
            // This ensures LaTeX like $$...$$ is converted to inlineMath blocks
            const frontBlocks = await markdownToBlocks(card.front);
            const backBlocks = await markdownToBlocks(card.back);

            return {
              id: generateItemId(),
              front: card.front,
              back: card.back,
              frontBlocks,
              backBlocks
            };
          }));

          itemData = {
            cards: cardsWithIds
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
        }

        const item: Item = {
          id: itemId,
          type: itemType,
          name: params.title || (itemType === "quiz" ? "New Quiz" : itemType === "flashcard" ? "New Flashcard Deck" : "New Note"),
          subtitle: "",
          data: itemData,
          color: getRandomCardColor(),
          folderId: params.folderId,
        };

        const event = createEvent("ITEM_CREATED", { id: itemId, item }, userId);

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
            ${null}::text
          ) as result
        `);

        if (!eventResult || eventResult.length === 0) {
          throw new Error(`Failed to create ${itemType}`);
        }

        const result = eventResult[0].result as any;
        if (result && result.conflict) {
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
            hasTitle: params?.title !== undefined,
            hasContent: params?.content !== undefined,
            titleType: typeof params?.title,
            contentType: typeof params?.content,
            titleLength: params?.title && typeof params.title === 'string' ? params.title.length : (params?.title ? String(params.title).length : 0),
            contentLength: params?.content && typeof params.content === 'string' ? params.content.length : (params?.content ? String(params.content).length : 0),
          });
          logger.groupEnd();

          if (!params) {
            logger.error("❌ [UPDATE-NOTE] Params object is missing");
            throw new Error("Params object is required for update");
          }

          if (!params.itemId) {
            logger.error("❌ [UPDATE-NOTE] Item ID required for update", {
              itemId: params.itemId,
              itemIdType: typeof params.itemId,
            });
            throw new Error("Item ID required for update");
          }

          if (typeof params.itemId !== 'string') {
            logger.error("❌ [UPDATE-NOTE] Item ID must be a string", {
              itemId: params.itemId,
              itemIdType: typeof params.itemId,
            });
            throw new Error("Item ID must be a string");
          }

          if (!params.workspaceId) {
            logger.error("❌ [UPDATE-NOTE] Workspace ID required for update", {
              workspaceId: params.workspaceId,
              workspaceIdType: typeof params.workspaceId,
            });
            throw new Error("Workspace ID required for update");
          }

          if (typeof params.workspaceId !== 'string') {
            logger.error("❌ [UPDATE-NOTE] Workspace ID must be a string", {
              workspaceId: params.workspaceId,
              workspaceIdType: typeof params.workspaceId,
            });
            throw new Error("Workspace ID must be a string");
          }

          const changes: Partial<Item> = {};

          // Update title if provided
          if (params.title !== undefined) {
            const titleStr = typeof params.title === 'string' ? params.title : String(params.title);
            logger.debug("📝 [UPDATE-NOTE] Updating title:", {
              oldTitle: "N/A (not retrieved)",
              newTitle: titleStr,
              titleLength: titleStr.length,
              originalType: typeof params.title,
            });
            changes.name = titleStr;
          }

          // Update content if provided (allow empty string to clear content)
          if (params.content !== undefined) {
            const contentStr = typeof params.content === 'string' ? params.content : String(params.content);
            logger.debug("📝 [UPDATE-NOTE] Processing content update:", {
              contentLength: contentStr.length,
              contentPreview: contentStr.substring(0, 100) + (contentStr.length > 100 ? "..." : ""),
              isEmpty: contentStr.length === 0,
              originalType: typeof params.content,
            });

            logger.time("📝 [UPDATE-NOTE] markdownToBlocks conversion");
            const blockContent = await markdownToBlocks(contentStr);
            logger.timeEnd("📝 [UPDATE-NOTE] markdownToBlocks conversion");

            logger.debug("📝 [UPDATE-NOTE] Block content generated:", {
              blockCount: blockContent?.length || 0,
              firstBlockType: blockContent?.[0]?.type || "N/A",
            });

            changes.data = {
              field1: contentStr,
              blockContent: blockContent,
            } as NoteData;
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

          logger.debug("📝 [UPDATE-NOTE] Changes to apply:", {
            changeKeys: Object.keys(changes),
            hasNameChange: !!changes.name,
            hasDataChange: !!changes.data,
          });

          logger.time("📝 [UPDATE-NOTE] Event creation");
          const event = createEvent("ITEM_UPDATED", { id: params.itemId, changes, source: 'agent' }, userId);
          logger.timeEnd("📝 [UPDATE-NOTE] Event creation");

          logger.debug("📝 [UPDATE-NOTE] Event created:", {
            eventId: event.id,
            eventType: event.type,
            eventTimestamp: event.timestamp,
            payloadId: event.payload.id,
          });

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
              ${null}::text
            ) as result
          `);
          logger.timeEnd("📝 [UPDATE-NOTE] Append workspace event");

          if (!eventResult || eventResult.length === 0) {
            logger.error("❌ [UPDATE-NOTE] Failed to append event - no result returned");
            throw new Error("Failed to update note");
          }

          const result = eventResult[0].result as any;
          logger.debug("📝 [UPDATE-NOTE] Event append result:", {
            hasResult: !!result,
            hasConflict: !!result?.conflict,
            resultKeys: result ? Object.keys(result) : [],
          });

          if (result && result.conflict) {
            logger.error("❌ [UPDATE-NOTE] Conflict detected - workspace was modified by another user");
            throw new Error("Workspace was modified by another user, please try again");
          }

          logger.group("✅ [UPDATE-NOTE] Update completed successfully", true);
          logger.info("Item ID:", params.itemId);
          logger.info("Workspace ID:", params.workspaceId);
          logger.info("Base version:", baseVersion);
          logger.info("Changes applied:", Object.keys(changes));
          logger.groupEnd();

          return {
            success: true,
            itemId: params.itemId,
            message: `Updated note successfully`,
          };
        } catch (error: any) {
          logger.group("❌ [UPDATE-NOTE] Error during update operation", false);
          logger.error("Error type:", error?.constructor?.name || typeof error);
          logger.error("Error message:", error?.message || String(error));
          logger.error("Error stack:", error?.stack);
          logger.error("Full error object:", error);
          logger.error("Params that caused error:", params);
          logger.error("UserId:", userId);
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

        // Get the latest snapshot state
        const snapshotResult = await db.execute(sql`
          SELECT state
          FROM get_latest_snapshot_fast(${params.workspaceId}::uuid)
        `);

        const snapshotState = snapshotResult[0]?.state as { items?: any[] } | null;

        // Get events after the snapshot to compute current state
        const snapshotVersionResult = await db.execute(sql`
          SELECT snapshot_version as "snapshotVersion"
          FROM get_latest_snapshot_fast(${params.workspaceId}::uuid)
        `);
        const snapshotVersion = (snapshotVersionResult[0]?.snapshotVersion as number) || 0;

        // Get events after the snapshot
        const eventsResult = await db.execute(sql`
          SELECT event_type as "eventType", payload
          FROM workspace_events
          WHERE workspace_id = ${params.workspaceId}::uuid
            AND version > ${snapshotVersion}
          ORDER BY version ASC
        `);

        // Apply events to snapshot state to get current state
        let currentItems = snapshotState?.items || [];

        for (const row of eventsResult) {
          const event = row as { eventType: string; payload: any };

          if (event.eventType === 'ITEM_CREATED' && event.payload?.item) {
            currentItems = [...currentItems, event.payload.item];
          } else if (event.eventType === 'ITEM_UPDATED' && event.payload?.id) {
            currentItems = currentItems.map((item: any) =>
              item.id === event.payload.id
                ? { ...item, ...event.payload.changes }
                : item
            );
          } else if (event.eventType === 'ITEM_DELETED' && event.payload?.id) {
            currentItems = currentItems.filter((item: any) => item.id !== event.payload.id);
          }
        }

        const existingItem = currentItems.find((i: any) => i.id === params.itemId);
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

        const changes = { data: updatedData };
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
            ${null}::text
          ) as result
        `);

        if (!eventResult || eventResult.length === 0) {
          throw new Error("Failed to update flashcard deck: database returned no result");
        }

        const result = eventResult[0].result as any;

        if (result && result.conflict) {
          throw new Error("Workspace was modified by another user, please try again");
        }

        logger.info("🎴 [WORKSPACE-WORKER] Updated flashcard deck:", {
          itemId: params.itemId,
          cardsAdded: newCards.length,
          totalCards: updatedData.cards.length,
        });

        return {
          success: true,
          itemId: params.itemId,
          cardsAdded: newCards.length,
          message: `Added ${newCards.length} card${newCards.length !== 1 ? 's' : ''} to flashcard deck`,
        };
      }

      if (action === "updateQuiz") {
        if (!params.itemId) {
          throw new Error("Item ID required for updateQuiz");
        }

        if (!params.questionsToAdd || params.questionsToAdd.length === 0) {
          throw new Error("Questions to add required for updateQuiz");
        }

        logger.debug("🎯 [WORKSPACE-WORKER] Updating quiz with new questions:", {
          itemId: params.itemId,
          questionsToAdd: params.questionsToAdd.length,
        });

        // Get the latest snapshot state using the optimized function
        const snapshotResult = await db.execute(sql`
          SELECT state
          FROM get_latest_snapshot_fast(${params.workspaceId}::uuid)
        `);

        const snapshotState = snapshotResult[0]?.state as { items?: any[] } | null;

        // Get snapshot version separately
        const snapshotVersionResult = await db.execute(sql`
          SELECT snapshot_version as "snapshotVersion"
          FROM get_latest_snapshot_fast(${params.workspaceId}::uuid)
        `);
        const snapshotVersion = (snapshotVersionResult[0]?.snapshotVersion as number) || 0;

        // Get events after the snapshot
        const eventsResult = await db.execute(sql`
          SELECT event_type as "eventType", payload
          FROM workspace_events
          WHERE workspace_id = ${params.workspaceId}::uuid
            AND version > ${snapshotVersion}
          ORDER BY version ASC
        `);

        // Apply events to snapshot state to get current state
        let currentItems = snapshotState?.items || [];

        for (const row of eventsResult) {
          const event = row as { eventType: string; payload: any };

          if (event.eventType === 'ITEM_CREATED' && event.payload?.item) {
            currentItems = [...currentItems, event.payload.item];
          } else if (event.eventType === 'ITEM_UPDATED' && event.payload?.id) {
            currentItems = currentItems.map((item: any) =>
              item.id === event.payload.id
                ? { ...item, ...event.payload.changes }
                : item
            );
          } else if (event.eventType === 'ITEM_DELETED' && event.payload?.id) {
            currentItems = currentItems.filter((item: any) => item.id !== event.payload.id);
          }
        }

        const existingItem = currentItems.find((i: any) => i.id === params.itemId);
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
          questions: [...existingQuestions, ...params.questionsToAdd],
        };

        const changes = { data: updatedData };
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
            ${null}::text
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

        const result = eventResult[0].result as any;
        logger.info("📝 [UPDATE-QUIZ-DB] Parsed result:", {
          result: JSON.stringify(result),
          hasConflict: !!result?.conflict,
          resultVersion: result?.version,
        });

        if (result && result.conflict) {
          logger.error("❌ [UPDATE-QUIZ-DB] Version conflict detected");
          throw new Error("Workspace was modified by another user, please try again");
        }

        logger.info("🎯 [WORKSPACE-WORKER] Updated quiz:", {
          itemId: params.itemId,
          questionsAdded: params.questionsToAdd.length,
          totalQuestions: updatedData.questions.length,
        });

        return {
          success: true,
          itemId: params.itemId,
          questionsAdded: params.questionsToAdd.length,
          totalQuestions: updatedData.questions.length,
          message: `Added ${params.questionsToAdd.length} question${params.questionsToAdd.length !== 1 ? 's' : ''} to quiz`,
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
            ${null}::text
          ) as result
        `);

        if (!eventResult || eventResult.length === 0) {
          throw new Error("Failed to delete note");
        }

        const result = eventResult[0].result as any;
        if (result && result.conflict) {
          throw new Error("Workspace was modified by another user, please try again");
        }

        logger.info("📝 [WORKSPACE-WORKER] Deleted note:", params.itemId);

        return {
          success: true,
          itemId: params.itemId,
          message: `Deleted note successfully`,
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
  });
}

/**
 * WORKER 4: Text Selection Agent
 * Processes and transforms selected text (summarize, explain, rewrite, etc.)
 */
export async function textSelectionWorker(
  action: "summarize" | "explain" | "rewrite" | "translate" | "improve",
  text: string,
  additionalContext?: string
): Promise<string> {
  try {
    logger.debug("📄 [TEXT-WORKER] Action:", action);

    const prompts = {
      summarize: `Summarize the following text concisely:\n\n${text}`,
      explain: `Explain the following text in simple terms:\n\n${text}`,
      rewrite: `Rewrite the following text to be clearer and more concise:\n\n${text}`,
      translate: `Translate the following text to ${additionalContext || "English"}:\n\n${text}`,
      improve: `Improve the following text for grammar, clarity, and style:\n\n${text}`,
    };

    const result = await generateText({
      model: vertex("gemini-2.5-flash"),
      prompt: prompts[action] + (additionalContext ? `\n\nAdditional context: ${additionalContext}` : ""),
    });

    logger.debug("📄 [TEXT-WORKER] Processing completed");
    return result.text;
  } catch (error) {
    logger.error("📄 [TEXT-WORKER] Error:", error);
    throw error;
  }
}

/**
 * WORKER 5: Quiz Generation Agent
 * Generates quiz questions using Gemini with structured JSON output
 */
type QuizWorkerParams = {
  topic?: string;                // Used only if no context provided
  contextContent?: string;       // Aggregated content from selected cards
  sourceCardIds?: string[];
  sourceCardNames?: string[];
  difficulty: "easy" | "medium" | "hard";
  questionCount?: number;        // Defaults to 10
  questionTypes?: ("multiple_choice" | "true_false")[];
  existingQuestions?: Array<{
    id: string;
    questionText: string;
    correctIndex: number;
  }>;
  performanceTelemetry?: {
    totalAnswered: number;
    correctCount: number;
    incorrectCount: number;
    weakAreas?: Array<{
      questionText: string;
      userSelectedOption: string;
      correctOption: string;
    }>;
  };
};

function buildAdaptiveInstructions(
  baseDifficulty: "easy" | "medium" | "hard",
  telemetry?: QuizWorkerParams["performanceTelemetry"]
): string {
  if (!telemetry || telemetry.totalAnswered === 0) {
    return `- Difficulty: ${baseDifficulty.toUpperCase()}`;
  }

  const successRate = telemetry.totalAnswered > 0
    ? telemetry.correctCount / telemetry.totalAnswered
    : 0;

  let adjustedDifficulty: "easy" | "medium" | "hard";
  let cognitiveLevel: string;

  if (successRate >= 0.8) {
    adjustedDifficulty = baseDifficulty === "hard" ? "hard" : baseDifficulty === "medium" ? "hard" : "medium";
    cognitiveLevel = "Analysis and synthesis - test deeper understanding";
  } else if (successRate >= 0.5) {
    adjustedDifficulty = baseDifficulty;
    cognitiveLevel = "Application - focus on practical usage";
  } else {
    adjustedDifficulty = baseDifficulty === "easy" ? "easy" : baseDifficulty === "medium" ? "easy" : "medium";
    cognitiveLevel = "Recall and understanding - reinforce fundamentals";
  }

  let instructions = `- Adaptive Difficulty: ${adjustedDifficulty.toUpperCase()} (adjusted from ${baseDifficulty})
- User Performance: ${Math.round(successRate * 100)}% correct (${telemetry.correctCount}/${telemetry.totalAnswered})
- Cognitive Level: ${cognitiveLevel}`;

  if (telemetry.weakAreas && telemetry.weakAreas.length > 0 && successRate < 0.7) {
    instructions += `
LEARNING GAPS DETECTED - Include scaffolding questions for these weak areas:
${telemetry.weakAreas.slice(0, 3).map((w, i) =>
      `${i + 1}. Topic: "${w.questionText.substring(0, 50)}..." - User confused "${w.userSelectedOption}" with "${w.correctOption}"`
    ).join('\n')}
For weak areas:
- Include 2-3 foundational questions that build up to the concept
- Add extra hints for these topics
- Break complex concepts into smaller parts`;
  }

  return instructions;
}

export async function quizWorker(params: QuizWorkerParams): Promise<{ questions: QuizQuestion[]; title: string }> {
  try {
    const questionCount = params.questionCount || 10;
    const questionTypes = params.questionTypes || ["multiple_choice", "true_false"];

    logger.debug("🎯 [QUIZ-WORKER] Starting quiz generation:", {
      hasContext: !!params.contextContent,
      hasTopic: !!params.topic,
      difficulty: params.difficulty,
      questionCount,
      questionTypes,
    });

    // Build the prompt based on whether we have context or topic
    let prompt: string;
    const adaptiveInstructions = buildAdaptiveInstructions(params.difficulty, params.performanceTelemetry);

    if (params.contextContent) {
      // Context-based quiz generation
      prompt = `You are a quiz generator. Create exactly ${questionCount} quiz questions based EXCLUSIVELY on the following content. Do NOT use any external knowledge.

IMPORTANT: The content below is from workspace cards and includes metadata headers like "CARD 1:", "Card ID:", "METADATA:", "CONTENT:", etc. IGNORE ALL METADATA. Focus ONLY on the actual educational content within each card - the text, concepts, facts, and information being taught. Do NOT create questions about:
- Card IDs, card types, or card names
- Metadata like "Type: note" or "Card ID: xyz"
- System formatting like separators, emojis, or structural markers
- The number of cards, questions, or any organizational details

CONTENT TO QUIZ ON:
${params.contextContent}

REQUIREMENTS:
${adaptiveInstructions}
- Difficulty guide:
  - Easy: Basic recall and recognition questions
  - Medium: Understanding and application questions  
  - Hard: Analysis, synthesis, and critical thinking questions
- Question types allowed: ${questionTypes.join(", ")}
- For multiple_choice: provide exactly 4 options with only 1 correct answer
- For true_false: provide exactly 2 options (["True", "False"])
- Each question must have a clear, specific explanation
- Each question should optionally have a helpful hint
- Questions must be directly answerable from the provided EDUCATIONAL content (not metadata)

SOURCE: ${params.sourceCardNames?.join(", ") || "Selected content"}`;
    } else if (params.topic) {
      // Topic-based quiz generation from LLM knowledge
      prompt = `You are a quiz generator. Create exactly ${questionCount} quiz questions about: ${params.topic}

REQUIREMENTS:
${adaptiveInstructions}
- Difficulty guide:
  - Easy: Basic facts and definitions
  - Medium: Understanding concepts and relationships
  - Hard: Complex analysis and application
- Question types allowed: ${questionTypes.join(", ")}
- For multiple_choice: provide exactly 4 options with only 1 correct answer
- For true_false: provide exactly 2 options (["True", "False"])
- Each question must have a clear, specific explanation
- Each question should optionally have a helpful hint
- Questions should cover diverse aspects of the topic`;
    } else {
      throw new Error("Either topic or contextContent must be provided");
    }

    if (params.existingQuestions && params.existingQuestions.length > 0) {
      prompt += `

EXISTING QUESTIONS (DO NOT DUPLICATE):
The following ${params.existingQuestions.length} questions already exist. Generate NEW questions that:
1. Cover DIFFERENT aspects of the topic
2. Do NOT ask the same thing with different wording
3. Do NOT repeat any correct answers
Existing questions to avoid:
${params.existingQuestions.map((q, i) => `${i + 1}. ${q.questionText}`).join('\n')}`;
    }

    prompt += `

OUTPUT FORMAT (strict JSON):
{
  "title": "Quiz Title",
  "questions": [
    {
      "id": "q_001",
      "type": "multiple_choice",
      "questionText": "Question text here?",
      "options": ["Option A", "Option B", "Option C", "Option D"],
      "correctIndex": 0,
      "hint": "Optional hint text",
      "explanation": "Explanation of why this is correct"
    }
  ]
}

Generate the quiz now:`;

    // Check if context contains PDF URLs that Gemini should read directly
    // PDF URLs are marked with "📖 PDF_CONTENT_URL:" in the context
    const pdfUrlMatches = params.contextContent?.match(/📖 PDF_CONTENT_URL:\s*(https?:\/\/[^\s]+)/g) || [];
    const pdfUrls = pdfUrlMatches.map(match => {
      const urlMatch = match.match(/https?:\/\/[^\s]+/);
      return urlMatch ? urlMatch[0] : null;
    }).filter((url): url is string => url !== null);

    logger.debug("🎯 [QUIZ-WORKER] PDF detection:", {
      foundPdfUrls: pdfUrls.length,
      urls: pdfUrls
    });

    let result;
    if (pdfUrls.length > 0) {
      // Use multimodal content with PDF file parts
      // Gemini can read PDFs directly via URL
      const fileParts = pdfUrls.map(url => ({
        type: 'file' as const,
        data: new URL(url),
        mediaType: 'application/pdf' as const,
      }));

      logger.debug("🎯 [QUIZ-WORKER] Using multimodal generation with PDFs");

      result = await generateText({
        model: google("gemini-2.5-flash"),
        messages: [
          {
            role: 'user',
            content: [
              ...fileParts,
              { type: 'text', text: prompt },
            ],
          },
        ],
      });
    } else {
      // Standard text-only generation
      result = await generateText({
        model: google("gemini-2.5-flash"),
        prompt,
      });
    }

    // Parse the JSON response
    let parsed: { title: string; questions: any[] };
    try {
      // Extract JSON from potential markdown code blocks
      let jsonText = result.text.trim();
      if (jsonText.startsWith("```json")) {
        jsonText = jsonText.slice(7);
      } else if (jsonText.startsWith("```")) {
        jsonText = jsonText.slice(3);
      }
      if (jsonText.endsWith("```")) {
        jsonText = jsonText.slice(0, -3);
      }
      jsonText = jsonText.trim();

      // Sanitize LaTeX escape sequences before parsing
      // LaTeX uses backslashes (e.g., \frac, \cap, \cup) which are invalid JSON escapes
      // We need to double-escape them so they become valid JSON strings
      // This regex finds backslashes NOT followed by valid JSON escape chars (", \, /, b, f, n, r, t, u)
      jsonText = jsonText.replace(/\\(?!["\\/bfnrtu])/g, '\\\\');

      parsed = JSON.parse(jsonText);
    } catch (parseError) {
      logger.error("🎯 [QUIZ-WORKER] Failed to parse JSON:", parseError);
      logger.error("🎯 [QUIZ-WORKER] Raw response:", result.text);
      throw new Error("Failed to parse quiz generation response");
    }

    // Validate and transform questions - ALWAYS generate new unique IDs
    // to prevent collisions when adding questions to existing quizzes
    const questions: QuizQuestion[] = parsed.questions.map((q) => ({
      id: generateItemId(), // Always use unique ID, ignore AI-generated IDs (they're predictable like q_001)
      type: q.type as QuestionType,
      questionText: q.questionText || q.question_text || q.text || "",
      options: q.options || [],
      correctIndex: q.correctIndex ?? q.correct_index ?? 0,
      hint: q.hint,
      explanation: q.explanation || "No explanation provided.",
    }));

    logger.debug("🎯 [QUIZ-WORKER] Generated quiz:", {
      title: parsed.title,
      questionCount: questions.length,
    });

    return {
      title: parsed.title || params.topic || "Quiz",
      questions,
    };
  } catch (error) {
    logger.error("🎯 [QUIZ-WORKER] Error:", error);
    throw error;
  }
}
