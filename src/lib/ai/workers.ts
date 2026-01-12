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
import type { Item, NoteData } from "@/lib/workspace-state/types";
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
  action: "create" | "update" | "delete" | "updateFlashcard",
  params: {
    workspaceId: string;
    title?: string;
    content?: string; // For notes
    itemId?: string;

    itemType?: "note" | "flashcard"; // Defaults to "note" if undefined
    flashcardData?: {
      cards?: { front: string; back: string }[]; // For creating flashcards
      cardsToAdd?: { front: string; back: string }[]; // For updating flashcards (appending)
    };
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
          name: params.title || (itemType === "flashcard" ? "New Flashcard Deck" : "New Note"),
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
