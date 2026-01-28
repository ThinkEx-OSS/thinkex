import { z } from "zod";
import { zodSchema } from "ai";
import { logger } from "@/lib/utils/logger";
import { workspaceWorker } from "@/lib/ai/workers";
import { loadWorkspaceState } from "@/lib/workspace/state-loader";
import type { WorkspaceToolContext } from "./workspace-tools";

/**
 * Create the createFlashcards tool
 */
export function createFlashcardsTool(ctx: WorkspaceToolContext) {
    return {
        description: `Create a new flashcard deck in the workspace. Use this when the user asks to generate flashcards or study materials.

Provide a structured object with:
- title (optional): The title of the flashcard deck (defaults to "Flashcard Deck")
- cards (required): An array of flashcard objects, each with:
  - front: The question or term on the front of the card
  - back: The answer or definition on the back of the card

EXAMPLE:
{
  "title": "Biology Cell Structure",
  "cards": [
    {
      "front": "What is the function of mitochondria?",
      "back": "Mitochondria are the powerhouses of the cell. They produce ATP through cellular respiration."
    },
    {
      "front": "Define photosynthesis",
      "back": "Photosynthesis is the process by which plants convert light energy into chemical energy."
    }
  ]
}

Math is supported within the front/back content. Use $$...$$ for ALL math expressions (both inline and block). Single $ is for currency only.`,
        inputSchema: zodSchema(
            z.object({
                title: z.string().optional().describe("The title of the flashcard deck (defaults to 'Flashcard Deck' if not provided)"),
                cards: z.array(
                    z.object({
                        front: z.string().describe("The question or term on the front of the card"),
                        back: z.string().describe("The answer or definition on the back of the card"),
                    })
                ).min(1).describe("Array of flashcard objects, each with 'front' and 'back' properties"),
            }).passthrough()
        ),
        execute: async (input: { title?: string; cards: Array<{ front: string; back: string }> }) => {
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
    };
}

/**
 * Create the updateFlashcards tool
 */
export function createUpdateFlashcardsTool(ctx: WorkspaceToolContext) {
    return {
        description: `Add more flashcards to an existing flashcard deck. Use this when the user wants to expand an existing deck with additional cards.

Provide a structured object with:
- deckName (required): The name or ID of the flashcard deck to update (will be matched using fuzzy search)
- cards (required): An array of flashcard objects to add, each with:
  - front: The question or term on the front of the card
  - back: The answer or definition on the back of the card

EXAMPLE:
{
  "deckName": "Biology Cell Structure",
  "cards": [
    {
      "front": "What is the nucleus?",
      "back": "The nucleus is the control center of the cell containing DNA."
    },
    {
      "front": "What is the cytoplasm?",
      "back": "The cytoplasm is the gel-like substance inside the cell membrane."
    }
  ]
}

Math is supported within the front/back content. Use $$...$$ for ALL math expressions (both inline and block). Single $ is for currency only.`,
        inputSchema: zodSchema(
            z.object({
                deckName: z.string().describe("The name or ID of the flashcard deck to update"),
                cards: z.array(
                    z.object({
                        front: z.string().describe("The question or term on the front of the card"),
                        back: z.string().describe("The answer or definition on the back of the card"),
                    })
                ).min(1).describe("Array of flashcard objects to add, each with 'front' and 'back' properties"),
            }).passthrough()
        ),
        execute: async (input: { deckName: string; cards: Array<{ front: string; back: string }> }) => {
            const deckName = input.deckName;
            const cardsToAdd = input.cards || [];

            if (!deckName) {
                return {
                    success: false,
                    message: "Deck name is required to identify which deck to update.",
                };
            }

            if (cardsToAdd.length === 0) {
                return {
                    success: false,
                    message: "At least one flashcard is required. Provide an array of cards with 'front' and 'back' properties.",
                };
            }

            if (!ctx.workspaceId) {
                return {
                    success: false,
                    message: "No workspace context available",
                };
            }

            try {
                // Security: Verify workspace ownership before loading state
                if (!ctx.userId) {
                    return { success: false, message: "User not authenticated" };
                }

                const { db, workspaces } = await import("@/lib/db/client");
                const { eq } = await import("drizzle-orm");

                const workspace = await db
                    .select({ userId: workspaces.userId })
                    .from(workspaces)
                    .where(eq(workspaces.id, ctx.workspaceId))
                    .limit(1);

                if (!workspace[0]) {
                    return { success: false, message: "Workspace not found" };
                }

                if (workspace[0].userId !== ctx.userId) {
                    logger.warn(`🔒 [UPDATE-FLASHCARDS] Access denied for user ${ctx.userId} to workspace ${ctx.workspaceId}`);
                    return {
                        success: false,
                        message: "Access denied. You do not have permission to update flashcards in this workspace.",
                    };
                }

                const state = await loadWorkspaceState(ctx.workspaceId);
                const searchName = deckName.toLowerCase().trim();

                const flashcardDecks = state.items.filter(item => item.type === 'flashcard');

                // Fuzzy matching
                let matchedDeck = flashcardDecks.find(item => item.name.toLowerCase().trim() === searchName);
                if (!matchedDeck) {
                    matchedDeck = flashcardDecks.find(item => item.name.toLowerCase().includes(searchName));
                }
                if (!matchedDeck) {
                    matchedDeck = flashcardDecks.find(item => searchName.includes(item.name.toLowerCase().trim()));
                }

                if (!matchedDeck) {
                    const availableDecks = flashcardDecks.map(d => `"${d.name}"`).join(", ");
                    return {
                        success: false,
                        message: `Could not find flashcard deck "${deckName}". ${availableDecks ? `Available decks: ${availableDecks}` : 'No flashcard decks found in workspace.'}`,
                    };
                }

                const workerResult = await workspaceWorker("updateFlashcard", {
                    workspaceId: ctx.workspaceId,
                    itemId: matchedDeck.id,
                    itemType: "flashcard",
                    flashcardData: { cardsToAdd },
                });

                if (workerResult.success) {
                    return {
                        ...workerResult,
                        deckName: matchedDeck.name,
                        cardsAdded: cardsToAdd.length,
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
    };
}
