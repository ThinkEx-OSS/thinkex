"use client";

import { X } from "lucide-react";
import { useEffect } from "react";
import ItemHeader from "@/components/workspace-canvas/ItemHeader";
import SpotlightModal from "@/components/SpotlightModal";
import { getCardColorCSS, getCardAccentColor, getWhiteTintedColor } from "@/lib/workspace-state/colors";
import type { Item, PdfData } from "@/lib/workspace-state/types";
import { useUIStore } from "@/lib/stores/ui-store";
import { formatKeyboardShortcut } from "@/lib/utils/keyboard-shortcut";
import { ItemPanelContent } from "@/components/workspace-canvas/ItemPanelContent";

interface PDFViewerModalProps {
  item: Item;
  isOpen: boolean;
  onClose: () => void;
  onUpdateItem: (updates: Partial<Item>) => void;
  renderInline?: boolean; // Render as inline content instead of modal overlay
}

export function PDFViewerModal({
  item,
  isOpen,
  onClose,
  onUpdateItem,
  renderInline = false,
}: PDFViewerModalProps) {
  const pdfData = item.data as PdfData;

  // Get global chat state from UI store
  const isChatExpanded = useUIStore((state) => state.isChatExpanded);
  const setIsChatExpanded = useUIStore((state) => state.setIsChatExpanded);
  const toggleCardSelection = useUIStore((state) => state.toggleCardSelection);

  // Auto-select card when modal opens (read selection state imperatively to avoid infinite loops)
  useEffect(() => {
    if (!isOpen || !item?.id) return;

    // Check if card was already selected at the time of opening
    const wasAlreadySelected = useUIStore.getState().selectedCardIds.has(item.id);

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
  }, [isOpen, item?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      }
    };

    if (isOpen) {
      document.addEventListener("keydown", handleEscape);
    }
    return () => {
      document.removeEventListener("keydown", handleEscape);
    };
  }, [isOpen, onClose]);

  if (!pdfData?.fileUrl || !isOpen) {
    return null;
  }

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
          onUpdateItemData={(data) => onUpdateItem({ data })}
        />
      </div>
    );
  }

  // Render as modal overlay (default)
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
