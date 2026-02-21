/**
 * Shared utilities for workspace grep and read tools.
 */

import type { Item, NoteData, PdfData, FlashcardData, FlashcardItem, QuizData, AudioData } from "@/lib/workspace-state/types";
import { serializeBlockNote } from "@/lib/utils/serialize-blocknote";
import { getVirtualPath } from "@/lib/utils/virtual-workspace-fs";
import { type Block } from "@/components/editor/BlockNoteEditor";

/**
 * Extract plain text from an item for searching (grep).
 * Returns empty string for types with no searchable content.
 */
export function extractSearchableText(item: Item, items: Item[]): string {
    switch (item.type) {
        case "note": {
            const data = item.data as NoteData;
            if (data.blockContent) {
                return serializeBlockNote(data.blockContent as Block[]);
            }
            return data.field1 ?? "";
        }
        case "flashcard": {
            const data = item.data as FlashcardData;
            const cards: FlashcardItem[] =
                data.cards?.length
                    ? data.cards
                    : data.front || data.back
                        ? [{ id: "legacy", front: data.front ?? "", back: data.back ?? "", frontBlocks: data.frontBlocks, backBlocks: data.backBlocks }]
                        : [];
            return cards
                .map((c) => {
                    const front = c.frontBlocks ? serializeBlockNote(c.frontBlocks as Block[]) : c.front;
                    const back = c.backBlocks ? serializeBlockNote(c.backBlocks as Block[]) : c.back;
                    return `${front}\n${back}`;
                })
                .join("\n\n");
        }
        case "pdf": {
            const data = item.data as PdfData;
            return data.textContent ?? "";
        }
        case "quiz": {
            const data = item.data as QuizData;
            const questions = data.questions ?? [];
            return questions
                .map(
                    (q) =>
                        `${q.questionText}\n${q.options?.join("\n") ?? ""}\n${q.explanation ?? ""}`
                )
                .join("\n\n");
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
            return parts.join("\n");
        }
        case "image":
        case "youtube":
        case "folder":
            return item.name;
        default:
            return "";
    }
}

/**
 * Resolve an item by virtual path.
 * Path format: "Physics/notes/Thermodynamics.md" or "notes/My Note.md"
 */
export function resolveItemByPath(items: Item[], pathInput: string): Item | null {
    const normalized = pathInput.trim().replace(/\/+/g, "/").replace(/^\//, "");
    if (!normalized) return null;

    // Try exact match on getVirtualPath first
    const contentItems = items.filter((i) => i.type !== "folder");
    const exact = contentItems.find((item) => getVirtualPath(item, items) === normalized);
    if (exact) return exact;

    // Try path without extension (user might omit .md etc.)
    const withoutExt = normalized.replace(/\.[^.]+$/, "");
    const byPathNoExt = contentItems.find((item) => {
        const vp = getVirtualPath(item, items);
        return vp.replace(/\.[^.]+$/, "") === withoutExt || vp === normalized;
    });
    if (byPathNoExt) return byPathNoExt;

    // Try matching last segment as filename (e.g. "Thermodynamics.md" -> item named "Thermodynamics")
    const segments = normalized.split("/").filter(Boolean);
    const filename = segments[segments.length - 1];
    const nameWithoutExt = filename.replace(/\.[^.]+$/, "");

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
