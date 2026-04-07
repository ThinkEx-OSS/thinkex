import { useMemo } from "react";
import { useUIStore } from "@/lib/stores/ui-store";

/**
 * Item IDs considered "open" for chat context (primary and/or secondary).
 */
export function useViewingItemIds(): Set<string> {
  const openItems = useUIStore((state) => state.openItems);

  return useMemo(() => {
    const ids = new Set<string>();
    if (openItems.primary) ids.add(openItems.primary);
    if (openItems.secondary) ids.add(openItems.secondary);
    return ids;
  }, [openItems.primary, openItems.secondary]);
}
