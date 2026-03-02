import { z } from "zod";
import { tool, zodSchema } from "ai";
import { logger } from "@/lib/utils/logger";
import { workspaceWorker } from "@/lib/ai/workers";
import type { WorkspaceToolContext } from "./workspace-tools";
/**
 * Create the createFlashcards tool
 */
export function createFlashcardsTool(ctx: WorkspaceToolContext) {
    return tool({
        description: "Create a new flashcard deck.",
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

// Edit functionality is in edit-item-tool.ts (editItem)
