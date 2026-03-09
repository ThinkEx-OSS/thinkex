/**
 * Shared utilities for workspace grep and read tools.
 */

import type { Item, NoteData, PdfData, FlashcardData, FlashcardItem, QuizData, AudioData } from "@/lib/workspace-state/types";
import { serializeBlockNote } from "@/lib/utils/serialize-blocknote";
import { getVirtualPath } from "@/lib/utils/virtual-workspace-fs";
import { type Block } from "@/components/editor/BlockNoteEditor";

/**
 * Extract plain text from an item for searching (grep).
 * Includes virtual path and item title as the first lines (so path-based names like "Summary- Lecture #1" match),
 * then content. Returns empty string for types with no searchable content.
 */
export function extractSearchableText(item: Item, items: Item[]): string {
    const title = item.name?.trim() ?? "";
    const virtualPath = getVirtualPath(item, items);
    const header = [virtualPath, title].filter(Boolean).join("\n");
    const withHeader = (content: string) =>
        content ? (header ? `${header}\n${content}` : content) : header;

    switch (item.type) {
        case "note": {
            const data = item.data as NoteData;
            if (Array.isArray(data.blockContent) && data.blockContent.length > 0) {
                return withHeader(serializeBlockNote(data.blockContent as Block[]));
            }
            return header;
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
            return withHeader(content);
        }
        case "pdf": {
            const data = item.data as PdfData;
            const content = data.ocrPages?.length
                ? data.ocrPages.map((p) => p.markdown).filter(Boolean).join("\n\n")
                : data.textContent ?? "";
            return withHeader(content);
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
            return withHeader(content);
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
            return withHeader(parts.join("\n"));
        }
        case "image":
        case "youtube":
        case "folder":
            return header || item.name;
        default:
            return header;
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
