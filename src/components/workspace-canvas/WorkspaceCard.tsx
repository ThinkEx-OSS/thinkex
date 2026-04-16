import { useCallback, useState, memo, useRef, useEffect } from "react";
import { useTheme } from "next-themes";
import { toast } from "sonner";
import {
  getCardColorCSS,
  getCardAccentColor,
  type CardColor,
} from "@/lib/workspace-state/colors";
import type { Item, DocumentData } from "@/lib/workspace-state/types";
import type { ColorResult } from "react-color";
import { useUIStore, selectItemScrollLocked } from "@/lib/stores/ui-store";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import {
  WorkspaceCardContextMenuItems,
  WorkspaceCardControls,
} from "./WorkspaceCardActions";
import { WorkspaceCardContent } from "./WorkspaceCardContent";
import { WorkspaceCardDialogs } from "./WorkspaceCardDialogs";
import { WorkspaceCardTypeBadge } from "./WorkspaceCardTypeBadge";

interface WorkspaceCardProps {
  item: Item;
  allItems: Item[]; // All items for the move dialog tree
  workspaceName: string;
  workspaceIcon?: string | null;
  workspaceColor?: string | null;
  onUpdateItem: (itemId: string, updates: Partial<Item>) => void;
  onDeleteItem: (itemId: string) => void;
  onOpenModal: (itemId: string) => void;
  // NOTE: isSelected is now subscribed directly from the store to prevent
  // full grid re-renders when selection changes
  onMoveItem?: (itemId: string, folderId: string | null) => void; // Callback to move item to folder
}

/**
 * Individual workspace card component.
 * Handles rendering a single card with drag handle, options menu, and content.
 */
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
  const documentMarkdownRaw =
    item.type === "document"
      ? ((item.data as DocumentData).markdown || "").trim()
      : "";
  const documentPreviewText =
    item.type === "document"
      ? documentMarkdownRaw || "Start writing..."
      : "";
  const documentAwaitingGeneration =
    item.type === "document" &&
    item.name === "Update me" &&
    documentMarkdownRaw.length === 0;

  // Subscribe directly to this card's selection state from the store
  // This prevents full grid re-renders when selection changes
  const isSelected = useUIStore((state) => state.selectedCardIds.has(item.id));
  const onToggleSelection = useUIStore((state) => state.toggleCardSelection);

  // No dynamic calculations needed - just overflow hidden
  const [isColorPickerOpen, setIsColorPickerOpen] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [showMoveDialog, setShowMoveDialog] = useState(false);
  const [showRenameDialog, setShowRenameDialog] = useState(false);
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  // Get scroll lock state from Zustand store (persists across interactions)
  const isScrollLocked = useUIStore(selectItemScrollLocked(item.id));
  const toggleItemScrollLocked = useUIStore(
    (state) => state.toggleItemScrollLocked,
  );
  const shouldShowPreview = false;

  // Track minimal local drag detection (only if grid hasn't detected drag)
  const mouseDownRef = useRef<{ x: number; y: number } | null>(null);
  const hasMovedRef = useRef<boolean>(false);
  const listenersActiveRef = useRef<boolean>(false);
  const DRAG_THRESHOLD = 10; // pixels - movement beyond this prevents click

  // OPTIMIZED: Store handlers in refs so they can be added/removed dynamically
  // This avoids adding 240+ listeners (120 cards * 2 listeners) on every render
  const handlersRef = useRef<{
    handleGlobalMouseMove: ((e: MouseEvent) => void) | null;
    handleGlobalMouseUp: (() => void) | null;
  }>({ handleGlobalMouseMove: null, handleGlobalMouseUp: null });

  // Cleanup listeners on unmount
  useEffect(() => {
    const handlers = handlersRef.current;
    return () => {
      if (
        listenersActiveRef.current &&
        handlers.handleGlobalMouseMove &&
        handlers.handleGlobalMouseUp
      ) {
        document.removeEventListener(
          "mousemove",
          handlers.handleGlobalMouseMove,
        );
        document.removeEventListener(
          "mouseup",
          handlers.handleGlobalMouseUp,
        );
        listenersActiveRef.current = false;
      }
    };
  }, []);

  // OPTIMIZED: Memoize ItemHeader callbacks to prevent inline function creation
  const handleNameChange = useCallback(
    (v: string) => {
      onUpdateItem(item.id, { name: v });
    },
    [item.id, onUpdateItem],
  );

  const handleNameCommit = useCallback(
    (v: string) => {
      onUpdateItem(item.id, { name: v });
    },
    [item.id, onUpdateItem],
  );

  const handleSubtitleChange = useCallback(
    (v: string) => {
      onUpdateItem(item.id, { subtitle: v });
    },
    [item.id, onUpdateItem],
  );

  const handleTitleFocus = useCallback(() => {
    setIsEditingTitle(true);
  }, []);

  const handleTitleBlur = useCallback(() => {
    setIsEditingTitle(false);
  }, []);

  // Handle color change from color picker
  const handleColorChange = useCallback(
    (color: ColorResult) => {
      onUpdateItem(item.id, { color: color.hex as CardColor });
      setIsColorPickerOpen(false);
    },
    [item.id, onUpdateItem],
  );

  const handleDelete = useCallback(() => {
    setShowDeleteDialog(true);
  }, []);

  const handleDeleteConfirm = useCallback(() => {
    onDeleteItem(item.id);
    setShowDeleteDialog(false);
    toast.success("Card deleted successfully");
  }, [item.id, onDeleteItem]);

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

  // Handle mouse down - track initial position for local movement detection
  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      // Don't track if clicking on interactive elements or text inputs
      const target = e.target as HTMLElement;
      if (
        target.closest("button") ||
        target.closest("input") ||
        target.closest("textarea") ||
        target.closest('[role="menuitem"]') ||
        target.closest('[contenteditable="true"]')
      ) {
        // Important: Stop propagation to prevent grid drag from starting
        e.stopPropagation();
        return;
      }

      // Check if clicking inside a text selection area (e.g., title textarea)
      const selection = window.getSelection();
      if (selection && selection.toString().length > 0) {
        // User is selecting text, don't start drag tracking
        e.stopPropagation();
        return;
      }

      mouseDownRef.current = { x: e.clientX, y: e.clientY };
      hasMovedRef.current = false;

      // OPTIMIZED: Only add global listeners when mouseDown occurs, not on every render
      if (!listenersActiveRef.current) {
        const handleGlobalMouseMove = (e: MouseEvent) => {
          if (!mouseDownRef.current) return;

          // Calculate movement delta
          const deltaX = Math.abs(e.clientX - mouseDownRef.current.x);
          const deltaY = Math.abs(e.clientY - mouseDownRef.current.y);

          // If drag already detected, don't cancel it - user is dragging
          if (hasMovedRef.current) {
            return;
          }

          // Check if user is selecting text - if so, don't treat as drag
          const selection = window.getSelection();
          if (selection && selection.toString().length > 0) {
            mouseDownRef.current = null;
            hasMovedRef.current = false;
            return;
          }

          // Check if movement exceeds threshold
          if (deltaX > DRAG_THRESHOLD || deltaY > DRAG_THRESHOLD) {
            hasMovedRef.current = true;
          }
        };

        const handleGlobalMouseUp = () => {
          mouseDownRef.current = null;
          // Clean up listeners when mouse up
          if (
            listenersActiveRef.current &&
            handlersRef.current.handleGlobalMouseMove &&
            handlersRef.current.handleGlobalMouseUp
          ) {
            document.removeEventListener(
              "mousemove",
              handlersRef.current.handleGlobalMouseMove,
            );
            document.removeEventListener(
              "mouseup",
              handlersRef.current.handleGlobalMouseUp,
            );
            listenersActiveRef.current = false;
            handlersRef.current.handleGlobalMouseMove = null;
            handlersRef.current.handleGlobalMouseUp = null;
          }
        };

        handlersRef.current.handleGlobalMouseMove = handleGlobalMouseMove;
        handlersRef.current.handleGlobalMouseUp = handleGlobalMouseUp;
        document.addEventListener("mousemove", handleGlobalMouseMove);
        document.addEventListener("mouseup", handleGlobalMouseUp);
        listenersActiveRef.current = true;
      }
    },
    [DRAG_THRESHOLD],
  );

  // Handle mouse move on card - detect if user moved before releasing
  // Note: This is a fallback - the global listener handles most cases
  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    // The global listener handles this, but we keep this for local element-specific checks
    if (!mouseDownRef.current) return;

    // Only check for text input/selection if drag hasn't been detected yet
    // This prevents starting a drag when user is trying to select text
    const target = e.target as HTMLElement;
    if (
      target.closest("textarea") ||
      target.closest("input") ||
      target.closest('[contenteditable="true"]')
    ) {
      // User is interacting with text input, cancel drag tracking
      mouseDownRef.current = null;
      hasMovedRef.current = false;
      return;
    }
  }, []);

  // Handle mouse up - clear the mouse down tracking
  // Note: The global listener also handles this, but we keep this for local cleanup
  const handleMouseUp = useCallback(() => {
    // Don't clear here - let the global listener handle it to ensure consistency
  }, []);

  const handleCardClick = useCallback(
    (e: React.MouseEvent) => {
      // Check if click originated from dropdown menu
      const target = e.target as HTMLElement;
      if (
        target.closest('[data-slot="dropdown-menu-item"]') ||
        target.closest('[data-slot="dropdown-menu-content"]') ||
        target.closest('[data-slot="dropdown-menu-trigger"]') ||
        target.closest('[data-slot="popover-content"]') ||
        target.closest('[data-slot="popover"]') ||
        target.closest('[data-slot="dialog-content"]') ||
        target.closest('[data-slot="dialog-close"]') ||
        target.closest('[data-slot="dialog-overlay"]')
      ) {
        e.preventDefault();
        e.stopPropagation();
        return;
      }

      // For flashcard cards, check if click is on the flashcard itself
      // If so, let the flashcard handle it (for flipping)
      if (item.type === "flashcard") {
        // Check if click is on the flashcard component or its children
        const flashcardElement = target.closest(
          '.flashcard-container, .flashcard, [class*="flashcard"]',
        );
        if (flashcardElement) {
          // Click is on flashcard - let it flip, don't open modal
          e.stopPropagation();
          return;
        }
      }

      // Check if user was selecting text - if so, allow normal text selection behavior
      const selection = window.getSelection();
      if (selection && selection.toString().length > 0) {
        // User selected text, don't open modal or prevent default
        return;
      }

      // Shift+click toggles card selection
      if (e.shiftKey) {
        e.stopPropagation();
        onToggleSelection(item.id);
        return;
      }

      // Check if user moved mouse significantly (drag detected) or is editing title
      // Store the value before resetting
      const wasDragging = hasMovedRef.current;

      // Reset the tracking immediately after checking
      hasMovedRef.current = false;

      // Prevent opening modal if user was dragging or is editing title
      if (wasDragging || isEditingTitle) {
        e.preventDefault();
        e.stopPropagation();
        return;
      }

      // Default: open item in the left-pane overlay
      onOpenModal(item.id);
    },
    [
      isEditingTitle,
      item.id,
      item.type,
      onOpenModal,
      onToggleSelection,
    ],
  );

  const handleMove = useCallback(
    (folderId: string | null) => {
      if (!onMoveItem) return;
      onMoveItem(item.id, folderId);
      toast.success("Item moved");
    },
    [item.id, onMoveItem],
  );

  const shouldUseFramelessLayout =
    item.type === "youtube" ||
    item.type === "image" ||
    (item.type === "pdf" && shouldShowPreview);
  const shouldShowScrollLockButton =
    item.type !== "youtube" &&
    item.type !== "image" &&
    item.type !== "quiz" &&
    !(item.type === "document" && (!shouldShowPreview || documentAwaitingGeneration)) &&
    !(item.type === "pdf" && !shouldShowPreview) &&
    !(item.type === "audio" && !shouldShowPreview);
  const useDarkFloatingControls =
    item.type === "pdf" && shouldShowPreview;

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <div className="group size-full">
          <article
            id={`item-${item.id}`}
            data-youtube-card
            data-item-type={item.type}
            data-has-preview={shouldShowPreview}
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
              } as React.CSSProperties
            }
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onClick={handleCardClick}
          >
            <WorkspaceCardControls
              itemType={item.type}
              showScrollLockButton={shouldShowScrollLockButton}
              useDarkOverlay={useDarkFloatingControls}
              resolvedTheme={resolvedTheme}
              isScrollLocked={isScrollLocked}
              isSelected={isSelected}
              isEditingTitle={isEditingTitle}
              canMove={Boolean(onMoveItem)}
              onToggleScrollLock={() => toggleItemScrollLocked(item.id)}
              onToggleSelection={() => onToggleSelection(item.id)}
              onOpenRename={() => setShowRenameDialog(true)}
              onOpenMove={() => setShowMoveDialog(true)}
              onCopyMarkdown={handleCopyMarkdown}
              onOpenColorPicker={() => setIsColorPickerOpen(true)}
              onDelete={handleDelete}
            />

            <WorkspaceCardTypeBadge
              item={item}
              shouldShowPreview={shouldShowPreview}
              resolvedTheme={resolvedTheme}
            />

            <WorkspaceCardContent
              item={item}
              shouldShowPreview={shouldShowPreview}
              isScrollLocked={isScrollLocked}
              documentAwaitingGeneration={documentAwaitingGeneration}
              documentPreviewText={documentPreviewText}
              resolvedTheme={resolvedTheme}
              onNameChange={handleNameChange}
              onNameCommit={handleNameCommit}
              onSubtitleChange={handleSubtitleChange}
              onTitleFocus={handleTitleFocus}
              onTitleBlur={handleTitleBlur}
              onUpdateItemData={(updater) =>
                onUpdateItem(item.id, {
                  data: updater(item.data) as Item["data"],
                })
              }
            />
          </article>

          <WorkspaceCardDialogs
            item={item}
            allItems={allItems}
            workspaceName={workspaceName}
            workspaceIcon={workspaceIcon}
            workspaceColor={workspaceColor}
            isColorPickerOpen={isColorPickerOpen}
            onColorPickerOpenChange={setIsColorPickerOpen}
            showDeleteDialog={showDeleteDialog}
            onDeleteDialogChange={setShowDeleteDialog}
            showMoveDialog={showMoveDialog}
            onMoveDialogChange={setShowMoveDialog}
            showRenameDialog={showRenameDialog}
            onRenameDialogChange={setShowRenameDialog}
            onColorChange={handleColorChange}
            onDeleteConfirm={handleDeleteConfirm}
            onRename={handleRename}
            onMove={onMoveItem ? handleMove : undefined}
          />
        </div>
      </ContextMenuTrigger>

      <ContextMenuContent className="w-48">
        <WorkspaceCardContextMenuItems
          itemType={item.type}
          canMove={Boolean(onMoveItem)}
          onOpenRename={() => setShowRenameDialog(true)}
          onOpenMove={() => setShowMoveDialog(true)}
          onCopyMarkdown={handleCopyMarkdown}
          onOpenColorPicker={() => setIsColorPickerOpen(true)}
          onDelete={handleDelete}
        />
      </ContextMenuContent>
    </ContextMenu>
  );
}

// Memoize to prevent unnecessary re-renders
export const WorkspaceCardMemoized = memo(
  WorkspaceCard,
  (prevProps, nextProps) => {
    // Compare item properties
    if (prevProps.item.id !== nextProps.item.id) return false;
    if (prevProps.item.name !== nextProps.item.name) return false;
    if (prevProps.item.subtitle !== nextProps.item.subtitle) return false;
    if (prevProps.item.color !== nextProps.item.color) return false;
    if (prevProps.item.type !== nextProps.item.type) return false;

    // Compare item data (for PDFs, flashcards, and YouTube)
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


    // NOTE: isSelected is now subscribed directly from the store, not a prop

    // NOTE: We intentionally do NOT compare callback references (onUpdateItem, onDeleteItem, etc.)
    // These are action handlers that don't affect the rendered output.
    // React Compiler handles memoization, and checking refs here causes unnecessary re-renders
    // when parent components re-render and create new callback instances.

    return true; // Props are equal, skip re-render
  },
);

// Export both the memoized version and original for backwards compatibility
export { WorkspaceCardMemoized as WorkspaceCard };
