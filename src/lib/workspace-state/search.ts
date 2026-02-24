import type { Item, NoteData, PdfData } from "./types";

/**
 * Extracts searchable text from an item's data field
 */
function getSearchableDataText(item: Item): string {
  const { data, type } = item;

  switch (type) {
    case "note": {
      const noteData = data as NoteData;
      return noteData.field1 || "";
    }

    case "pdf": {
      const pdfData = data as PdfData;
      return pdfData.textContent ?? "";
    }

    default:
      return "";
  }
}

/**
 * Creates a full searchable index for an item (includes content data)
 * Used for workspace search
 */
function createFullSearchIndex(item: Item): string {
  const parts = [
    item.name,
    item.subtitle,
    item.type,
    getSearchableDataText(item),
  ];

  return parts
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

/**
 * Creates a simple searchable index for an item (name only)
 * Used for mentions menu search
 */
function createSimpleSearchIndex(item: Item): string {
  const parts = [
    item.name,
    item.subtitle,
    item.type,
  ];

  return parts
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

/**
 * Filters items based on a search query (includes content data)
 * Used for workspace search
 */
export function searchItems(items: Item[], query: string): Item[] {
  // Defensive check: ensure items is an array
  if (!Array.isArray(items)) {
    console.warn('[SEARCH] items is not an array:', items);
    return [];
  }

  // Return all items if query is empty or whitespace
  if (!query || query.trim() === "") {
    return items;
  }

  const normalizedQuery = query.toLowerCase().trim();
  const queryTerms = normalizedQuery.split(/\s+/).filter(term => term.length > 0);

  // If no valid query terms after trimming, return all items
  if (queryTerms.length === 0) {
    return items;
  }

  const filtered = items.filter((item) => {
    const searchIndex = createFullSearchIndex(item);

    // Item matches if all query terms are found in the search index
    return queryTerms.every((term) => searchIndex.includes(term));
  });

  return filtered;
}

/**
 * Filters items based on name/title only (no content data)
 * Used for mentions menu search
 */
export function searchItemsByName(items: Item[], query: string): Item[] {
  // Defensive check: ensure items is an array
  if (!Array.isArray(items)) {
    console.warn('[SEARCH] items is not an array:', items);
    return [];
  }

  // Return all items if query is empty or whitespace
  if (!query || query.trim() === "") {
    return items;
  }

  const normalizedQuery = query.toLowerCase().trim();
  const queryTerms = normalizedQuery.split(/\s+/).filter(term => term.length > 0);

  // If no valid query terms after trimming, return all items
  if (queryTerms.length === 0) {
    return items;
  }

  const filtered = items.filter((item) => {
    const searchIndex = createSimpleSearchIndex(item);

    // Item matches if all query terms are found in the search index
    return queryTerms.every((term) => searchIndex.includes(term));
  });

  return filtered;
}



/**
 * Filters items based on folder
 * Returns only items that belong to the specified folder
 * When folderId is null, returns only items without a folderId (root items)
 */
export function filterItemsByFolder(items: Item[], folderId: string | null): Item[] {
  // Defensive check: ensure items is an array
  if (!Array.isArray(items)) {
    console.warn('[FILTER] items is not an array:', items);
    return [];
  }

  // Return root items (items without a folderId) when no folder is selected
  if (!folderId) {
    return items.filter((item) => item.folderId === undefined || item.folderId === null);
  }

  // Filter items that belong to the specified folder
  return items.filter((item) => item.folderId === folderId);
}

/**
 * Filters items based on search query and active folder

 */
export function filterItems(
  items: Item[],
  query: string,
  activeFolderId?: string | null
): Item[] {
  let filtered = items;

  // 1. Text Search
  if (query && query.trim() !== '') {
    filtered = searchItems(filtered, query);
  }

  // 2. Folder Filter
  // Only apply folder filter if:
  // - We are actively looking at a folder (activeFolderId is not null/undefined)
  // - We are NOT searching (query is empty)
  // This means search results search the WHOLE workspace, not just the current folder
  if (activeFolderId !== undefined && (!query || query.trim() === '')) {
    filtered = filterItemsByFolder(filtered, activeFolderId);
  }

  return filtered;
}

/**
 * Returns IDs of items that match the search query
 */
export function getMatchingItemIds(items: Item[], query: string): Set<string> {
  const matchingItems = searchItems(items, query);
  return new Set(matchingItems.map((item) => item.id));
}

/**
 * Build path from root to folder (for breadcrumbs)
 * Returns array of folders from root to the specified folder
 */
export function getFolderPath(folderId: string, items: Item[]): Item[] {
  const path: Item[] = [];
  let current = items.find(i => i.id === folderId && i.type === 'folder');
  while (current) {
    path.unshift(current);
    current = current.folderId
      ? items.find(i => i.id === current?.folderId && i.type === 'folder')
      : undefined;
  }
  return path;
}

/**
 * Get immediate child folders of a parent folder
 * @param parentId - Parent folder ID, or null for root-level folders
 * @param items - All items in the workspace
 * @returns Array of folder items that are direct children of the parent
 */
export function getChildFolders(parentId: string | null, items: Item[]): Item[] {
  return items.filter(i =>
    i.type === 'folder' &&
    (parentId ? i.folderId === parentId : !i.folderId)
  );
}

/**
 * Check if a folder is a descendant of another folder (for circular reference prevention)
 * @param folderId - The folder to check
 * @param potentialAncestorId - The potential ancestor folder
 * @param items - All items in the workspace
 * @returns True if folderId is a descendant of potentialAncestorId
 */
export function isDescendantOf(folderId: string, potentialAncestorId: string, items: Item[]): boolean {
  // Walk up the tree from folderId to check if potentialAncestorId is an ancestor
  let current = items.find(i => i.id === folderId);
  while (current?.folderId) {
    if (current.folderId === potentialAncestorId) return true;
    current = items.find(i => i.id === current?.folderId);
  }
  return false;
}

