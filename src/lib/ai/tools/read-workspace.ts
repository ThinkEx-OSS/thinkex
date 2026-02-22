import { tool, zodSchema } from "ai";
import { z } from "zod";
import { loadStateForTool } from "./tool-utils";
import { fuzzyMatchItem } from "./tool-utils";
import { resolveItemByPath } from "./workspace-search-utils";
import { formatItemContent } from "@/lib/utils/format-workspace-context";
import { getVirtualPath } from "@/lib/utils/virtual-workspace-fs";
import { recordWorkspaceItemRead } from "@/lib/db/workspace-item-reads";
import { logger } from "@/lib/utils/logger";
import { isValidThreadIdForDb } from "@/lib/utils/thread-id";
import type { WorkspaceToolContext } from "./workspace-tools";

const DEFAULT_LIMIT = 500;
const MAX_LIMIT = 2000;
const MAX_LINE_LENGTH = 2000;

export function createReadWorkspaceTool(ctx: WorkspaceToolContext) {
    return tool({
        description:
            "Read content of a workspace item (note, flashcard deck, PDF summary, quiz) by path or name. Usage: By default returns up to 500 lines from the start. The lineStart parameter is the 1-indexed line number to start from — call again with a larger lineStart to read later sections. For PDFs: use pageStart and pageEnd (1-indexed) to read only specific pages — e.g. pageStart=5, pageEnd=10 reads pages 5–10. Use searchWorkspace to find specific content in large items. Contents are returned with each line prefixed by its line number as <line>: <content>. Any line longer than 2000 characters is truncated. Avoid tiny repeated slices (e.g. 30-line chunks); read a larger window. REQUIRED before targeted updateNote edits — the tool will error otherwise.",
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
                lineStart: z
                    .number()
                    .int()
                    .min(1)
                    .optional()
                    .describe("1-based line number to start from (default 1). Use with limit for pagination."),
                limit: z
                    .number()
                    .int()
                    .min(1)
                    .max(MAX_LIMIT)
                    .optional()
                    .describe(`Max lines to return (default ${DEFAULT_LIMIT}, max ${MAX_LIMIT}). Use with lineStart for pagination.`),
                pageStart: z
                    .number()
                    .int()
                    .min(1)
                    .optional()
                    .describe("For PDFs only: 1-indexed start page (e.g. 5 for page 5). Use with pageEnd to read a page range."),
                pageEnd: z
                    .number()
                    .int()
                    .min(1)
                    .optional()
                    .describe("For PDFs only: 1-indexed end page inclusive (e.g. 10 for pages 5–10). Use with pageStart."),
            })
        ),
        execute: async ({ path, itemName, lineStart = 1, limit = DEFAULT_LIMIT, pageStart, pageEnd }) => {
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

            const pdfPageRange =
                item.type === "pdf" && (pageStart != null || pageEnd != null)
                    ? { pageStart, pageEnd }
                    : undefined;

            const fullContent = formatItemContent(item, pdfPageRange);
            const allLines = fullContent.split(/\r?\n/);
            const totalLines = allLines.length;
            const startIdx = Math.max(0, lineStart - 1);
            const cappedLimit = Math.min(limit, MAX_LIMIT);
            const slice = allLines.slice(startIdx, startIdx + cappedLimit);
            const content = slice
                .map((line, i) => {
                    const lineNum = startIdx + 1 + i;
                    const truncated =
                        line.length > MAX_LINE_LENGTH
                            ? line.substring(0, MAX_LINE_LENGTH) + "..."
                            : line;
                    return `${lineNum}: ${truncated}`;
                })
                .join("\n");
            const lineEnd = startIdx + slice.length;
            const hasMore = lineEnd < totalLines;

            const vpath = getVirtualPath(item, items);

            // Record read for read-before-write enforcement (targeted edits)
            // Skip when threadId is a placeholder (e.g. DEFAULT_THREAD_ID before thread is created)
            logger.debug("[readWorkspace] Recording read:", {
                threadId: ctx.threadId,
                threadIdType: typeof ctx.threadId,
                isValidForDb: isValidThreadIdForDb(ctx.threadId),
                itemId: item.id,
                lastModified: item.lastModified ?? 0,
            });
            if (isValidThreadIdForDb(ctx.threadId)) {
                try {
                    await recordWorkspaceItemRead(
                        ctx.threadId,
                        item.id,
                        item.lastModified ?? 0
                    );
                    logger.debug("[readWorkspace] Recorded read successfully");
                } catch (err) {
                    logger.warn("[readWorkspace] Failed to record read:", err);
                }
            } else {
                logger.debug("[readWorkspace] Skipping record (invalid threadId for DB)");
            }

            return {
                success: true,
                itemName: item.name,
                type: item.type,
                path: vpath,
                content,
                totalLines,
                lineStart: startIdx + 1,
                lineEnd,
                hasMore,
                ...(hasMore && { nextLineStart: lineEnd + 1 }),
                ...(item.type === "pdf" &&
                    Array.isArray((item.data as { ocrPages?: unknown[] })?.ocrPages) && {
                    totalPages: (item.data as { ocrPages: unknown[] }).ocrPages.length,
                    ...(pdfPageRange && {
                        pageRange: {
                            start: pdfPageRange.pageStart,
                            end: pdfPageRange.pageEnd,
                        },
                    }),
                }),
            };
        },
    });
}
