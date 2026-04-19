import { tool, zodSchema } from "ai";
import { z } from "zod";
import { logger } from "@/lib/utils/logger";
import { workspaceWorker } from "@/lib/ai/workers";
import { loadStateForTool, resolveItem, withSanitizedModelOutput } from "./tool-utils";
import { normalizeWorkspaceItems } from "@/lib/workspace-state/state";
import { sourceSchema } from "@/lib/workspace-state/item-data-schemas";
import { getVirtualPath } from "@/lib/utils/workspace-fs";

// Note: Edit functionality is in edit-item-tool.ts (item_edit)

export interface WorkspaceToolContext {
    workspaceId: string | null;
    userId: string | null;
    activeFolderId?: string;
    threadId?: string | null;
}

/**
 * Create the document_create tool
 */
export function createDocumentTool(ctx: WorkspaceToolContext) {
    return withSanitizedModelOutput(tool({
        description: "Create a document card. Documents use a rich TipTap editor with full markdown support (headings, lists, tables, math, etc.). Use this for longer-form structured content.",
        inputSchema: zodSchema(
            z.object({
                title: z.string().describe("The title of the document card"),
                content: z.string().describe("The markdown body content. CRITICAL: DO NOT repeat the title in content — the title is displayed separately. Start with subheadings or body text only."),
                sources: z.array(sourceSchema).optional().describe("Optional sources from web search or deep research"),
            })
        ),
        strict: true,
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
 * Create the item_delete tool
 */
export function createDeleteItemTool(ctx: WorkspaceToolContext) {
    return withSanitizedModelOutput(tool({
        description: "Delete a workspace item by exact name or virtual path (e.g. pdfs/Report.pdf). Names are matched case-insensitively and must be exact. If multiple items share the same name, pass a virtual path instead.",
        inputSchema: zodSchema(
            z.object({
                itemName: z.string().describe("Item name or virtual path (e.g. pdfs/Report.pdf) to delete"),
            })
        ),
        strict: true,
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

                const state = normalizeWorkspaceItems(accessResult.state);

                const resolved = resolveItem(state, itemName);
                if (!resolved.ok) {
                    if (resolved.reason === "ambiguous") {
                        const paths = resolved.matches
                            .map((m) => `"${getVirtualPath(m, state)}"`)
                            .join(", ");
                        return {
                            success: false,
                            message: `Multiple items named "${itemName}". Pass a virtual path to disambiguate: ${paths}`,
                        };
                    }
                    const availableItems = state.map(i => `"${i.name}" (${i.type})`).slice(0, 5).join(", ");
                    return {
                        success: false,
                        message: `Could not find item "${itemName}". ${availableItems ? `Available items: ${availableItems}` : 'No items found in workspace.'}`,
                    };
                }
                const matchedItem = resolved.item;

                logger.debug("🎯 [DELETE-ITEM] Resolved item:", {
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
