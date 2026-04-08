import type { Item } from "./types";
import { getItemSearchBody } from "@/lib/workspace/workspace-item-model";

/**
 * Extracts searchable text from an item's data field
 */
function getSearchableDataText(item: Item): string {
  return getItemSearchBody(item);
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

  return parts.filter(Boolean).join(" ").toLowerCase();
}

/**
 * Creates a simple searchable index for an item (name only)
 * Used for mentions menu search
 */
function createSimpleSearchIndex(item: Item): string {
  const parts = [item.name, item.subtitle, item.type];

  return parts.filter(Boolean).join(" ").toLowerCase();
}

/**
 * Filters items based on a search query (includes content data)
 * Used for workspace search
 */
export function searchItems(items: Item[], query: string): Item[] {
  // Defensive check: ensure items is an array
  if (!Array.isArray(items)) {
    console.warn("[SEARCH] items is not an array:", items);
    return [];
  }

  // Return all items if query is empty or whitespace
  if (!query || query.trim() === "") {
    return items;
  }

  const normalizedQuery = query.toLowerCase().trim();
  const queryTerms = normalizedQuery
    .split(/\s+/)
    .filter((term) => term.length > 0);

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
    console.warn("[SEARCH] items is not an array:", items);
    return [];
  }

  // Return all items if query is empty or whitespace
  if (!query || query.trim() === "") {
    return items;
  }

  const normalizedQuery = query.toLowerCase().trim();
  const queryTerms = normalizedQuery
    .split(/\s+/)
    .filter((term) => term.length > 0);

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
export function filterItemsByFolder(
  items: Item[],
  folderId: string | null,
): Item[] {
  // Defensive check: ensure items is an array
  if (!Array.isArray(items)) {
    console.warn("[FILTER] items is not an array:", items);
    return [];
  }

  // Return root items (items without a folderId) when no folder is selected
  if (!folderId) {
    return items.filter(
      (item) => item.folderId === undefined || item.folderId === null,
    );
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
  activeFolderId?: string | null,
): Item[] {
  let filtered = items;

  // 1. Text Search
  if (query && query.trim() !== "") {
    filtered = searchItems(filtered, query);
  }

  // 2. Folder Filter
  // Only apply folder filter if:
  // - We are actively looking at a folder (activeFolderId is not null/undefined)
  // - We are NOT searching (query is empty)
  // This means search results search the WHOLE workspace, not just the current folder
  if (activeFolderId !== undefined && (!query || query.trim() === "")) {
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
  let current = items.find((i) => i.id === folderId && i.type === "folder");
  while (current) {
    path.unshift(current);
    current = current.folderId
      ? items.find((i) => i.id === current?.folderId && i.type === "folder")
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
export function getChildFolders(
  parentId: string | null,
  items: Item[],
): Item[] {
  return items.filter(
    (i) =>
      i.type === "folder" && (parentId ? i.folderId === parentId : !i.folderId),
  );
}

/**
 * Check if a folder is a descendant of another folder (for circular reference prevention)
 * @param folderId - The folder to check
 * @param potentialAncestorId - The potential ancestor folder
 * @param items - All items in the workspace
 * @returns True if folderId is a descendant of potentialAncestorId
 */
export function isDescendantOf(
  folderId: string,
  potentialAncestorId: string,
  items: Item[],
): boolean {
  // Walk up the tree from folderId to check if potentialAncestorId is an ancestor
  let current = items.find((i) => i.id === folderId);
  while (current?.folderId) {
    if (current.folderId === potentialAncestorId) return true;
    current = items.find((i) => i.id === current?.folderId);
  }
  return false;
}

/**
 * Get all ancestor folder IDs for a folder (or empty set if null/root).
 * Excludes the folder itself - returns only its ancestors.
 * Used for cycle prevention when creating folders from selection.
 */
export function getAncestorFolderIds(
  folderId: string | null,
  items: Item[],
): Set<string> {
  if (!folderId) return new Set();
  const path = getFolderPath(folderId, items);
  // Ancestors are all folders in path except the last (the folder itself)
  const ancestorItems = path.slice(0, -1);
  return new Set(ancestorItems.map((f) => f.id));
}

/**
 * Filter item IDs to exclude any that would create a cycle when creating a new folder
 * inside parentFolderId and moving the selected items into it.
 * Excludes: parentFolderId itself and any folder that is an ancestor of parentFolderId.
 * (Moving the active folder or its ancestors into a child would create a cycle.)
 */
export function filterItemIdsForFolderCreation(
  itemIds: string[],
  parentFolderId: string | null,
  items: Item[],
): string[] {
  if (!parentFolderId) return itemIds; // At root, no cycle possible

  const idsToExclude = new Set([
    parentFolderId,
    ...getAncestorFolderIds(parentFolderId, items),
  ]);

  return itemIds.filter((id) => !idsToExclude.has(id));
}

export interface ContentMatchSnippet {
  before: string;
  match: string;
  after: string;
}

export interface RankedSearchResult {
  item: Item;
  score: number;
  matchType: string;
  /** When matchType is "content", a snippet with the matching text and context */
  contentSnippet?: ContentMatchSnippet | null;
}

const SCORE_EXACT_NAME = 1000;
const SCORE_PREFIX_NAME = 800;
const SCORE_TOKEN_NAME = 600;
const SCORE_SUBSTRING_META = 400;
const SCORE_CONTENT = 200;

const SNIPPET_CONTEXT_CHARS = 40;

/**
 * Extracts a snippet from content text showing the matching query with surrounding context.
 * Used for content-match results in the command palette.
 */
function getContentMatchSnippet(
  contentText: string,
  queryTerms: string[],
): ContentMatchSnippet | null {
  if (!contentText || queryTerms.length === 0) return null;

  const contentLower = contentText.toLowerCase();
  let bestStart = -1;
  let bestEnd = -1;

  // Find the first occurrence of the first query term
  const firstTerm = queryTerms[0];
  const idx = contentLower.indexOf(firstTerm);
  if (idx === -1) return null;

  bestStart = idx;
  bestEnd = idx + firstTerm.length;

  // Extend to include other query terms if they appear nearby (within ~80 chars)
  for (let i = 1; i < queryTerms.length; i++) {
    const term = queryTerms[i];
    const termIdx = contentLower.indexOf(term, bestStart);
    if (termIdx !== -1 && termIdx <= bestEnd + 60) {
      bestEnd = Math.max(bestEnd, termIdx + term.length);
    }
  }

  const beforeStart = Math.max(0, bestStart - SNIPPET_CONTEXT_CHARS);
  const afterEnd = Math.min(
    contentText.length,
    bestEnd + SNIPPET_CONTEXT_CHARS,
  );

  const before =
    (beforeStart > 0 ? "…" : "") +
    contentText.slice(beforeStart, bestStart).trimStart();
  const match = contentText.slice(bestStart, bestEnd);
  const after =
    contentText.slice(bestEnd, afterEnd).trimEnd() +
    (afterEnd < contentText.length ? "…" : "");

  return { before, match, after };
}

/**
 * Ranks workspace items by search relevance for command palette.
 * Name matches score higher than content matches.
 */
export function rankWorkspaceSearchResults(
  items: Item[],
  query: string,
): RankedSearchResult[] {
  if (!Array.isArray(items) || items.length === 0) return [];
  if (!query || !query.trim()) return [];

  const normalizedQuery = query.toLowerCase().trim();
  const queryTerms = normalizedQuery
    .split(/\s+/)
    .filter((term) => term.length > 0);
  if (queryTerms.length === 0) return [];

  const results: RankedSearchResult[] = [];

  for (const item of items) {
    const nameLower = (item.name ?? "").toLowerCase().trim();
    const subtitleLower = (item.subtitle ?? "").toLowerCase();
    const typeLower = (item.type ?? "").toLowerCase();
    const metaIndex = [nameLower, subtitleLower, typeLower]
      .filter(Boolean)
      .join(" ");
    const contentText = getSearchableDataText(item).toLowerCase();

    let score = 0;
    let matchType = "";

    // 1. Exact name match
    if (nameLower === normalizedQuery) {
      score = SCORE_EXACT_NAME;
      matchType = "exact";
    }
    // 2. Prefix match on name
    else if (nameLower.startsWith(normalizedQuery)) {
      score = SCORE_PREFIX_NAME;
      matchType = "prefix";
    }
    // 3. Token/word match on name (all query terms found in name)
    else if (queryTerms.every((term) => nameLower.includes(term))) {
      score = SCORE_TOKEN_NAME;
      matchType = "token";
    }
    // 4. Substring on name + subtitle + type
    else if (queryTerms.every((term) => metaIndex.includes(term))) {
      score = SCORE_SUBSTRING_META;
      matchType = "meta";
    }
    // 5. Content-text matches
    else if (queryTerms.every((term) => contentText.includes(term))) {
      score = SCORE_CONTENT;
      matchType = "content";
    }

    if (score > 0) {
      const rawContent = getSearchableDataText(item);
      const contentSnippet =
        matchType === "content" && rawContent
          ? getContentMatchSnippet(rawContent, queryTerms)
          : null;
      results.push({ item, score, matchType, contentSnippet });
    }
  }

  results.sort((a, b) => b.score - a.score);
  return results.slice(0, 50);
}
