import type { Item, ItemData } from "@/lib/workspace-state/types";
import CardDetailModal from "./CardDetailModal";
import PDFViewerModal from "./PDFViewerModal";
import { VersionHistoryModal } from "@/components/workspace/VersionHistoryModal";
import type { WorkspaceEvent } from "@/lib/workspace/events";
import { useUIStore } from "@/lib/stores/ui-store";
import { ResizablePanel, ResizableHandle, ResizablePanelGroup } from "@/components/ui/resizable";

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
  const workspaceSplitViewActive = useUIStore((state) => state.workspaceSplitViewActive);

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
      {/* Dual-Panel Mode: Render both panels when openPanelIds.length === 2 and split view is active */}
      {workspaceSplitViewActive && openPanelIds.length === 2 ? (
        <ResizablePanelGroup orientation="horizontal" className="h-full w-full">
          {/* First Panel (Left) */}
          <ResizablePanel id="dual-panel-left" defaultSize={50} minSize={30}>
            {openPanelIds[0] && (() => {
              const item1 = items.find(i => i.id === openPanelIds[0]);
              if (!item1) return null;

              return item1.type === 'pdf' ? (
                <PDFViewerModal
                  key={item1.id}
                  item={item1}
                  isOpen={true}
                  onClose={() => handleClose(item1.id)}
                  onUpdateItem={(updates) => onUpdateItem(item1.id, updates)}
                  renderInline={true}
                />
              ) : (
                <CardDetailModal
                  key={item1.id}
                  item={item1}
                  isOpen={true}
                  onClose={() => handleClose(item1.id)}
                  onUpdateItem={(updates) => onUpdateItem(item1.id, updates)}
                  onUpdateItemData={(updater) => onUpdateItemData(item1.id, updater)}
                  onFlushPendingChanges={onFlushPendingChanges}
                  renderInline={true}
                />
              );
            })()}
          </ResizablePanel>

          <ResizableHandle className="border-r border-sidebar-border" />

          {/* Second Panel (Right) */}
          <ResizablePanel id="dual-panel-right" defaultSize={50} minSize={30}>
            {openPanelIds[1] && (() => {
              const item2 = items.find(i => i.id === openPanelIds[1]);
              if (!item2) return null;

              return item2.type === 'pdf' ? (
                <PDFViewerModal
                  key={item2.id}
                  item={item2}
                  isOpen={true}
                  onClose={() => handleClose(item2.id)}
                  onUpdateItem={(updates) => onUpdateItem(item2.id, updates)}
                  renderInline={true}
                />
              ) : (
                <CardDetailModal
                  key={item2.id}
                  item={item2}
                  isOpen={true}
                  onClose={() => handleClose(item2.id)}
                  onUpdateItem={(updates) => onUpdateItem(item2.id, updates)}
                  onUpdateItemData={(updater) => onUpdateItemData(item2.id, updater)}
                  onFlushPendingChanges={onFlushPendingChanges}
                  renderInline={true}
                />
              );
            })()}
          </ResizablePanel>
        </ResizablePanelGroup>
      ) : (
        /* Single Panel Mode: Card Detail Modal or PDF Viewer Modal - only shown when item is maximized */
        activeItemId && currentItem && maximizedItemId === currentItem.id && (
          currentItem.type === 'pdf' ? (
            <PDFViewerModal
              key={currentItem.id}
              item={currentItem}
              isOpen={true}
              onClose={() => handleClose(currentItem.id)}
              onUpdateItem={(updates) => onUpdateItem(currentItem.id, updates)}
              renderInline={workspaceSplitViewActive}
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
              renderInline={workspaceSplitViewActive}
            />
          )
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
