import { tool, zodSchema } from "ai";
import { z } from "zod";
import { loadStateForTool } from "./tool-utils";
import { fuzzyMatchItem } from "./tool-utils";
import { resolveItemByPath } from "./workspace-search-utils";
import { formatItemContent } from "@/lib/utils/format-workspace-context";
import { getVirtualPath } from "@/lib/utils/virtual-workspace-fs";
import type { WorkspaceToolContext } from "./workspace-tools";

export function createReadWorkspaceTool(ctx: WorkspaceToolContext) {
    return tool({
        description:
            "Read the full content of a workspace item (note, flashcard deck, PDF summary, quiz) by path or name. Use path when items share the same name. Use when you need the complete content of a specific card to answer questions or perform updates.",
        inputSchema: zodSchema(
            z.object({
                path: z
                    .string()
                    .optional()
                    .describe(
                        "Virtual path (e.g. Physics/notes/Thermodynamics.md) — unambiguous when duplicates exist"
                    ),
                itemName: z
                    .string()
                    .optional()
                    .describe(
                        "Name for fuzzy match — use when path unknown; if multiple items share the name, use path instead"
                    ),
            })
        ),
        execute: async ({ path, itemName }) => {
            if (!path?.trim() && !itemName?.trim()) {
                return {
                    success: false,
                    message: "Either path or itemName is required",
                };
            }

            const accessResult = await loadStateForTool(ctx);
            if (!accessResult.success) return accessResult;

            const { state } = accessResult;
            const items = state.items;

            let item = null;

            if (path?.trim()) {
                item = resolveItemByPath(items, path.trim());
            }

            if (!item && itemName?.trim()) {
                const exactMatches = items.filter(
                    (i) =>
                        i.type !== "folder" &&
                        i.name.toLowerCase().trim() === itemName.toLowerCase().trim()
                );
                if (exactMatches.length > 1) {
                    const paths = exactMatches.map((m) => getVirtualPath(m, items)).join(", ");
                    return {
                        success: false,
                        message: `Multiple items named "${itemName}". Use path to disambiguate: ${paths}`,
                    };
                }
                item = fuzzyMatchItem(items, itemName.trim());
            }

            if (!item) {
                const contentItems = items.filter((i) => i.type !== "folder");
                const sample = contentItems.slice(0, 5).map((i) => getVirtualPath(i, items)).join(", ");
                return {
                    success: false,
                    message: `Item not found${itemName ? `: "${itemName}"` : ` at path: ${path}`}. ${
                        sample ? `Example paths: ${sample}` : "Workspace may be empty. Use searchWorkspace to search."
                    }`,
                };
            }

            if (item.type === "folder") {
                return {
                    success: false,
                    message: "Folders have no readable content. Use path to a note, flashcard, PDF, or quiz.",
                };
            }

            const content = formatItemContent(item);
            const vpath = getVirtualPath(item, items);

            return {
                success: true,
                itemName: item.name,
                type: item.type,
                path: vpath,
                content,
            };
        },
    });
}
