import { z } from "zod";
import { tool, zodSchema } from "ai";
import { logger } from "@/lib/utils/logger";
import { workspaceWorker } from "@/lib/ai/workers";
import type { WorkspaceToolContext } from "./workspace-tools";
import { loadStateForTool, resolveItem, resolveFolderByName, withSanitizedModelOutput } from "./tool-utils";
import { getVirtualPath } from "@/lib/utils/workspace-fs";
import { normalizeWorkspaceItems } from "@/lib/workspace-state/state";
import { flashcardCardInputSchema } from "@/lib/workspace-state/item-data-schemas";
/**
 * Create the flashcards_create tool
 */
export function createFlashcardsTool(ctx: WorkspaceToolContext) {
    return withSanitizedModelOutput(tool({
        description: "Create a new flashcard deck.",
        inputSchema: zodSchema(
            z.object({
                title: z.string().nullable().describe("The title of the flashcard deck (defaults to 'Flashcard Deck' if not provided)"),
                cards: z.array(flashcardCardInputSchema).min(1).describe("Array of flashcard objects, each with 'front' and 'back' properties"),
                folderName: z.string().optional().describe(
                    "Name of the folder to create this item in. If not provided, creates in the user's current folder view. Use this when you want to organize items into specific folders."
                ),
            })
        ),
        strict: true,
        execute: async (input: { title?: string | null; cards: Array<{ front: string; back: string }>; folderName?: string }) => {
            logger.debug("\ud83c\udccf [CREATE-FLASHCARDS] Tool execution started");

            const title = input.title || "Flashcard Deck";
            const cards = input.cards || [];

            if (cards.length === 0) {
                logger.error("\u274c [CREATE-FLASHCARDS] No valid cards found in input");
                return {
                    success: false,
                    message: "At least one flashcard is required. Provide an array of cards with 'front' and 'back' properties.",
                };
            }

            logger.debug("\ud83c\udfaf [ORCHESTRATOR] Delegating to Workspace Worker (create flashcard):", { title, cardCount: cards.length });

            if (!ctx.workspaceId) {
                logger.error("\u274c [CREATE-FLASHCARDS] No workspace context available");
                return {
                    success: false,
                    message: "No workspace context available",
                };
            }

            try {
                let targetFolderId = ctx.activeFolderId;
                if (input.folderName !== undefined) {
                    try {
                        const accessResult = await loadStateForTool(ctx);
                        if (!accessResult.success) return accessResult;
                        const state = normalizeWorkspaceItems(accessResult.state);
                        targetFolderId = resolveFolderByName(state, input.folderName, ctx.activeFolderId);
                    } catch (error) {
                        return {
                            success: false,
                            message: error instanceof Error ? error.message : String(error),
                        };
                    }
                }

                const result = await workspaceWorker("create", {
                    workspaceId: ctx.workspaceId,
                    title,
                    itemType: "flashcard",
                    flashcardData: { cards },
                    folderId: targetFolderId,
                });

                logger.debug("\u2705 [CREATE-FLASHCARDS] Worker result:", result);
                return result;
            } catch (error) {
                logger.error("\u274c [CREATE-FLASHCARDS] Error executing worker:", error);
                return {
                    success: false,
                    message: `Error creating flashcards: ${error instanceof Error ? error.message : String(error)}`,
                };
            }
        },
    }));
}

// Edit functionality is in edit-item-tool.ts (item_edit)

const AddFlashcardCardsInputSchema = z.object({
  itemName: z.string().describe("Name of the existing flashcard deck to add cards to (matched by fuzzy search)"),
  cards: z.array(flashcardCardInputSchema).min(1).describe("New cards to append, each with 'front' and 'back' text"),
});
export type AddFlashcardCardsInput = z.infer<typeof AddFlashcardCardsInputSchema>;

export function createFlashcardAddCardsTool(ctx: WorkspaceToolContext) {
  return withSanitizedModelOutput(
    tool({
      description:
        "Add cards to an existing flashcard deck. Use this instead of item_edit when you need to append new cards. " +
        "Uses the same card format as flashcards_create. Does NOT require workspace_read first.",
      inputSchema: zodSchema(AddFlashcardCardsInputSchema),
      strict: true,
      execute: async (input: AddFlashcardCardsInput) => {
        if (!input.cards || input.cards.length === 0) {
          return { success: false, message: "At least one card is required." };
        }
        if (!ctx.workspaceId) {
          return { success: false, message: "No workspace context available" };
        }

        const accessResult = await loadStateForTool(ctx);
        if (!accessResult.success) {
          return accessResult;
        }
        const state = normalizeWorkspaceItems(accessResult.state);
        const matchedItem = resolveItem(state, input.itemName);
        if (!matchedItem) {
          const sample = state.filter((i) => i.type !== "folder").slice(0, 5).map((i) => `"${i.name}" (${i.type})`).join(", ");
          return { success: false, message: `Could not find item "${input.itemName}". ${sample ? `Example items: ${sample}` : "Workspace may be empty."}` };
        }
        if (matchedItem.type !== "flashcard") {
          return { success: false, message: `Item "${matchedItem.name}" is not a flashcard deck (type: ${matchedItem.type}).` };
        }

        const contentItems = state.filter((i) => i.type !== "folder");
        const sameNameCandidates = contentItems.filter(
          (i) => i.name.toLowerCase().trim() === matchedItem.name.toLowerCase().trim()
        );
        if (sameNameCandidates.length > 1) {
          const paths = sameNameCandidates.map((c) => getVirtualPath(c, state)).join(", ");
          return { success: false, message: `Multiple items named "${matchedItem.name}". Disambiguate using path: ${paths}` };
        }

        try {
          const result = await workspaceWorker("add_cards", {
            workspaceId: ctx.workspaceId,
            itemId: matchedItem.id,
            cards: input.cards,
          });

          return {
            success: true,
            itemId: matchedItem.id,
            cardsAdded: result.cardsAdded,
            totalCards: result.totalCards,
            message: result.message,
          };
        } catch (error) {
          return {
            success: false,
            message: `Error adding cards: ${error instanceof Error ? error.message : String(error)}`,
          };
        }
      },
    })
  );
}
