import type { Item } from "@/lib/workspace-state/types";

function newItemPattern(type: string): RegExp {
    const base = type.charAt(0).toUpperCase() + type.slice(1);
    return new RegExp(`^new ${type} (\\d+)$`, "i");
}

/**
 * Get the next unique default name for an item type (e.g. "New note 1", "New note 2", ...).
 * Scans siblings for existing "New &lt;type&gt; N" names and returns the next available number.
 */
export function getNextUniqueDefaultName(
    items: Item[],
    type: Item["type"],
    folderId: string | null
): string {
    const baseLabel = `New ${type.charAt(0).toUpperCase() + type.slice(1)}`;
    const pattern = newItemPattern(type);

    const siblings = items.filter((i) => {
        if (i.type === "folder") return false;
        const sameFolder =
            (folderId == null && i.folderId == null) ||
            (folderId != null && i.folderId === folderId);
        return sameFolder && i.type === type;
    });

    const usedNumbers = new Set<number>();
    for (const s of siblings) {
        const m = s.name.match(pattern);
        if (m) usedNumbers.add(parseInt(m[1], 10));
    }

    let n = 1;
    while (usedNumbers.has(n)) n++;
    return `${baseLabel} ${n}`;
}

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
