import type { Item } from "@/lib/workspace-state/types";

export function sanitizeWorkspaceItemForPersistence(item: Item): Item {
  return item;
}

export function sanitizeWorkspaceItemChanges(
  changes: Partial<Item>,
): Partial<Item> {
  return changes;
}
