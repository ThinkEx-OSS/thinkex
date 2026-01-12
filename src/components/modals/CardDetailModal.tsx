"use client";

import { X } from "lucide-react";
import { useEffect, useCallback } from "react";
import ItemHeader from "@/components/workspace-canvas/ItemHeader";
import ChatFloatingButton from "@/components/chat/ChatFloatingButton";
import SpotlightModal from "@/components/SpotlightModal";
import { getCardColorCSS, getCardAccentColor, getWhiteTintedColor } from "@/lib/workspace-state/colors";
import type { Item, ItemData } from "@/lib/workspace-state/types";
import { useUIStore } from "@/lib/stores/ui-store";
import { formatKeyboardShortcut } from "@/lib/utils/keyboard-shortcut";
import { ItemPanelContent } from "@/components/workspace-canvas/ItemPanelContent";

interface CardDetailModalProps {
  item: Item;
  isOpen: boolean;
  onClose: () => void;
  onUpdateItem: (updates: Partial<Item>) => void;
  onUpdateItemData: (updater: (prev: ItemData) => ItemData) => void;

  onFlushPendingChanges?: (itemId: string) => void;
}

export function CardDetailModal({
  item,
  isOpen,
  onClose,
  onUpdateItem,
  onUpdateItemData,

  onFlushPendingChanges,
}: CardDetailModalProps) {
  // Get global chat state from UI store
  const isChatExpanded = useUIStore((state) => state.isChatExpanded);
  const setIsChatExpanded = useUIStore((state) => state.setIsChatExpanded);

  // Auto-selection: subscribe to toggle function only (not the selection state)
  // Since WorkspaceCard now subscribes directly to its own isSelected state,
  // changing the selection will only re-render the affected card, not all cards
  const toggleCardSelection = useUIStore((state) => state.toggleCardSelection);
  const selectedCardIds = useUIStore((state) => state.selectedCardIds);

  // Auto-select card when modal opens
  useEffect(() => {
    if (!isOpen || !item?.id) return;

    // Check if card was already selected at the time of opening
    const wasAlreadySelected = selectedCardIds.has(item.id);

    // If not already selected, select it now
    if (!wasAlreadySelected) {
      toggleCardSelection(item.id);

      // Only deselect on cleanup if we were the ones who selected it
      return () => {
        toggleCardSelection(item.id);
      };
    }

    return undefined;
  }, [isOpen, item?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // eslint-disable-next-line react-hooks/exhaustive-deps

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

  return (
    <div
      className="absolute inset-0 z-40 flex items-center justify-center overflow-hidden card-detail-modal"
    >
      {/* Backdrop with blur - scoped to workspace panel only */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-xl"
        onClick={onClose}
      />

      {/* Modal Content - fullscreen card detail view */}
      <SpotlightModal
        className="relative z-10 w-full h-full"
        spotlightColor="rgba(135, 206, 235, 0.15)"
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
