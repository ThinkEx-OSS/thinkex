import type { Item, ItemData } from "@/lib/workspace-state/types";
import CardDetailModal from "./CardDetailModal";
import PDFViewerModal from "./PDFViewerModal";
import { useUIStore } from "@/lib/stores/ui-store";

interface ModalManagerProps {
  items: Item[];
  onUpdateItem: (itemId: string, updates: Partial<Item>) => void;
  onUpdateItemData: (itemId: string, updater: (prev: ItemData) => ItemData) => void;
  onFlushPendingChanges: (itemId: string) => void;
}

/**
 * Renders the full-screen item overlay when an item is open in the left pane.
 */
export function ModalManager({
  items,
  onUpdateItem,
  onUpdateItemData,
  onFlushPendingChanges,
}: ModalManagerProps) {
  const leftPaneItemId = useUIStore((state) => state.itemPanes.left);
  const workspaceLayout = useUIStore((state) => state.workspaceLayout);
  const closeWorkspaceItem = useUIStore((state) => state.closeWorkspaceItem);

  const currentItem =
    leftPaneItemId && workspaceLayout === "single"
      ? items.find((i) => i.id === leftPaneItemId)
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
