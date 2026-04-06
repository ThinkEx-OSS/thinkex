"use client";

import type { Item, ItemData } from "@/lib/workspace-state/types";
import CardDetailModal from "@/components/modals/CardDetailModal";
import PDFViewerModal from "@/components/modals/PDFViewerModal";
import { selectWorkspaceOpenMode, useUIStore } from "@/lib/stores/ui-store";

interface OpenWorkspaceItemViewProps {
  items: Item[];
  onUpdateItem: (itemId: string, updates: Partial<Item>) => void;
  onUpdateItemData: (itemId: string, updater: (prev: ItemData) => ItemData) => void;
  onFlushPendingChanges: (itemId: string) => void;
}

/**
 * Full-screen viewer when exactly one workspace item is open (`openMode === "single"`).
 * When `openMode === "split"`, use a dedicated split layout instead — not this component.
 */
export function OpenWorkspaceItemView({
  items,
  onUpdateItem,
  onUpdateItemData,
  onFlushPendingChanges,
}: OpenWorkspaceItemViewProps) {
  const openItems = useUIStore((state) => state.openItems);
  const openMode = useUIStore(selectWorkspaceOpenMode);
  const closeWorkspaceItem = useUIStore((state) => state.closeWorkspaceItem);

  const primaryId = openItems.primary;
  const currentItem =
    primaryId && openMode === "single"
      ? items.find((i) => i.id === primaryId)
      : undefined;

  const handleClose = (itemId: string) => {
    onFlushPendingChanges(itemId);
    closeWorkspaceItem(itemId);
  };

  if (!currentItem) {
    return null;
  }

  return currentItem.type === "pdf" ? (
    <PDFViewerModal
      key={currentItem.id}
      item={currentItem}
      isOpen={true}
      onClose={() => handleClose(currentItem.id)}
      onUpdateItem={(updates) => onUpdateItem(currentItem.id, updates)}
    />
  ) : (
    <CardDetailModal
      key={currentItem.id}
      item={currentItem}
      isOpen={true}
      onClose={() => handleClose(currentItem.id)}
      onUpdateItem={(updates) => onUpdateItem(currentItem.id, updates)}
      onUpdateItemData={(updater) => onUpdateItemData(currentItem.id, updater)}
      onFlushPendingChanges={onFlushPendingChanges}
    />
  );
}
