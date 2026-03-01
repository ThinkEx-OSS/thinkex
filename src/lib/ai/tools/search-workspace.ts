import { tool, zodSchema } from "ai";
import { z } from "zod";
import { loadStateForTool } from "./tool-utils";
import { extractSearchableText } from "./workspace-search-utils";
import { getVirtualPath } from "@/lib/utils/virtual-workspace-fs";
import type { WorkspaceToolContext } from "./workspace-tools";
import type { Item } from "@/lib/workspace-state/types";

const MAX_LINE_LENGTH = 2000;
const MAX_MATCHES = 100;

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
            "Grep search across workspace (notes, flashcards, PDFs, quizzes, audio). Finds locations—use readWorkspace for full content. include: type filter (note, flashcard, pdf, quiz, audio). path: folder prefix or exact item path; for long items use exact path then readWorkspace(path, lineStart) on matches. Plain text or regex. Max 100 matches.",
        inputSchema: zodSchema(
            z.object({
                pattern: z.string().describe("Search pattern (plain text or regex)"),
                include: z.string().optional().describe('Item type: "note", "flashcard", "pdf", "quiz", "audio"'),
                path: z.string().optional().describe("Folder prefix (Physics/) or exact item path (Physics/notes/File.md)"),
            })
        ),
        execute: async ({ pattern, include, path: pathPrefix }) => {
            if (!pattern?.trim()) {
                return { success: false, message: "pattern is required", matches: 0, output: "" };
            }

            const accessResult = await loadStateForTool(ctx);
            if (!accessResult.success) return accessResult;

            const { state } = accessResult;
            let items: Item[] = state.items.filter((i) => i.type !== "folder");

            if (include) {
                const type = include.toLowerCase().trim();
                items = items.filter((i) => i.type === type);
            }

            const normalizedPrefix = pathPrefix?.trim().replace(/\/+$/, "");
            if (normalizedPrefix) {
                items = items.filter((item) => {
                    const vp = getVirtualPath(item, state.items);
                    return vp.startsWith(normalizedPrefix) || vp.startsWith(normalizedPrefix + "/");
                });
            }

            const regex = buildRegex(pattern);
            const matches: { path: string; itemName: string; itemType: string; lineNum: number; lineText: string }[] = [];

            for (const item of items) {
                const text = extractSearchableText(item, state.items);
                if (!text) continue;

                const lines = text.split(/\r?\n/);
                for (let i = 0; i < lines.length; i++) {
                    const line = lines[i];
                    if (regex.test(line)) {
                        regex.lastIndex = 0;
                        const truncated =
                            line.length > MAX_LINE_LENGTH ? line.substring(0, MAX_LINE_LENGTH) + "..." : line;
                        matches.push({
                            path: getVirtualPath(item, state.items),
                            itemName: item.name,
                            itemType: item.type,
                            lineNum: i + 1,
                            lineText: truncated,
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
                outputLines.push(`  Line ${m.lineNum}: ${m.lineText}`);
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
