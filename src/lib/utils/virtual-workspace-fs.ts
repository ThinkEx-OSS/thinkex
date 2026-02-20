import type { Item } from "@/lib/workspace-state/types";
import { getFolderPath } from "@/lib/workspace-state/search";

/**
 * Get the virtual file path for an item in the workspace.
 * Example: "Physics/Thermodynamics/notes/Heat Transfer.md"
 */
export function getVirtualPath(item: Item, items: Item[]): string {
  const sanitize = (s: string) =>
    s.replace(/[/\\?*:|"<>]/g, "-").trim() || "untitled";

  const extByType: Record<string, string> = {
    note: "md",
    pdf: "pdf",
    flashcard: "md",
    youtube: "url",
    quiz: "md",
    image: "png",
    audio: "audio",
  };
  const ext = extByType[item.type] || "md";
  const typeDir = `${item.type}s`;
  const filename = `${sanitize(item.name)}.${ext}`;

  if (item.type === "folder") {
    const folderPath = getFolderPath(item.id, items);
    const segments = folderPath.map((f) => sanitize(f.name));
    return segments.length > 0 ? segments.join("/") + "/" : "/";
  }

  const folderSegments: string[] = [];
  let folderId = item.folderId;
  while (folderId) {
    const folder = items.find(
      (i) => i.id === folderId && i.type === "folder"
    );
    if (!folder) break;
    folderSegments.unshift(sanitize(folder.name));
    folderId = folder.folderId;
  }

  const pathParts =
    folderSegments.length > 0
      ? [...folderSegments, typeDir, filename]
      : [typeDir, filename];
  return pathParts.join("/");
}
