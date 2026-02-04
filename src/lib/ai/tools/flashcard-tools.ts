import { z } from "zod";
import { tool, zodSchema } from "ai";
import { logger } from "@/lib/utils/logger";
import { workspaceWorker } from "@/lib/ai/workers";
import type { WorkspaceToolContext } from "./workspace-tools";
import { loadStateForTool, fuzzyMatchItem, getAvailableItemsList } from "./tool-utils";

/**
 * Create the createFlashcards tool
 */
export function createFlashcardsTool(ctx: WorkspaceToolContext) {
    return tool({
        description: "Create a new flashcard deck. Use $$...$$ for ALL math expressions.",
        inputSchema: zodSchema(
            z.object({
                title: z.string().nullable().describe("The title of the flashcard deck (defaults to 'Flashcard Deck' if not provided)"),
                cards: z.array(
                    z.object({
                        front: z.string().describe("The question or term on the front of the card"),
                        back: z.string().describe("The answer or definition on the back of the card"),
                    })
                ).min(1).describe("Array of flashcard objects, each with 'front' and 'back' properties"),
            })
        ),
        execute: async (input: { title?: string | null; cards: Array<{ front: string; back: string }> }) => {
            logger.debug("🎴 [CREATE-FLASHCARDS] Tool execution started");

            const title = input.title || "Flashcard Deck";
            const cards = input.cards || [];

            if (cards.length === 0) {
                logger.error("❌ [CREATE-FLASHCARDS] No valid cards found in input");
                return {
                    success: false,
                    message: "At least one flashcard is required. Provide an array of cards with 'front' and 'back' properties.",
                };
            }

            logger.debug("🎯 [ORCHESTRATOR] Delegating to Workspace Worker (create flashcard):", { title, cardCount: cards.length });

            if (!ctx.workspaceId) {
                logger.error("❌ [CREATE-FLASHCARDS] No workspace context available");
                return {
                    success: false,
                    message: "No workspace context available",
                };
            }

            try {
                const result = await workspaceWorker("create", {
                    workspaceId: ctx.workspaceId,
                    title,
                    itemType: "flashcard",
                    flashcardData: { cards },
                    folderId: ctx.activeFolderId,
                });

                logger.debug("✅ [CREATE-FLASHCARDS] Worker result:", result);
                return result;
            } catch (error) {
                logger.error("❌ [CREATE-FLASHCARDS] Error executing worker:", error);
                return {
                    success: false,
                    message: `Error creating flashcards: ${error instanceof Error ? error.message : String(error)}`,
                };
            }
        },
    });
}

/**
 * Create the updateFlashcards tool
 */
export function createUpdateFlashcardsTool(ctx: WorkspaceToolContext) {
    return tool({
        description: "Add more flashcards to an existing flashcard deck and/or update its title. Use $$...$$ for ALL math expressions.",
        inputSchema: zodSchema(
            z.object({
                deckName: z.string().describe("The name or ID of the flashcard deck to update"),
                cards: z.array(
                    z.object({
                        front: z.string().describe("The question or term on the front of the card"),
                        back: z.string().describe("The answer or definition on the back of the card"),
                    })
                ).optional().describe("Array of flashcard objects to add, each with 'front' and 'back' properties"),
                title: z.string().optional().describe("New title for the flashcard deck. If not provided, the existing title will be preserved."),
            })
        ),
        execute: async (input: { deckName: string; cards?: Array<{ front: string; back: string }>; title?: string }) => {
            const deckName = input.deckName;
            const cardsToAdd = input.cards || [];
            const newTitle = input.title;

            if (!deckName) {
                return {
                    success: false,
                    message: "Deck name is required to identify which deck to update.",
                };
            }

            if (cardsToAdd.length === 0 && !newTitle) {
                return {
                    success: false,
                    message: "At least one flashcard must be provided OR a new title must be specified.",
                };
            }

            if (!ctx.workspaceId) {
                return {
                    success: false,
                    message: "No workspace context available",
                };
            }

            try {
                // Load workspace state (security is enforced by workspace-worker)
                const accessResult = await loadStateForTool(ctx);
                if (!accessResult.success) {
                    return accessResult;
                }

                const { state } = accessResult;

                // Fuzzy match the deck by name
                const matchedDeck = fuzzyMatchItem(state.items, deckName, "flashcard");

                if (!matchedDeck) {
                    const availableDecks = getAvailableItemsList(state.items, "flashcard");
                    return {
                        success: false,
                        message: `Could not find flashcard deck "${deckName}". ${availableDecks ? `Available decks: ${availableDecks}` : 'No flashcard decks found in workspace.'}`,
                    };
                }

                // Optimized: Update both title and cards in a single worker call
                const workerResult = await workspaceWorker("updateFlashcard", {
                    workspaceId: ctx.workspaceId,
                    itemId: matchedDeck.id,
                    itemType: "flashcard",
                    title: newTitle, // Pass title to rename
                    flashcardData: { cardsToAdd },
                });

                if (workerResult.success) {
                    return {
                        ...workerResult,
                        deckName: matchedDeck.name,
                        cardsAdded: cardsToAdd.length,
                        titleUpdated: !!newTitle,
                        newTitle: newTitle || undefined,
                    };
                }

                return workerResult;
            } catch (error) {
                logger.error("Error updating flashcards:", error);
                return {
                    success: false,
                    message: `Error updating flashcards: ${error instanceof Error ? error.message : String(error)}`,
                };
            }
        },
    });
}
