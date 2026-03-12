/**
 * Shared utilities for workspace grep and read tools.
 */

import type { Item, NoteData, PdfData, FlashcardData, FlashcardItem, QuizData, AudioData } from "@/lib/workspace-state/types";
import { serializeBlockNote } from "@/lib/utils/serialize-blocknote";
import { getVirtualPath } from "@/lib/utils/workspace-fs";
import { type Block } from "@/components/editor/BlockNoteEditor";

export interface SearchableText {
    /** Path and title lines (1-2 lines). Matches here use matchKind, not lineNum. */
    header: string;
    /** Body content. Line numbers align with readWorkspace(path, lineStart). */
    content: string;
}

/**
 * Extract plain text from an item for searching (grep).
 * Returns header (path, title) and content separately so grep line numbers align with readWorkspace.
 * Header matches use matchKind (path/title); content matches use 1-based lineNum.
 */
export function extractSearchableText(item: Item, items: Item[]): SearchableText {
    const title = item.name?.trim() ?? "";
    const virtualPath = getVirtualPath(item, items);
    const header = [virtualPath, title].filter(Boolean).join("\n");

    const body = (content: string): SearchableText => ({
        header,
        content: content ?? "",
    });

    switch (item.type) {
        case "note": {
            const data = item.data as NoteData;
            if (Array.isArray(data.blockContent) && data.blockContent.length > 0) {
                return body(serializeBlockNote(data.blockContent as Block[]));
            }
            return { header, content: "" };
        }
        case "flashcard": {
            const data = item.data as FlashcardData;
            const cards: FlashcardItem[] =
                data.cards?.length
                    ? data.cards
                    : data.front || data.back
                        ? [{ id: "legacy", front: data.front ?? "", back: data.back ?? "", frontBlocks: data.frontBlocks, backBlocks: data.backBlocks }]
                        : [];
            const content = cards
                .map((c) => {
                    const front = c.frontBlocks ? serializeBlockNote(c.frontBlocks as Block[]) : c.front;
                    const back = c.backBlocks ? serializeBlockNote(c.backBlocks as Block[]) : c.back;
                    return `${front}\n${back}`;
                })
                .join("\n\n");
            return body(content);
        }
        case "pdf": {
            const data = item.data as PdfData;
            const content = data.ocrPages?.length
                ? data.ocrPages.map((p) => p.markdown).filter(Boolean).join("\n\n")
                : data.textContent ?? "";
            return body(content);
        }
        case "quiz": {
            const data = item.data as QuizData;
            const questions = data.questions ?? [];
            const content = questions
                .map(
                    (q) =>
                        `${q.questionText}\n${q.options?.join("\n") ?? ""}\n${q.explanation ?? ""}`
                )
                .join("\n\n");
            return body(content);
        }
        case "audio": {
            const data = item.data as AudioData;
            const parts: string[] = [];
            if (data.transcript) parts.push(data.transcript);
            if (data.segments?.length) {
                parts.push(
                    data.segments
                        .map((s) => `${s.content}${s.translation ? ` (${s.translation})` : ""}`)
                        .join("\n")
                );
            }
            return body(parts.join("\n"));
        }
        case "image":
        case "youtube":
        case "folder":
            return { header: header || (item.name ?? "") || "", content: "" };
        default:
            return { header, content: "" };
    }
}

/**
 * Resolve an item by virtual path.
 * Path format: "Physics/notes/Thermodynamics.md" or "notes/My Note.md"
 */
/** Known file extensions — avoid treating "4." in "4. Container Networking (2)" as extension */
const KNOWN_EXTENSIONS = /\.(pdf|md|url|png|audio|txt)$/i;

export function resolveItemByPath(items: Item[], pathInput: string): Item | null {
    const normalized = pathInput.trim().replace(/\/+/g, "/").replace(/^\//, "");
    if (!normalized) return null;

    const stripExt = (s: string) => s.replace(KNOWN_EXTENSIONS, "");

    // Try exact match on getVirtualPath first
    const contentItems = items.filter((i) => i.type !== "folder");
    const exact = contentItems.find((item) => getVirtualPath(item, items) === normalized);
    if (exact) return exact;

    // Try path without extension (user might omit .md etc.)
    const withoutExt = stripExt(normalized);
    const byPathNoExt = contentItems.find((item) => {
        const vp = getVirtualPath(item, items);
        return stripExt(vp) === withoutExt || vp === normalized;
    });
    if (byPathNoExt) return byPathNoExt;

    // Try matching last segment as filename (e.g. "Thermodynamics.md" -> item named "Thermodynamics")
    const segments = normalized.split("/").filter(Boolean);
    const filename = segments[segments.length - 1];
    const nameWithoutExt = stripExt(filename);

    const candidates = contentItems.filter((item) => {
        const vp = getVirtualPath(item, items);
        return vp.endsWith(filename) || vp.endsWith(nameWithoutExt + ".md") || vp.endsWith(nameWithoutExt + ".pdf");
    });

    if (candidates.length === 1) return candidates[0];
    if (candidates.length > 1) {
        // Prefer path that matches most segments
        const best = candidates.find((item) => getVirtualPath(item, items) === normalized);
        return best ?? candidates[0];
    }

    return null;
}
