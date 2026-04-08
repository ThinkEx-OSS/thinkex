/**
 * Shared utilities for workspace grep and read tools.
 */

import type {
  Item,
} from "@/lib/workspace-state/types";
import { getVirtualPath } from "@/lib/utils/workspace-fs";
import { getItemSearchBody } from "@/lib/workspace/workspace-item-model";

export interface SearchableText {
  /** Path and title lines (1-2 lines). Matches here use matchKind, not lineNum. */
  header: string;
  /** Body content. Line numbers align with workspace_read(path, lineStart). */
  content: string;
}

/**
 * Extract plain text from an item for searching (grep).
 * Returns header (path, title) and content separately so grep line numbers align with workspace_read.
 * Header matches use matchKind (path/title); content matches use 1-based lineNum.
 */
export function extractSearchableText(
  item: Item,
  items: Item[],
): SearchableText {
  const title = item.name?.trim() ?? "";
  const virtualPath = getVirtualPath(item, items);
  const header = [virtualPath, title].filter(Boolean).join("\n");

  const body = (content: string): SearchableText => ({
    header,
    content: content ?? "",
  });

  return body(getItemSearchBody(item));
}

/**
 * Resolve an item by virtual path.
 * Path format: "Physics/documents/Thermodynamics.md" or "documents/My Doc.md"
 */
/** Known file extensions — avoid treating "4." in "4. Container Networking (2)" as extension */
const KNOWN_EXTENSIONS = /\.(pdf|md|url|png|audio|txt)$/i;

export function resolveItemByPath(
  items: Item[],
  pathInput: string,
): Item | null {
  const normalized = pathInput.trim().replace(/\/+/g, "/").replace(/^\//, "");
  if (!normalized) return null;

  const stripExt = (s: string) => s.replace(KNOWN_EXTENSIONS, "");

  // Try exact match on getVirtualPath first
  const contentItems = items.filter((i) => i.type !== "folder");
  const exact = contentItems.find(
    (item) => getVirtualPath(item, items) === normalized,
  );
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
    return (
      vp.endsWith(filename) ||
      vp.endsWith(nameWithoutExt + ".md") ||
      vp.endsWith(nameWithoutExt + ".pdf")
    );
  });

  if (candidates.length === 1) return candidates[0];
  if (candidates.length > 1) {
    // Prefer path that matches most segments
    const best = candidates.find(
      (item) => getVirtualPath(item, items) === normalized,
    );
    return best ?? candidates[0];
  }

  return null;
}
