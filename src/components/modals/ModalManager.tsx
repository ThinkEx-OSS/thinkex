import type { Item, ItemData } from "@/lib/workspace-state/types";
import CardDetailModal from "./CardDetailModal";
import PDFViewerModal from "./PDFViewerModal";
import { VersionHistoryModal } from "@/components/workspace/VersionHistoryModal";
import type { WorkspaceEvent } from "@/lib/workspace/events";
import { useUIStore } from "@/lib/stores/ui-store";

interface ModalManagerProps {
  // Card Detail Modal
  items: Item[];
  // NOTE: openModalItemId and setOpenModalItemId are now subscribed from the store directly
  // to avoid re-rendering parent components when modal opens/closes
  onUpdateItem: (itemId: string, updates: Partial<Item>) => void;
  onUpdateItemData: (itemId: string, updater: (prev: ItemData) => ItemData) => void;
  onFlushPendingChanges: (itemId: string) => void;

  // Version History Modal
  showVersionHistory: boolean;
  setShowVersionHistory: (show: boolean) => void;
  events: WorkspaceEvent[];
  currentVersion: number;
  onRevertToVersion: (version: number) => Promise<void>;
  workspaceId: string | null; // Add workspaceId to fetch snapshots
}

/**
 * Centralized modal manager component.
 * Handles all modal state and logic for the dashboard.
 */
export function ModalManager({
  items,
  onUpdateItem,
  onUpdateItemData,
  onFlushPendingChanges,
  showVersionHistory,
  setShowVersionHistory,
  events,
  currentVersion,
  onRevertToVersion,
  workspaceId,
}: ModalManagerProps) {
  // Subscribe to modal state directly from store to avoid re-rendering parents
  const openPanelIds = useUIStore((state) => state.openPanelIds);
  const closePanel = useUIStore((state) => state.closePanel);
  const maximizedItemId = useUIStore((state) => state.maximizedItemId);
  const setMaximizedItemId = useUIStore((state) => state.setMaximizedItemId);

  // Find the current item from the items array using live data
  // All item types (notes, flashcards, etc.) are shown only when maximized

  const primaryPanelId = openPanelIds[0] ?? null;
  const activeItemId = maximizedItemId || primaryPanelId;
  const currentItem = activeItemId ? items.find(i => i.id === activeItemId) : null;

  // Handle modal close with flush
  const handleClose = (itemId: string) => {
    // Flush any pending changes before closing
    onFlushPendingChanges(itemId);

    // Clear maximized state first
    setMaximizedItemId(null);

    // Close the panel
    closePanel(itemId);
  };

  return (
    <>
      {/* Card Detail Modal or PDF Viewer Modal - only shown when item is maximized */}
      {activeItemId && currentItem && maximizedItemId === currentItem.id && (
        currentItem.type === 'pdf' ? (
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
        )
      )}

      {/* Version History Modal */}
      <VersionHistoryModal
        isOpen={showVersionHistory}
        onClose={() => setShowVersionHistory(false)}
        events={events}
        currentVersion={currentVersion}
        onRevertToVersion={onRevertToVersion}
        items={items}
        workspaceId={workspaceId}
      />
    </>
  );
}

