import { z } from "zod";
import { logger } from "@/lib/utils/logger";
import { workspaceWorker } from "@/lib/ai/workers";
import { loadWorkspaceState } from "@/lib/workspace/state-loader";
import type { WorkspaceToolContext } from "./workspace-tools";

/**
 * Parse flashcard text format into structured data
 */
function parseFlashcardText(rawInput: any): { title?: string; deckName?: string; cards: Array<{ front: string; back: string }> } {
    let title: string | undefined;
    let deckName: string | undefined;
    const cards: Array<{ front: string; back: string }> = [];

    try {
        let text = typeof rawInput === 'string'
            ? rawInput
            : (rawInput?.description || rawInput?.text || rawInput?.content || JSON.stringify(rawInput));

        // Convert escaped newlines to actual newlines
        text = text.replace(/\\n/g, '\n');

        // Extract title (for creation)
        const titleMatch = text.match(/Title:\s*(.+?)(?:\n|$)/i);
        if (titleMatch) {
            title = titleMatch[1].trim();
        }

        // Extract deck name (for updates)
        const deckMatch = text.match(/Deck:\s*(.+?)(?:\n|$)/i);
        if (deckMatch) {
            deckName = deckMatch[1].trim();
        }

        // Extract Front/Back pairs using a pattern that captures content between markers
        // Fixed regex: use $ end anchor properly to capture last card
        const cardPattern = /Front:\s*([\s\S]*?)(?=\nBack:)\nBack:\s*([\s\S]*?)(?=\n\nFront:|$)/gi;
        let match;

        while ((match = cardPattern.exec(text)) !== null) {
            const front = match[1].trim();
            const back = match[2].trim();
            if (front && back) {
                cards.push({ front, back });
            }
        }

        // Fallback: try a simpler line-by-line pattern if the above didn't match
        if (cards.length === 0) {
            const lines = text.split('\n');
            let currentFront: string | null = null;

            for (const line of lines) {
                const frontMatch = line.match(/^Front:\s*(.+)/i);
                const backMatch = line.match(/^Back:\s*(.+)/i);

                if (frontMatch) {
                    currentFront = frontMatch[1].trim();
                } else if (backMatch && currentFront) {
                    cards.push({ front: currentFront, back: backMatch[1].trim() });
                    currentFront = null;
                }
            }
        }
    } catch (parseError) {
        logger.error("Error parsing flashcard input:", parseError);
    }

    return { title, deckName, cards };
}

/**
 * Create the createFlashcards tool
 */
export function createFlashcardsTool(ctx: WorkspaceToolContext) {
    return {
        description: `Create a new flashcard deck in the workspace. Use this when the user asks to generate flashcards or study materials.

IMPORTANT: Use this simple text format (NOT JSON):

Title: [Your Deck Title]

Front: [Question or term for card 1]
Back: [Answer or definition for card 1]

Front: [Question or term for card 2]
Back: [Answer or definition for card 2]

EXAMPLE:
Title: Biology Cell Structure

Front: What is the function of mitochondria?
Back: Mitochondria are the powerhouses of the cell. They produce ATP through cellular respiration.

Front: Define photosynthesis
Back: Photosynthesis is the process by which plants convert light energy into chemical energy.

Math is supported within the Front/Back content. Use $$...$$ for ALL math expressions (both inline and block). Single $ is for currency only.`,
        inputSchema: z.any().describe(
            "Plain text in the format: Title: [title]\\n\\nFront: [question]\\nBack: [answer]\\n\\nFront: [question]\\nBack: [answer]\\n... Use this simple text format, NOT JSON."
        ),
        execute: async (rawInput: any) => {
            logger.debug("🎴 [CREATE-FLASHCARDS] Tool execution started");

            const { title = "Flashcard Deck", cards } = parseFlashcardText(rawInput);

            if (cards.length === 0) {
                logger.error("❌ [CREATE-FLASHCARDS] No valid cards found in input");
                return {
                    success: false,
                    message: "No valid flashcards found. Please use the format: Front: [question]\\nBack: [answer]",
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

IMPORTANT: Use this simple text format:

Deck: [Name of the existing deck to add cards to]

Front: [Question or term for new card 1]
Back: [Answer or definition for new card 1]

Front: [Question or term for new card 2]
Back: [Answer or definition for new card 2]

EXAMPLE:
Deck: Biology Cell Structure

Front: What is the nucleus?
Back: The nucleus is the control center of the cell containing DNA.

Front: What is the cytoplasm?
Back: The cytoplasm is the gel-like substance inside the cell membrane.

The deck name will be matched using fuzzy search. Math is supported. Use $$...$$ for ALL math expressions (both inline and block). Single $ is for currency only.`,
        inputSchema: z.any().describe(
            "Plain text in the format: Deck: [deck name]\\n\\nFront: [question]\\nBack: [answer]\\n\\nFront: [question]\\nBack: [answer]\\n..."
        ),
        execute: async (rawInput: any) => {
            const { deckName, cards: cardsToAdd } = parseFlashcardText(rawInput);

            if (!deckName) {
                return {
                    success: false,
                    message: "Deck name is required. Use 'Deck: [name]' to specify which deck to update.",
                };
            }

            if (cardsToAdd.length === 0) {
                return {
                    success: false,
                    message: "No valid cards found. Use 'Front: [question]\\nBack: [answer]' format.",
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
