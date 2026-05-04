/**
 * Shared utilities for AI tools
 */

import { z } from "zod";
import { loadWorkspaceState } from "@/lib/workspace/workspace-state-read";
import type { Item } from "@/lib/workspace-state/types";
import type { WorkspaceToolContext } from "./workspace-tools";
import { resolveItemByPath } from "./workspace-search-utils";

/**
 * Shared `title` field for tool inputs whose other arguments are technical
 * (regex patterns, raw URLs, generated code). The model writes a short
 * present-tense gerund phrase that the UI shows while the tool runs, in
 * place of a generic "Loading…" label.
 *
 * Place this as the FIRST field in a tool's input schema so it streams in
 * before the heavier arguments and the loading shell can render it
 * immediately during `input-streaming`.
 */
export const toolTitleField = z
  .string()
  .min(1)
  .max(60)
  .optional()
  .describe(
    'A short present-tense gerund phrase (3–6 words) describing what this tool call is doing in plain language for a non-technical user. Shown in the UI while the tool runs. Examples: "Searching your notes for photosynthesis", "Reading the Wikipedia article", "Computing average grades". No trailing punctuation, no tool names, no jargon (regex, URL, etc.). Strongly encouraged on every call so the user sees meaningful progress instead of a generic loading label.',
  );

/**
 * Sanitize tool results for the model's context window.
 *
 * Strips fields that are only needed by the client (cache updates, IDs) or
 * redundant with the `message` string. The client still receives the full
 * execute() output via the stream, so useOptimisticToolUpdate works unchanged.
 *
 * Uses AI SDK's `toModelOutput` — supported at runtime (v6.0.97+) but not
 * yet in public type definitions, hence the type assertion.
 */
/** Fields to strip from tool results before sending to the model. */
const MODEL_STRIP_FIELDS = new Set([
  "event", // full workspace event — large, client-only (cache update)
  "version", // workspace version number — client-only (cache update)
  "itemId", // internal ID — model references items by name
  "quizId", // alias for itemId
  "noteId", // alias for itemId
  "interactionId", // deep research internal ID
  "cardCount", // redundant with message
  "questionCount", // redundant with message
  "deletedItem", // redundant with message
  "itemName", // redundant with message
  "title", // redundant with message
]);

export function withSanitizedModelOutput<T extends Record<string, any>>(
  toolDef: T,
): T {
  (toolDef as any).toModelOutput = ({ output }: { output: any }) => {
    if (output && typeof output === "object" && !Array.isArray(output)) {
      const sanitized: Record<string, any> = {};
      for (const key of Object.keys(output)) {
        if (!MODEL_STRIP_FIELDS.has(key)) {
          sanitized[key] = output[key];
        }
      }
      return { type: "json" as const, value: sanitized };
    }
    return { type: "json" as const, value: output };
  };
  return toolDef;
}

/**
 * Load workspace state for tool operations
 * Security is enforced by workspace-worker, so we just load state here
 */
export async function loadStateForTool(
  ctx: WorkspaceToolContext,
): Promise<
  { success: true; state: Item[] } | { success: false; message: string }
> {
  if (!ctx.workspaceId) {
    return { success: false, message: "No workspace context available" };
  }

  const state = await loadWorkspaceState(ctx.workspaceId, {
    userId: ctx.userId,
  });
  return { success: true, state };
}

/**
 * Resolve an item by virtual path or fuzzy name match.
 * Tries virtual path first when input looks like a path (contains /),
 * then falls back to fuzzyMatchItem for plain names.
 * If itemType is provided, only returns items of that type.
 */
export function resolveItem(
  items: Item[],
  input: string,
  itemType?: Item["type"],
): Item | undefined {
  const trimmed = input.trim();
  if (!trimmed) return undefined;

  // 1. Try virtual path first when input looks like a path
  if (trimmed.includes("/")) {
    const byPath = resolveItemByPath(items, trimmed);
    if (byPath && (!itemType || byPath.type === itemType)) return byPath;
  }

  // 2. Fall back to fuzzy name match
  return fuzzyMatchItem(items, trimmed, itemType);
}

/**
 * Fuzzy match an item by name within a list of items
 * Tries: exact match -> contains match -> reverse contains match
 * If itemType is provided, only matches items of that type
 */
export function fuzzyMatchItem(
  items: Item[],
  searchName: string,
  itemType?: Item["type"],
): Item | undefined {
  const normalizedSearch = searchName.toLowerCase().trim();
  const filteredItems = itemType
    ? items.filter((item) => item.type === itemType)
    : items;

  // 1. Exact match
  let matched = filteredItems.find(
    (item) => item.name.toLowerCase().trim() === normalizedSearch,
  );

  // 2. Contains match (item name contains search)
  if (!matched) {
    matched = filteredItems.find((item) =>
      item.name.toLowerCase().includes(normalizedSearch),
    );
  }

  // 3. Reverse contains match (search contains item name)
  if (!matched) {
    matched = filteredItems.find((item) =>
      normalizedSearch.includes(item.name.toLowerCase().trim()),
    );
  }

  return matched;
}

/**
 * Resolve a folder by name from workspace state.
 * Returns the folder ID if found, or fallbackFolderId if folderName is null/undefined.
 * Throws descriptive error if folder name doesn't match any folder.
 */
export function resolveFolderByName(
  items: Item[],
  folderName: string | null | undefined,
  fallbackFolderId?: string,
): string | undefined {
  if (folderName === null || folderName === undefined) {
    return fallbackFolderId;
  }
  const trimmed = folderName.trim();
  if (!trimmed) return fallbackFolderId;

  const folders = items.filter((i) => i.type === "folder");
  // Exact match first
  let matched = folders.find(
    (f) => f.name.toLowerCase().trim() === trimmed.toLowerCase(),
  );
  // Contains match
  if (!matched) {
    matched = folders.find((f) =>
      f.name.toLowerCase().includes(trimmed.toLowerCase()),
    );
  }
  if (!matched) {
    const available = folders.map((f) => `"${f.name}"`).slice(0, 5).join(", ");
    throw new Error(
      `Could not find folder "${folderName}". ${available ? `Available folders: ${available}` : "No folders in workspace."}`,
    );
  }
  return matched.id;
}

/**
 * Get a formatted list of available items of a given type
 */
export function getAvailableItemsList(
  items: Item[],
  itemType: Item["type"],
): string {
  const filtered = items.filter((item) => item.type === itemType);
  if (filtered.length === 0) {
    return "";
  }
  return filtered.map((item) => `"${item.name}"`).join(", ");
}
