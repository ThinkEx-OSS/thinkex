import type { Item } from "@/lib/workspace-state/types";

/**
 * Check if a name+type already exists among siblings (same folder).
 * Returns true if there would be a duplicate.
 *
 * @param items - All workspace items
 * @param name - Proposed name (case-insensitive check)
 * @param type - Item type
 * @param folderId - Parent folder (null = root)
 * @param excludeItemId - When updating, exclude this item from the check
 */
export function hasDuplicateName(
    items: Item[],
    name: string,
    type: Item["type"],
    folderId: string | null,
    excludeItemId?: string
): boolean {
    const normalized = name.trim().toLowerCase();
    if (!normalized) return false;

    const siblings = items.filter((i) => {
        if (i.type === "folder") return false;
        if (excludeItemId && i.id === excludeItemId) return false;
        const sameFolder =
            (folderId == null && i.folderId == null) ||
            (folderId != null && i.folderId === folderId);
        return sameFolder && i.type === type && i.name.trim().toLowerCase() === normalized;
    });

    return siblings.length > 0;
}
