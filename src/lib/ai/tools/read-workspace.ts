import { tool, zodSchema } from "ai";
import { z } from "zod";
import { loadStateForTool } from "./tool-utils";
import { fuzzyMatchItem } from "./tool-utils";
import { resolveItemByPath } from "./workspace-search-utils";
import { formatItemContent } from "@/lib/utils/format-workspace-context";
import { getVirtualPath } from "@/lib/utils/workspace-fs";
import type { WorkspaceToolContext } from "./workspace-tools";
import type { DocumentData } from "@/lib/workspace-state/types";
import { normalizeWorkspaceItems } from "@/lib/workspace-state/state";

const DEFAULT_LIMIT = 500;
const MAX_LIMIT = 2000;
const MAX_LINE_LENGTH = 2000;

const ReadWorkspaceResultSchema = z.discriminatedUnion("success", [
    z.object({
        success: z.literal(false),
        message: z.string(),
    }),
    z.object({
        success: z.literal(true),
        itemName: z.string(),
        type: z.string(),
        path: z.string(),
        content: z.string(),
        totalLines: z.number().int().nonnegative(),
        lineStart: z.number().int().min(1),
        lineEnd: z.number().int().nonnegative(),
        hasMore: z.boolean(),
        rangeNote: z.string(),
        nextLineStart: z.number().int().min(1).optional(),
        totalPages: z.number().int().min(1).optional(),
        pageRange: z
            .object({
                start: z.number().int().min(1).optional(),
                end: z.number().int().min(1).optional(),
            })
            .optional(),
    }),
]);

export function createReadWorkspaceTool(ctx: WorkspaceToolContext) {
    return tool({
        description:
            "Read content of a workspace item by path or name. Works for documents, flashcards, PDFs, quizzes, images, audio, websites, and YouTube cards when readable content or metadata exists. Content is returned as raw lines with no line-number prefixes, so it can be copied into item_edit as edits[].oldText (exact match) with newText for the replacement. The response includes rangeNote: 'Full content' when returning the entire item, or 'Lines X–Y of Z' (and 'has more' if there is more). Use lineStart (1-indexed) to read later sections. For PDFs: pageStart and pageEnd for page ranges. Use workspace_search to find content in large items. Quizzes include progress at the top when started. Any line longer than 2000 characters is truncated. Avoid tiny repeated slices; read a larger window.",
        inputSchema: zodSchema(
            z.object({
                path: z
                    .string()
                    .optional()
                    .describe(
                        "Virtual path (e.g. Physics/documents/Thermodynamics.md) — unambiguous when duplicates exist"
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
        outputSchema: zodSchema(ReadWorkspaceResultSchema),
        strict: true,
        execute: async ({ path, itemName, lineStart = 1, limit = DEFAULT_LIMIT, pageStart, pageEnd }) => {
            if (!path?.trim() && !itemName?.trim()) {
                return {
                    success: false,
                    message: "Either path or itemName is required",
                };
            }

            const accessResult = await loadStateForTool(ctx);
            if (!accessResult.success) return accessResult;

            const items = normalizeWorkspaceItems(accessResult.state);

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
                if (exactMatches.length === 1) {
                    item = exactMatches[0]!;
                } else {
                    item = fuzzyMatchItem(
                        items.filter((i) => i.type !== "folder"),
                        itemName.trim()
                    );
                }
            }

            if (!item) {
                const contentItems = items.filter((i) => i.type !== "folder");
                const sample = contentItems.slice(0, 5).map((i) => getVirtualPath(i, items)).join(", ");
                return {
                    success: false,
                    message: `Item not found${itemName ? `: "${itemName}"` : ` at path: ${path}`}. ${
                        sample ? `Example paths: ${sample}` : "Workspace may be empty. Use workspace_search to search."
                    }`,
                };
            }

            if (item.type === "folder") {
                return {
                    success: false,
                    message: "Folders have no readable content. Use path to a document, flashcard, PDF, quiz, image, audio, website, or YouTube item.",
                };
            }

            const pdfPageRange =
                item.type === "pdf" && (pageStart != null || pageEnd != null)
                    ? { pageStart, pageEnd }
                    : undefined;

            const fullContent =
                item.type === "document"
                    ? ((item.data as DocumentData).markdown ?? "")
                    : formatItemContent(item, pdfPageRange);
            const allLines = fullContent.split(/\r?\n/);
            const totalLines = allLines.length;
            const startIdx = Math.max(0, lineStart - 1);
            const cappedLimit = Math.min(limit, MAX_LIMIT);
            const slice = allLines.slice(startIdx, startIdx + cappedLimit);
            const content = slice
                .map((line) =>
                    line.length > MAX_LINE_LENGTH
                        ? line.substring(0, MAX_LINE_LENGTH) + "..."
                        : line
                )
                .join("\n");
            const lineEnd = startIdx + slice.length;
            const hasMore = lineEnd < totalLines;

            const rangeNote =
                !hasMore && startIdx === 0 && slice.length === totalLines
                    ? "Full content"
                    : hasMore
                      ? `Lines ${startIdx + 1}–${lineEnd} of ${totalLines} (has more)`
                      : `Lines ${startIdx + 1}–${lineEnd} of ${totalLines}`;

            const vpath = getVirtualPath(item, items);

            const pdfOutputFields: {
                totalPages?: number;
                pageRange?: { start?: number; end?: number };
            } = {};
            if (item.type === "pdf") {
                const ocr = (item.data as { ocrPages?: unknown[] }).ocrPages;
                const ocrLen = Array.isArray(ocr) ? ocr.length : 0;
                if (ocrLen > 0) {
                    pdfOutputFields.totalPages = ocrLen;
                }
                if (pdfPageRange) {
                    pdfOutputFields.pageRange = {
                        start: pdfPageRange.pageStart,
                        end: pdfPageRange.pageEnd,
                    };
                }
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
                rangeNote,
                ...(hasMore && { nextLineStart: lineEnd + 1 }),
                ...pdfOutputFields,
            };
        },
    });
}
