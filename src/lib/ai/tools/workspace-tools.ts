import { tool, zodSchema } from "ai";
import { z } from "zod";
import { logger } from "@/lib/utils/logger";
import { workspaceWorker } from "@/lib/ai/workers";
import { loadWorkspaceState } from "@/lib/workspace/state-loader";
import { formatSelectedCardsContext } from "@/lib/utils/format-workspace-context";
import type { Item } from "@/lib/workspace-state/types";
import { loadStateForTool, fuzzyMatchItem, getAvailableItemsList } from "./tool-utils";

export interface WorkspaceToolContext {
    workspaceId: string | null;
    userId: string | null;
    activeFolderId?: string;
}

/**
 * Create the createNote tool
 */
export function createNoteTool(ctx: WorkspaceToolContext) {
    return tool({
        description: "Create a note card.",
        inputSchema: zodSchema(
            z.object({
                title: z.string().describe("The title of the note card"),
                content: z.string().describe("The markdown body content. DO NOT repeat title in content. Start with subheadings/text."),
                sources: z.array(
                    z.object({
                        title: z.string().describe("Title of the source page"),
                        url: z.string().describe("URL of the source"),
                        favicon: z.string().optional().describe("Optional favicon URL"),
                    })
                ).optional().describe("Optional sources from web search or deep research"),
            })
        ),
        execute: async ({ title, content, sources }) => {
            // Validate inputs before use
            if (!title || typeof title !== 'string') {
                return {
                    success: false,
                    message: "Title is required and must be a string",
                };
            }
            if (content === undefined || content === null || typeof content !== 'string') {
                return {
                    success: false,
                    message: "Content is required and must be a string",
                };
            }

            logger.debug("🎯 [ORCHESTRATOR] Delegating to Workspace Worker (create note):", { title, contentLength: content.length, sourcesCount: sources?.length });

            if (!ctx.workspaceId) {
                return {
                    success: false,
                    message: "No workspace context available",
                };
            }

            return await workspaceWorker("create", {
                workspaceId: ctx.workspaceId,
                title,
                content,
                sources,
                folderId: ctx.activeFolderId,
            });
        },
    });
}

/**
 * Create the updateNote tool
 */
export function createUpdateNoteTool(ctx: WorkspaceToolContext) {
    return tool({
        description: "Update the content and/or title of an existing note.",
        inputSchema: zodSchema(
            z.object({
                noteName: z.string().describe("The name of the note to update (will be matched using fuzzy search)"),
                content: z.string().describe("The full note body ONLY (do not include the title as a header)."),
                title: z.string().optional().describe("New title for the note. If not provided, the existing title will be preserved."),
                sources: z.array(
                    z.object({
                        title: z.string().describe("Title of the source page"),
                        url: z.string().describe("URL of the source"),
                        favicon: z.string().optional().describe("Optional favicon URL"),
                    })
                ).optional().describe("Optional sources from web search or user-provided URLs"),
            }).passthrough()
        ),
        execute: async (input: { noteName: string; content: string; title?: string; sources?: Array<{ title: string; url: string; favicon?: string }> }) => {
            const noteName = input.noteName;
            const content = input.content;
            const title = input.title;

            if (!noteName) {
                return {
                    success: false,
                    message: "Note name is required to identify which note to update.",
                };
            }

            if (content === undefined || content === null) {
                return {
                    success: false,
                    message: "Content is required.",
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

                // Fuzzy match the note by name
                const matchedNote = fuzzyMatchItem(state.items, noteName, "note");

                if (!matchedNote) {
                    const availableNotes = getAvailableItemsList(state.items, "note");
                    return {
                        success: false,
                        message: `Could not find note "${noteName}". ${availableNotes ? `Available notes: ${availableNotes}` : 'No notes found in workspace.'}`,
                    };
                }

                logger.debug("🎯 [UPDATE-NOTE] Found note via fuzzy match:", {
                    searchedName: noteName,
                    matchedName: matchedNote.name,
                    matchedId: matchedNote.id,
                });

                const workerResult = await workspaceWorker("update", {
                    workspaceId: ctx.workspaceId,
                    itemId: matchedNote.id,
                    content: content,
                    title: title,
                    sources: input.sources,
                });

                if (workerResult.success) {
                    return {
                        ...workerResult,
                        noteName: matchedNote.name,
                    };
                }

                return workerResult;
            } catch (error) {
                logger.error("Error updating note:", error);
                return {
                    success: false,
                    message: `Error updating note: ${error instanceof Error ? error.message : String(error)}`,
                };
            }
        },
    });
}



/**
 * Create the deleteItem tool
 */
export function createDeleteItemTool(ctx: WorkspaceToolContext) {
    return tool({
        description: "Permanently delete a card/note from the workspace by name.",
        inputSchema: zodSchema(
            z.object({
                itemName: z.string().describe("The name of the item to delete (will be matched using fuzzy search)"),
            })
        ),
        execute: async ({ itemName }) => {
            logger.debug("🎯 [ORCHESTRATOR] Delegating to Workspace Worker (delete):", { itemName });

            if (!ctx.workspaceId) {
                return {
                    success: false,
                    message: "No workspace context available",
                };
            }

            try {
                // Load workspace state to find item by name
                const accessResult = await loadStateForTool(ctx);
                if (!accessResult.success) {
                    return accessResult;
                }

                const { state } = accessResult;

                // Fuzzy match the item by name (any type)
                const matchedItem = fuzzyMatchItem(state.items, itemName);

                if (!matchedItem) {
                    const availableItems = state.items.map(i => `"${i.name}" (${i.type})`).slice(0, 5).join(", ");
                    return {
                        success: false,
                        message: `Could not find item "${itemName}". ${availableItems ? `Available items: ${availableItems}` : 'No items found in workspace.'}`,
                    };
                }

                logger.debug("🎯 [DELETE-ITEM] Found item via fuzzy match:", {
                    searchedName: itemName,
                    matchedName: matchedItem.name,
                    matchedId: matchedItem.id,
                });

                const result = await workspaceWorker("delete", {
                    workspaceId: ctx.workspaceId,
                    itemId: matchedItem.id,
                });

                if (result.success) {
                    return {
                        ...result,
                        deletedItem: matchedItem.name,
                    };
                }

                return result;
            } catch (error) {
                logger.error("Error deleting item:", error);
                return {
                    success: false,
                    message: `Error deleting item: ${error instanceof Error ? error.message : String(error)}`,
                };
            }
        },
    });
}

/**
 * Create the selectCards tool
 */
export function createSelectCardsTool(ctx: WorkspaceToolContext) {
    return tool({
        description: "Select cards by their titles and add them to conversation context.",
        inputSchema: zodSchema(
            z.object({
                cardTitles: z.array(z.string()).describe("Array of card titles to search for and select"),
            })
        ),
        execute: async ({ cardTitles }) => {

            if (!cardTitles || cardTitles.length === 0) {
                return {
                    success: false,
                    message: "cardTitles array must be provided and non-empty.",
                    context: "",
                };
            }

            if (!ctx.workspaceId) {
                return {
                    success: false,
                    message: "No workspace context available",
                    context: "",
                };
            }

            try {
                // Load workspace state to access all items
                const state = await loadWorkspaceState(ctx.workspaceId);

                if (!state || !state.items || state.items.length === 0) {
                    return {
                        success: true,
                        message: `No cards found in workspace. Requested selection of ${cardTitles.length} card${cardTitles.length === 1 ? "" : "s"}: ${cardTitles.join(", ")}.`,
                        addedCount: 0,
                        context: "",
                    };
                }

                // Perform fuzzy matching (matching client-side logic)
                // 1. Exact match first
                // 2. Contains match if no exact match
                const selectedItems: Item[] = [];
                const processedIds = new Set<string>();

                for (const title of cardTitles) {
                    const searchTitle = title.toLowerCase().trim();

                    // Try exact match first
                    let match = state.items.find(
                        item => item.name.toLowerCase().trim() === searchTitle && !processedIds.has(item.id)
                    );

                    // If no exact match, try contains match
                    if (!match) {
                        match = state.items.find(
                            item => item.name.toLowerCase().includes(searchTitle) && !processedIds.has(item.id)
                        );
                    }

                    if (match) {
                        selectedItems.push(match);
                        processedIds.add(match.id);
                    }
                }

                // Format the selected cards context
                const context = formatSelectedCardsContext(selectedItems, state.items);

                const addedCount = selectedItems.length;
                const notFoundCount = cardTitles.length - addedCount;

                let message = `Selected ${addedCount} card${addedCount === 1 ? "" : "s"}`;
                if (notFoundCount > 0) {
                    message += ` (${notFoundCount} not found)`;
                }
                message += `: ${selectedItems.map(item => item.name).join(", ")}`;

                return {
                    success: true,
                    message,
                    addedCount,
                    context, // Return formatted context so AI has immediate access
                    cardTitles: cardTitles,
                };
            } catch (error: any) {
                logger.error("❌ [SELECT-CARDS] Error loading workspace state:", error);
                return {
                    success: false,
                    message: `Failed to load workspace state: ${error?.message || String(error)}`,
                    context: "",
                };
            }
        },
    });
}
