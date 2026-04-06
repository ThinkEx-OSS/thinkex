"use client";

import { useEffect, useCallback } from "react";
import SpotlightModal from "@/components/SpotlightModal";
import type { Item, ItemData } from "@/lib/workspace-state/types";
import { useUIStore } from "@/lib/stores/ui-store";
import { ItemPanelContent } from "@/components/workspace-canvas/ItemPanelContent";

interface CardDetailModalProps {
  item: Item;
  isOpen: boolean;
  onClose: () => void;
  onUpdateItem: (updates: Partial<Item>) => void;
  onUpdateItemData: (updater: (prev: ItemData) => ItemData) => void;

  onFlushPendingChanges?: (itemId: string) => void;
  renderInline?: boolean; // Render as inline content instead of modal overlay
}

export function CardDetailModal({
  item,
  isOpen,
  onClose,
  onUpdateItem,
  onUpdateItemData,

  onFlushPendingChanges,
  renderInline = false,
}: CardDetailModalProps) {
  // Handle escape key
  const handleEscape = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      }
    },
    [onClose]
  );

  useEffect(() => {
    if (isOpen) {
      document.addEventListener("keydown", handleEscape);
    }
    return () => {
      document.removeEventListener("keydown", handleEscape);
    };
  }, [isOpen, handleEscape]);

  if (!isOpen) return null;

  // Render inline (for workspace split view)
  if (renderInline) {
    return (
      <div className="h-full w-full flex flex-col overflow-hidden bg-background">
        <ItemPanelContent
          item={item}
          onClose={onClose}
          onMaximize={() => useUIStore.getState().setMaximizedItemId(null)}
          isMaximized={true}
          onUpdateItem={onUpdateItem}
          onUpdateItemData={onUpdateItemData}
        />
      </div>
    );
  }

  // Render as modal overlay (default)
  return (
    <div
      className="absolute inset-0 z-30 flex items-center justify-center overflow-hidden card-detail-modal bg-background"
    >
      {/* Backdrop with blur */}
      <div
        className="absolute inset-0 backdrop-blur-xl backdrop-dark"
        style={{
          animation: 'fadeIn 0.25s ease-out both',
        }}
        onClick={onClose}
      />

      {/* Modal Content - fullscreen card detail view */}
      <SpotlightModal
        className="relative z-10 w-full h-full"
        spotlightColor="rgba(135, 206, 235, 0.15)"
        style={{
          animation: 'scaleIn 0.3s cubic-bezier(0.16, 1, 0.3, 1) both',
        }}
      >
        <ItemPanelContent
          item={item}
          onClose={onClose}
          onMaximize={() => useUIStore.getState().setMaximizedItemId(null)}
          isMaximized={true}
          onUpdateItem={onUpdateItem}
          onUpdateItemData={onUpdateItemData}
        />
      </SpotlightModal>
    </div>
  );
}

export default CardDetailModal;
