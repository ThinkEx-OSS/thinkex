"use client";

import { X } from "lucide-react";
import { useEffect, useMemo } from "react";
import ItemHeader from "@/components/workspace-canvas/ItemHeader";
import SpotlightModal from "@/components/SpotlightModal";
import { getCardColorCSS, getCardAccentColor, getWhiteTintedColor } from "@/lib/workspace-state/colors";
import type { Item, PdfData } from "@/lib/workspace-state/types";
import { useUIStore, selectSelectedCardIdsArray } from "@/lib/stores/ui-store";
import { useShallow } from "zustand/react/shallow";
import { formatKeyboardShortcut } from "@/lib/utils/keyboard-shortcut";
import { ItemPanelContent } from "@/components/workspace-canvas/ItemPanelContent";

interface PDFViewerModalProps {
  item: Item;
  isOpen: boolean;
  onClose: () => void;
  onUpdateItem: (updates: Partial<Item>) => void;
}

export function PDFViewerModal({
  item,
  isOpen,
  onClose,
  onUpdateItem,
}: PDFViewerModalProps) {
  const pdfData = item.data as PdfData;

  // Get global chat state from UI store
  const isChatExpanded = useUIStore((state) => state.isChatExpanded);
  const setIsChatExpanded = useUIStore((state) => state.setIsChatExpanded);
  const toggleCardSelection = useUIStore((state) => state.toggleCardSelection);

  // Use array selector with shallow comparison to prevent unnecessary re-renders and SSR issues
  const selectedCardIdsArray = useUIStore(
    useShallow(selectSelectedCardIdsArray)
  );
  const selectedCardIds = useMemo(() => new Set(selectedCardIdsArray), [selectedCardIdsArray]);

  // Track whether we selected the card (so we know whether to deselect on cleanup)
  useEffect(() => {
    // Only run when modal is open and we have an item
    if (!isOpen || !item?.id) return;

    // Check if card was already selected at the time of opening
    const wasAlreadySelected = selectedCardIds.has(item.id);

    // If not already selected, select it now (adds it to context)
    if (!wasAlreadySelected) {
      toggleCardSelection(item.id);

      // Only deselect on cleanup if we were the ones who selected it
      return () => {
        toggleCardSelection(item.id);
      };
    }

    // If it was already selected, don't change anything on cleanup
    return undefined;
  }, [isOpen, item?.id]); // Removed selectedCardIds and toggleCardSelection from deps

  // Handle escape key
  const handleEscape = (e: KeyboardEvent) => {
    if (e.key === "Escape") {
      onClose();
    }
  };

  useEffect(() => {
    if (isOpen) {
      document.addEventListener("keydown", handleEscape);
    }
    return () => {
      document.removeEventListener("keydown", handleEscape);
    };
  }, [isOpen]);

  if (!pdfData?.fileUrl || !isOpen) {
    return null;
  }

  return (
    <div
      className="absolute inset-0 z-30 flex items-center justify-center overflow-hidden pdf-viewer-modal"
    >
      {/* Backdrop with blur */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-xl"
        onClick={onClose}
      />

      {/* Modal Content */}
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
          onUpdateItemData={() => { }} // PDF doesn't use onUpdateItemData in its modal typically
        />
      </SpotlightModal>
    </div>
  );
}

export default PDFViewerModal;
