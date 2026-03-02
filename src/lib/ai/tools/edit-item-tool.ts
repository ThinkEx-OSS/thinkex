import { tool, zodSchema } from "ai";
import { z } from "zod";
import { logger } from "@/lib/utils/logger";
import { workspaceWorker } from "@/lib/ai/workers";
import type { WorkspaceToolContext } from "./workspace-tools";
import { loadStateForTool, resolveItem } from "./tool-utils";
import { getVirtualPath } from "@/lib/utils/virtual-workspace-fs";

const EDITABLE_TYPES = ["note", "flashcard", "quiz"] as const;

/**
 * Create the editItem tool - unified edit for notes, flashcards, and quizzes.
 * Uses oldString/newString search-replace on raw content from readWorkspace.
 */
export function createEditItemTool(ctx: WorkspaceToolContext) {
    return tool({
        description:
            "Edit a note, flashcard deck, or quiz. You must use readWorkspace at least once before editing. QUIZZES: readWorkspace may show '--- Progress (read-only) ---' at the top. That block is READ-ONLY. Never include it in oldString or newString. Only edit the {\"questions\":[...]} JSON. FULL REWRITE: oldString='' and newString=entire new content (quizzes: only the JSON). TARGETED EDIT: oldString must match exactly. When copying from readWorkspace: strip the line number prefix (e.g. '1: ' → the part after the space is the content). For notes, content starts at line 1 — no header to skip. Match exact whitespace, indentation, newlines. Do NOT minify JSON. Edit FAILS if oldString not found or matches multiple times — add more context or use replaceAll.",
        inputSchema: zodSchema(
            z
                .object({
                    itemName: z
                        .string()
                        .describe("Name of the item to edit (note, flashcard deck, or quiz; matched by fuzzy search)"),
                    oldString: z
                        .string()
                        .describe(
                            "Text to find. Use '' for full rewrite. For targeted edit: copy the content from readWorkspace but never include the line number prefix (e.g. 1: ). Match exact whitespace, indentation. Include enough context to make unique, or use replaceAll."
                        ),
                    newString: z.string().describe("Replacement text (entire content if oldString is empty)"),
                    replaceAll: z
                        .boolean()
                        .optional()
                        .default(false)
                        .describe("Replace every occurrence of oldString; use for renaming or changing repeated text."),
                    newName: z.string().optional().describe("Rename the item to this. If not provided, the existing name is preserved."),
                    sources: z
                        .array(
                            z.object({
                                title: z.string().describe("Title of the source page"),
                                url: z.string().describe("URL of the source"),
                                favicon: z.string().optional().describe("Optional favicon URL"),
                            })
                        )
                        .optional()
                        .describe("Optional sources (notes only)"),
                })
                .passthrough()
        ),
        execute: async (input: {
            itemName: string;
            oldString: string;
            newString: string;
            replaceAll?: boolean;
            newName?: string;
            sources?: Array<{ title: string; url: string; favicon?: string }>;
        }) => {
            const { itemName, oldString, newString, replaceAll, newName } = input;

            if (!itemName) {
                return {
                    success: false,
                    message: "itemName is required to identify which item to edit.",
                };
            }

            if (oldString === undefined || oldString === null) {
                return {
                    success: false,
                    message: "oldString is required. Use '' for full rewrite.",
                };
            }

            if (newString === undefined || newString === null) {
                return {
                    success: false,
                    message: "newString is required.",
                };
            }

            if (oldString === newString) {
                return {
                    success: false,
                    message: "No changes to apply: oldString and newString are identical.",
                };
            }

            if (!ctx.workspaceId) {
                return {
                    success: false,
                    message: "No workspace context available",
                };
            }

            try {
                const accessResult = await loadStateForTool(ctx);
                if (!accessResult.success) {
                    return accessResult;
                }

                const { state } = accessResult;
                const matchedItem = resolveItem(state.items, itemName);

                if (!matchedItem) {
                    const sample = state.items
                        .filter((i) => i.type !== "folder")
                        .slice(0, 5)
                        .map((i) => `"${i.name}" (${i.type})`)
                        .join(", ");
                    return {
                        success: false,
                        message: `Could not find item "${itemName}". ${sample ? `Example items: ${sample}` : "Workspace may be empty."}`,
                    };
                }

                const contentItems = state.items.filter((i) => i.type !== "folder");
                const sameNameCandidates = contentItems.filter(
                    (i) => i.name.toLowerCase().trim() === matchedItem.name.toLowerCase().trim()
                );
                if (sameNameCandidates.length > 1) {
                    const paths = sameNameCandidates.map((c) => getVirtualPath(c, state.items)).join(", ");
                    return {
                        success: false,
                        message: `Multiple items named "${matchedItem.name}". Disambiguate using path: ${paths}`,
                    };
                }

                if (!EDITABLE_TYPES.includes(matchedItem.type as (typeof EDITABLE_TYPES)[number])) {
                    return {
                        success: false,
                        message: `Item "${matchedItem.name}" is not editable (type: ${matchedItem.type}). Only notes, flashcards, and quizzes can be edited.`,
                    };
                }

                logger.debug("🎯 [EDIT-ITEM] Found item via fuzzy match:", {
                    searchedName: itemName,
                    matchedName: matchedItem.name,
                    matchedId: matchedItem.id,
                    type: matchedItem.type,
                });

                const workerResult = await workspaceWorker("edit", {
                    workspaceId: ctx.workspaceId,
                    itemId: matchedItem.id,
                    itemType: matchedItem.type as "note" | "flashcard" | "quiz",
                    itemName: matchedItem.name,
                    oldString,
                    newString,
                    replaceAll,
                    newName,
                    sources: input.sources,
                });

                if (workerResult.success) {
                    return {
                        ...workerResult,
                        itemName: newName ?? matchedItem.name,
                    };
                }

                return workerResult;
            } catch (error) {
                logger.error("Error editing item:", error);
                return {
                    success: false,
                    message: `Error editing item: ${error instanceof Error ? error.message : String(error)}`,
                };
            }
        },
    });
}
