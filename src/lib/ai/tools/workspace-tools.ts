import { tool, zodSchema } from "ai";
import { z } from "zod";
import { logger } from "@/lib/utils/logger";
import { workspaceWorker } from "@/lib/ai/workers";
import { loadWorkspaceState } from "@/lib/workspace/state-loader";
import type { Item } from "@/lib/workspace-state/types";
import { loadStateForTool, resolveItem, getAvailableItemsList, withSanitizedModelOutput } from "./tool-utils";

// Note: Edit functionality is in edit-item-tool.ts (editItem)

export interface WorkspaceToolContext {
    workspaceId: string | null;
    userId: string | null;
    activeFolderId?: string;
    threadId?: string | null;
}

/**
 * Create the createDocument tool
 */
export function createDocumentTool(ctx: WorkspaceToolContext) {
    return withSanitizedModelOutput(tool({
        description: "Create a document card. Documents use a rich TipTap editor with full markdown support (headings, lists, tables, math, etc.). Use this for longer-form structured content.",
        inputSchema: zodSchema(
            z.object({
                title: z.string().describe("The title of the document card"),
                content: z.string().describe("The markdown body content. CRITICAL: DO NOT repeat the title in content — the title is displayed separately. Start with subheadings or body text only."),
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

            logger.debug("🎯 [ORCHESTRATOR] Delegating to Workspace Worker (create document):", {
                title,
                contentLength: content.length,
                sourcesCount: sources?.length,
            });

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
                itemType: "document",
                folderId: ctx.activeFolderId,
            });
        },
    }));
}

/**
 * Create the deleteItem tool
 */
export function createDeleteItemTool(ctx: WorkspaceToolContext) {
    return withSanitizedModelOutput(tool({
        description: "Delete a workspace item by name. Can be restored from version history.",
        inputSchema: zodSchema(
            z.object({
                itemName: z.string().describe("Item name or virtual path (e.g. pdfs/Report.pdf) to delete"),
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

                // Resolve by virtual path or fuzzy name match (any type)
                const matchedItem = resolveItem(state.items, itemName);

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
    }));
}
