import { useCallback, memo, type CSSProperties } from "react";
import { useTheme } from "next-themes";
import { toast } from "sonner";
import {
  getCardColorCSS,
  getCardAccentColor,
  type CardColor,
} from "@/lib/workspace-state/colors";
import type { Item, DocumentData } from "@/lib/workspace-state/types";
import type { ColorResult } from "react-color";
import { useUIStore } from "@/lib/stores/ui-store";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import {
  WorkspaceCardContextMenuItems,
  WorkspaceCardControls,
} from "./WorkspaceCardActions";
import { SharedCardDialogs, SimpleDeleteDialog } from "./CardDialogs";
import { WorkspaceCardTypeBadge } from "./WorkspaceCardTypeBadge";
import {
  isFramelessWorkspaceCardItem,
  WorkspaceCanvasItemPreview,
} from "./WorkspaceItemView";
import { useCardActionState } from "./useCardActionState";

interface WorkspaceCardProps {
  item: Item;
  allItems: Item[];
  workspaceName: string;
  workspaceIcon?: string | null;
  workspaceColor?: string | null;
  onUpdateItem: (itemId: string, updates: Partial<Item>) => void;
  onDeleteItem: (itemId: string) => void;
  onOpenModal: (itemId: string) => void;
  onMoveItem?: (itemId: string, folderId: string | null) => void;
}

function WorkspaceCard({
  item,
  allItems,
  workspaceName,
  workspaceIcon,
  workspaceColor,
  onUpdateItem,
  onDeleteItem,
  onOpenModal,
  onMoveItem,
}: WorkspaceCardProps) {
  const { resolvedTheme } = useTheme();

  const isSelected = useUIStore((state) => state.selectedCardIds.has(item.id));
  const onToggleSelection = useUIStore((state) => state.toggleCardSelection);
  const {
    isColorPickerOpen,
    setIsColorPickerOpen,
    showDeleteDialog,
    setShowDeleteDialog,
    showMoveDialog,
    setShowMoveDialog,
    showRenameDialog,
    setShowRenameDialog,
    openColorPicker,
    openDeleteDialog,
    openMoveDialog,
    openRenameDialog,
  } = useCardActionState();

  const handleColorChange = useCallback(
    (color: ColorResult) => {
      onUpdateItem(item.id, { color: color.hex as CardColor });
      setIsColorPickerOpen(false);
    },
    [item.id, onUpdateItem, setIsColorPickerOpen],
  );

  const handleDeleteConfirm = useCallback(() => {
    onDeleteItem(item.id);
    setShowDeleteDialog(false);
    toast.success("Card deleted successfully");
  }, [item.id, onDeleteItem, setShowDeleteDialog]);

  const handleRename = useCallback(
    (newName: string) => {
      onUpdateItem(item.id, { name: newName });
      toast.success("Card renamed");
    },
    [item.id, onUpdateItem],
  );

  const handleCopyMarkdown = useCallback(() => {
    if (item.type !== "document") return;
    const md = (item.data as DocumentData).markdown ?? "";
    if (md) {
      navigator.clipboard
        .writeText(md)
        .then(() => {
          toast.success("Copied to clipboard");
        })
        .catch(() => {
          toast.error("Failed to copy");
        });
    } else {
      toast.error("No content to copy");
    }
  }, [item.type, item.data]);

  const isInteractiveTarget = useCallback((target: HTMLElement) => {
    return Boolean(
      target.closest("button") ||
        target.closest("input") ||
        target.closest("textarea") ||
        target.closest("select") ||
        target.closest("a") ||
        target.closest("label") ||
        target.closest('[role="menuitem"]') ||
        target.closest('[data-slot="dropdown-menu-content"]') ||
        target.closest('[data-slot="dropdown-menu-trigger"]') ||
        target.closest('[data-slot="popover-content"]') ||
        target.closest('[data-slot="popover"]') ||
        target.closest('[data-slot="dialog-content"]') ||
        target.closest('[data-slot="dialog-close"]') ||
        target.closest('[data-slot="dialog-overlay"]'),
    );
  }, []);

  const handleCardClick = useCallback(
    (e: React.MouseEvent) => {
      const target = e.target as HTMLElement;
      if (isInteractiveTarget(target)) {
        e.preventDefault();
        e.stopPropagation();
        return;
      }

      const selection = window.getSelection();
      if (selection && selection.toString().length > 0) {
        return;
      }

      if (e.shiftKey) {
        e.stopPropagation();
        onToggleSelection(item.id);
        return;
      }

      onOpenModal(item.id);
    },
    [isInteractiveTarget, item.id, onOpenModal, onToggleSelection],
  );

  const handleCardKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLElement>) => {
      if (e.key !== "Enter" && e.key !== " ") {
        return;
      }

      const target = e.target as HTMLElement;
      if (isInteractiveTarget(target)) {
        return;
      }

      e.preventDefault();

      if (e.shiftKey) {
        onToggleSelection(item.id);
        return;
      }

      onOpenModal(item.id);
    },
    [isInteractiveTarget, item.id, onOpenModal, onToggleSelection],
  );

  const handleMove = useCallback(
    (folderId: string | null) => {
      if (!onMoveItem) return;
      onMoveItem(item.id, folderId);
      toast.success("Item moved");
    },
    [item.id, onMoveItem],
  );

  const shouldUseFramelessLayout = isFramelessWorkspaceCardItem(item);

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <div className="group size-full">
          <article
            id={`item-${item.id}`}
            data-youtube-card
            data-item-type={item.type}
            role="button"
            tabIndex={0}
            className={`relative rounded-md scroll-mt-4 size-full flex flex-col overflow-hidden transition-all duration-200 cursor-pointer ${
              shouldUseFramelessLayout
                ? "p-0"
                : "p-3 border shadow-sm hover:border-foreground/30 hover:shadow-md focus-within:border-foreground/50"
            }`}
            style={
              {
                backgroundColor:
                  item.type === "youtube" || item.type === "image"
                    ? "transparent"
                    : item.color
                      ? getCardColorCSS(
                          item.color,
                          resolvedTheme === "dark" ? 0.25 : 0.4,
                        )
                      : "var(--card)",
                borderColor: isSelected
                  ? "rgba(255, 255, 255, 0.8)"
                  : item.color
                    ? getCardAccentColor(
                        item.color,
                        resolvedTheme === "dark" ? 0.5 : 0.3,
                      )
                    : "transparent",
                borderWidth: isSelected
                  ? "3px"
                  : shouldUseFramelessLayout
                    ? "0px"
                    : "1px",
                boxShadow:
                  isSelected && resolvedTheme !== "dark"
                    ? "0 0 3px rgba(0, 0, 0, 0.8), 0 0 8px rgba(0, 0, 0, 0.5)"
                    : undefined,
                transition:
                  "border-color 150ms ease-out, box-shadow 150ms ease-out, background-color 150ms ease-out",
              } as CSSProperties
            }
            onClick={handleCardClick}
            onKeyDown={handleCardKeyDown}
          >
            <WorkspaceCardControls
              itemType={item.type}
              useDarkOverlay={false}
              resolvedTheme={resolvedTheme}
              isSelected={isSelected}
              canMove={Boolean(onMoveItem)}
              onToggleSelection={() => onToggleSelection(item.id)}
              onOpenRename={openRenameDialog}
              onOpenMove={openMoveDialog}
              onCopyMarkdown={handleCopyMarkdown}
              onOpenColorPicker={openColorPicker}
              onDelete={openDeleteDialog}
            />

            <WorkspaceCardTypeBadge item={item} resolvedTheme={resolvedTheme} />

            <WorkspaceCanvasItemPreview item={item} />
          </article>

          <SharedCardDialogs
            item={item}
            allItems={allItems}
            workspaceName={workspaceName}
            workspaceIcon={workspaceIcon}
            workspaceColor={workspaceColor}
            isColorPickerOpen={isColorPickerOpen}
            onColorPickerOpenChange={setIsColorPickerOpen}
            showMoveDialog={showMoveDialog}
            onMoveDialogChange={setShowMoveDialog}
            showRenameDialog={showRenameDialog}
            onRenameDialogChange={setShowRenameDialog}
            onColorChange={handleColorChange}
            onRename={handleRename}
            onMove={onMoveItem ? handleMove : undefined}
          />
          <SimpleDeleteDialog
            open={showDeleteDialog}
            onOpenChange={setShowDeleteDialog}
            title="Delete Card"
            description={`Are you sure you want to delete "${item.name}"? This action cannot be undone.`}
            onConfirm={handleDeleteConfirm}
          />
        </div>
      </ContextMenuTrigger>

      <ContextMenuContent className="w-48">
        <WorkspaceCardContextMenuItems
          itemType={item.type}
          canMove={Boolean(onMoveItem)}
          onOpenRename={openRenameDialog}
          onOpenMove={openMoveDialog}
          onCopyMarkdown={handleCopyMarkdown}
          onOpenColorPicker={openColorPicker}
          onDelete={openDeleteDialog}
        />
      </ContextMenuContent>
    </ContextMenu>
  );
}

export const WorkspaceCardMemoized = memo(
  WorkspaceCard,
  (prevProps, nextProps) => {
    if (prevProps.item.id !== nextProps.item.id) return false;
    if (prevProps.item.name !== nextProps.item.name) return false;
    if (prevProps.item.subtitle !== nextProps.item.subtitle) return false;
    if (prevProps.item.color !== nextProps.item.color) return false;
    if (prevProps.item.type !== nextProps.item.type) return false;

    if (prevProps.item.type === "pdf" && nextProps.item.type === "pdf") {
      const prevData = prevProps.item.data;
      const nextData = nextProps.item.data;
      if (JSON.stringify(prevData) !== JSON.stringify(nextData)) return false;
    }
    if (
      prevProps.item.type === "flashcard" &&
      nextProps.item.type === "flashcard"
    ) {
      const prevData = prevProps.item.data;
      const nextData = nextProps.item.data;
      if (JSON.stringify(prevData) !== JSON.stringify(nextData)) return false;
    }
    if (
      prevProps.item.type === "youtube" &&
      nextProps.item.type === "youtube"
    ) {
      const prevData = prevProps.item.data;
      const nextData = nextProps.item.data;
      if (JSON.stringify(prevData) !== JSON.stringify(nextData)) return false;
    }
    if (prevProps.item.type === "quiz" && nextProps.item.type === "quiz") {
      const prevData = prevProps.item.data;
      const nextData = nextProps.item.data;
      if (JSON.stringify(prevData) !== JSON.stringify(nextData)) return false;
    }
    if (prevProps.item.type === "image" && nextProps.item.type === "image") {
      const prevData = prevProps.item.data;
      const nextData = nextProps.item.data;
      if (JSON.stringify(prevData) !== JSON.stringify(nextData)) return false;
    }
    if (prevProps.item.type === "audio" && nextProps.item.type === "audio") {
      const prevData = prevProps.item.data;
      const nextData = nextProps.item.data;
      if (JSON.stringify(prevData) !== JSON.stringify(nextData)) return false;
    }
    if (
      prevProps.item.type === "document" &&
      nextProps.item.type === "document"
    ) {
      const prevData = prevProps.item.data;
      const nextData = nextProps.item.data;
      if (JSON.stringify(prevData) !== JSON.stringify(nextData)) return false;
    }

    return true;
  },
);

export { WorkspaceCardMemoized as WorkspaceCard };
