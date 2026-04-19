/**
 * Shared utilities for AI tools
 */

import { loadWorkspaceState } from "@/lib/workspace/workspace-state-read";
import type { Item } from "@/lib/workspace-state/types";
import type { WorkspaceToolContext } from "./workspace-tools";
import { resolveItemByPath } from "./workspace-search-utils";

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

export type ResolveItemResult =
  | { ok: true; item: Item }
  | { ok: false; reason: "empty"; matches?: never }
  | { ok: false; reason: "not-found"; matches?: never }
  | { ok: false; reason: "ambiguous"; matches: Item[] };

/**
 * Resolve a workspace item from a path OR exact (case-insensitive) name.
 *
 * Resolution order:
 *   1. If input contains "/", try virtual-path match via resolveItemByPath.
 *   2. Otherwise (or on path miss), match by exact name, case-insensitive after trim.
 *
 * When itemType is given, only items of that type are considered.
 * When itemType is omitted, folders are included (item_delete may target folders).
 *
 * Returns ambiguity explicitly when two or more items share the same name —
 * callers should surface the virtual paths and require the caller to disambiguate.
 */
export function resolveItem(
  items: Item[],
  input: string,
  itemType?: Item["type"],
): ResolveItemResult {
  const trimmed = input.trim();
  if (!trimmed) return { ok: false, reason: "empty" };

  const typeOk = (i: Item) => !itemType || i.type === itemType;

  if (trimmed.includes("/")) {
    const byPath = resolveItemByPath(items, trimmed);
    if (byPath && typeOk(byPath)) return { ok: true, item: byPath };
  }

  const normalized = trimmed.toLowerCase();
  const matches = items.filter(
    (i) => typeOk(i) && i.name.toLowerCase().trim() === normalized,
  );

  if (matches.length === 1) return { ok: true, item: matches[0] };
  if (matches.length > 1) return { ok: false, reason: "ambiguous", matches };
  return { ok: false, reason: "not-found" };
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
