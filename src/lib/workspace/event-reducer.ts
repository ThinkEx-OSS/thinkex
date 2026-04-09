import type { Item } from "@/lib/workspace-state/types";
import type { WorkspaceEvent } from "./events";

/** Shared reducer for projection writes and client-side optimistic delta overlays. */
export function eventReducer(state: Item[], event: WorkspaceEvent): Item[] {
  switch (event.type) {
    case "ITEM_CREATED": {
      const item = event.payload.item;
      const now = event.timestamp || Date.now();
      return [...state, { ...item, lastModified: now }];
    }

    case "ITEM_UPDATED": {
      const now = event.timestamp || Date.now();
      return state.map((item) =>
        item.id === event.payload.id
          ? {
              ...item,
              ...event.payload.changes,
              // Deep merge data field to preserve existing properties like sources
              data: event.payload.changes.data
                ? {
                    ...item.data, // Preserve existing data properties
                    ...event.payload.changes.data, // Apply new data updates
                  }
                : item.data,
              lastModified: now,
            }
          : item,
      );
    }

    case "BULK_ITEMS_PATCHED": {
      const now = event.timestamp || Date.now();
      const updateMap = new Map(
        event.payload.updates.map((update) => [update.id, update]),
      );

      return state.map((item) => {
        const update = updateMap.get(item.id);
        if (!update) return item;

        return {
          ...item,
          ...update.changes,
          data: update.changes.data
            ? {
                ...item.data,
                ...update.changes.data,
              }
            : item.data,
          lastModified: now,
        };
      });
    }

    case "ITEM_DELETED": {
      const deletedItemId = event.payload.id;
      const deletedItem = state.find((item) => item.id === deletedItemId);
      const isFolder = deletedItem?.type === "folder";

      return (
        state
          .filter((item) => item.id !== deletedItemId)
          // If deleting a folder-type item, clear folderId and layout from items that were in it
          // Layout is cleared so items get fresh positioning in root (same as when moving to folder)
          .map((item) =>
            isFolder && item.folderId === deletedItemId
              ? { ...item, folderId: undefined, layout: undefined }
              : item,
          )
      );
    }

    case "BULK_ITEMS_UPDATED": {
      const p = event.payload;
      const now = event.timestamp || Date.now();

      // Bulk delete: send only deletedIds – no item data
      if (p.deletedIds && p.deletedIds.length > 0) {
        const deletedSet = new Set(p.deletedIds);
        const deletedFolderIds = new Set(
          state
            .filter((i) => deletedSet.has(i.id) && i.type === "folder")
            .map((i) => i.id),
        );
        const remaining = state
          .filter((i) => !deletedSet.has(i.id))
          .map((item) =>
            item.folderId && deletedFolderIds.has(item.folderId)
              ? { ...item, folderId: undefined, layout: undefined }
              : item,
          );
        return remaining;
      }

      // Items added: send only addedItems
      if (p.addedItems && p.addedItems.length > 0) {
        const added = p.addedItems.map((item) => ({
          ...item,
          lastModified: now,
        }));
        return [...state, ...added];
      }

      const layoutUpdates = p.layoutUpdates ?? [];
      if (layoutUpdates.length > 0) {
        const layoutMap = new Map(layoutUpdates.map((u) => [u.id, u]));
        return state.map((item) => {
          const u = layoutMap.get(item.id);
          return u
            ? { ...item, layout: { x: u.x, y: u.y, w: u.w, h: u.h } }
            : item;
        });
      }

      return state;
    }

    case "BULK_ITEMS_CREATED": {
      const now = event.timestamp || Date.now();
      const itemsWithModified = event.payload.items.map((item: Item) => ({
        ...item,
        lastModified: now,
      }));
      return [...state, ...itemsWithModified];
    }

    case "ITEM_MOVED_TO_FOLDER": {
      return state.map((item) =>
        item.id === event.payload.itemId
          ? {
              ...item,
              folderId: event.payload.folderId ?? undefined,
              layout: undefined,
            }
          : item,
      );
    }

    case "ITEMS_MOVED_TO_FOLDER": {
      const itemIdsSet = new Set(event.payload.itemIds);
      const targetFolderId = event.payload.folderId ?? undefined;
      const updatedItems = state.map((item) =>
        itemIdsSet.has(item.id)
          ? {
              ...item,
              folderId: targetFolderId,
              layout: undefined,
            }
          : item,
      );
      return updatedItems;
    }

    case "FOLDER_CREATED_WITH_ITEMS": {
      const now = event.timestamp || Date.now();
      const folder = { ...event.payload.folder, lastModified: now };
      const itemIdsSet = new Set(event.payload.itemIds);
      const folderId = folder.id;

      const updatedItems = state.map((item) =>
        itemIdsSet.has(item.id)
          ? {
              ...item,
              folderId: folderId,
              layout: undefined,
              lastModified: now,
            }
          : item,
      );

      updatedItems.push(folder);

      return updatedItems;
    }

    default:
      return state;
  }
}
