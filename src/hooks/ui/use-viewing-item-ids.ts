import { useMemo } from "react";
import { useUIStore } from "@/lib/stores/ui-store";

/**
 * Item IDs considered "open" for chat context (left/right panes).
 * Single source: itemPanes in the UI store.
 */
export function useViewingItemIds(): Set<string> {
  const itemPanes = useUIStore((state) => state.itemPanes);

  return useMemo(() => {
    const ids = new Set<string>();
    if (itemPanes.left) ids.add(itemPanes.left);
    if (itemPanes.right) ids.add(itemPanes.right);
    return ids;
  }, [itemPanes.left, itemPanes.right]);
}
