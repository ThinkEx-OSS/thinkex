import type { Item } from "./types";

export function getWorkspaceItemLane(
  item: Pick<Item, "type">,
): "folders" | "items" {
  return item.type === "folder" ? "folders" : "items";
}

export function getWorkspaceItemContainerId(
  item: Pick<Item, "folderId">,
): string | null {
  return item.folderId ?? null;
}

export function compareWorkspaceItemsByOrder(a: Item, b: Item): number {
  const sortOrderDiff =
    (a.sortOrder ?? Number.MAX_SAFE_INTEGER) -
    (b.sortOrder ?? Number.MAX_SAFE_INTEGER);

  if (sortOrderDiff !== 0) {
    return sortOrderDiff;
  }

  return a.id.localeCompare(b.id);
}

export function sortWorkspaceItemsByOrder(items: Item[]): Item[] {
  return [...items].sort(compareWorkspaceItemsByOrder);
}
