import { tool, zodSchema } from "ai";
import { z } from "zod";
import { loadStateForTool } from "./tool-utils";
import { extractSearchableText } from "./workspace-search-utils";
import { getVirtualPath } from "@/lib/utils/workspace-fs";
import type { WorkspaceToolContext } from "./workspace-tools";
import type { Item } from "@/lib/workspace-state/types";
import { normalizeWorkspaceItems } from "@/lib/workspace-state/state";

const MAX_LINE_LENGTH = 2000;
const MAX_MATCHES = 100;

const SearchWorkspaceResultSchema = z.discriminatedUnion("success", [
    z.object({
        success: z.literal(false),
        message: z.string(),
        matches: z.number().int().nonnegative(),
        output: z.string(),
    }),
    z.object({
        success: z.literal(true),
        matches: z.number().int().nonnegative(),
        truncated: z.boolean(),
        output: z.string(),
    }),
]);

function buildRegex(pattern: string): RegExp {
    const hasRegexChars = /[.*+?^${}()|[\]\\]/.test(pattern);
    if (hasRegexChars) {
        try {
            return new RegExp(pattern, "gi");
        } catch {
            return new RegExp(pattern.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi");
        }
    }
    const escaped = pattern.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return new RegExp(escaped, "gi");
}

export function createSearchWorkspaceTool(ctx: WorkspaceToolContext) {
    return tool({
        description:
            "Grep search across workspace. All item types match on path/title, including documents, flashcards, PDFs, quizzes, audio, images, and YouTube cards. Types with readable body content or metadata also search that body. Line numbers for content matches align with workspace_read(path, lineStart). include: optional item type filter. path: folder prefix or exact item path; for long items use workspace_read(path, lineStart) on matches. Plain text or regex. Max 100 matches.",
        inputSchema: zodSchema(
            z.object({
                pattern: z.string().describe("Search pattern (plain text or regex)"),
                include: z.string().optional().describe('Optional item type filter, e.g. "document", "flashcard", "pdf", "quiz", "audio", "image", or "youtube"'),
                path: z.string().optional().describe("Folder prefix (Physics/) or exact item path (Physics/documents/File.md)"),
            })
        ),
        outputSchema: zodSchema(SearchWorkspaceResultSchema),
        strict: true,
        execute: async ({ pattern, include, path: pathPrefix }) => {
            if (!pattern?.trim()) {
                return { success: false, message: "pattern is required", matches: 0, output: "" };
            }

            const accessResult = await loadStateForTool(ctx);
            if (!accessResult.success) {
                return {
                    success: false,
                    message: accessResult.message,
                    matches: 0,
                    output: "",
                };
            }

            const state = normalizeWorkspaceItems(accessResult.state);
            let items: Item[] = state.filter((i) => i.type !== "folder");

            if (include) {
                const type = include.toLowerCase().trim();
                items = items.filter((i) => i.type === type);
            }

            const normalizedPrefix = pathPrefix?.trim().replace(/\/+$/, "");
            if (normalizedPrefix) {
                items = items.filter((item) => {
                    const vp = getVirtualPath(item, state);
                    return vp.startsWith(normalizedPrefix) || vp.startsWith(normalizedPrefix + "/");
                });
            }

            const regex = buildRegex(pattern);
            type Match = { path: string; itemName: string; itemType: string; lineNum: number | null; matchKind?: "path" | "title"; lineText: string };
            const matches: Match[] = [];

            for (const item of items) {
                const { header, content } = extractSearchableText(item, state);
                const vpath = getVirtualPath(item, state);

                const truncate = (s: string) =>
                    s.length > MAX_LINE_LENGTH ? s.substring(0, MAX_LINE_LENGTH) + "..." : s;

                const headerLines = header ? header.split(/\r?\n/).filter(Boolean) : [];
                for (let i = 0; i < headerLines.length; i++) {
                    const line = headerLines[i]!;
                    if (regex.test(line)) {
                        regex.lastIndex = 0;
                        matches.push({
                            path: vpath,
                            itemName: item.name,
                            itemType: item.type,
                            lineNum: null,
                            matchKind: i === 0 ? "path" : "title",
                            lineText: truncate(line),
                        });
                    }
                }

                const contentLines = content ? content.split(/\r?\n/) : [];
                for (let i = 0; i < contentLines.length; i++) {
                    const line = contentLines[i]!;
                    if (regex.test(line)) {
                        regex.lastIndex = 0;
                        matches.push({
                            path: vpath,
                            itemName: item.name,
                            itemType: item.type,
                            lineNum: i + 1,
                            lineText: truncate(line),
                        });
                    }
                }
            }

            const truncated = matches.length > MAX_MATCHES;
            const finalMatches = truncated ? matches.slice(0, MAX_MATCHES) : matches;

            if (finalMatches.length === 0) {
                return {
                    success: true,
                    matches: 0,
                    truncated: false,
                    output: `No matches found for "${pattern}"${normalizedPrefix ? ` in ${normalizedPrefix}` : ""}`,
                };
            }

            const outputLines: string[] = [
                `Found ${matches.length} matches${truncated ? ` (showing first ${MAX_MATCHES})` : ""}`,
            ];
            let currentPath = "";
            for (const m of finalMatches) {
                if (currentPath !== m.path) {
                    if (currentPath) outputLines.push("");
                    currentPath = m.path;
                    outputLines.push(`${m.path}:`);
                }
                const loc = m.lineNum != null ? `Line ${m.lineNum}` : (m.matchKind === "path" ? "Path" : "Title");
                outputLines.push(`  ${loc}: ${m.lineText}`);
            }
            if (truncated) {
                outputLines.push("");
                outputLines.push(
                    `(Results truncated: showing ${MAX_MATCHES} of ${matches.length} matches. Consider using a more specific path or pattern.)`
                );
            }

            return {
                success: true,
                matches: matches.length,
                truncated,
                output: outputLines.join("\n"),
            };
        },
    });
}
