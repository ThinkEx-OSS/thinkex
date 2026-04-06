"use client";

import { useEffect } from "react";
import SpotlightModal from "@/components/SpotlightModal";
import type { Item, PdfData } from "@/lib/workspace-state/types";
import { useUIStore } from "@/lib/stores/ui-store";
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
          onMaximize={() => useUIStore.getState().openWorkspaceItem(null)}
          onUpdateItem={onUpdateItem}
          onUpdateItemData={(updater) =>
            onUpdateItem({ data: updater(item.data) as Item["data"] })
          }
        />
      </SpotlightModal>
    </div>
  );
}

export default PDFViewerModal;
