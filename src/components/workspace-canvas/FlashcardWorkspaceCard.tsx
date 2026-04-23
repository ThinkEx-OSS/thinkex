"use client";

import { useState, useCallback, useEffect, useRef, useMemo, memo } from "react";
import { toast } from "sonner";
import {
  MoreVertical,
  Trash2,
  CheckCircle2,
  Pencil,
  ZoomIn,
  ZoomOut,
  Palette,
  ChevronLeft,
  ChevronRight,
  X,
  FolderInput,
} from "lucide-react";
import { PiMouseScrollFill, PiMouseScrollBold } from "react-icons/pi";
import { useTheme } from "next-themes";
import type {
  Item,
  ItemData,
  FlashcardData,
  FlashcardItem,
} from "@/lib/workspace-state/types";
import { FlipCard } from "./FlipCard";
import {
  SWATCHES_COLOR_GROUPS,
  getCardColorCSS,
  getCardAccentColor,
  type CardColor,
} from "@/lib/workspace-state/colors";
import { SwatchesPicker, ColorResult } from "react-color";
import { useUIStore, selectItemScrollLocked } from "@/lib/stores/ui-store";
import { StreamdownMarkdown } from "@/components/ui/streamdown-markdown";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import MoveToDialog from "@/components/modals/MoveToDialog";
import RenameDialog from "@/components/modals/RenameDialog";
import { cn } from "@/lib/utils";
interface FlashcardWorkspaceCardProps {
  item: Item;
  allItems?: Item[]; // All items for the move dialog tree
  workspaceName?: string;
  workspaceIcon?: string | null;
  workspaceColor?: string | null;
  onUpdateItem: (itemId: string, updates: Partial<Item>) => void;
  /**
   * Optional updater-style data patcher. Preferred for patching individual
   * fields inside `data` (e.g. `zoom`) because it composes with other
   * in-flight `updateItemData` updaters instead of overwriting the whole
   * blob the way `onUpdateItem({ data })` does.
   */
  onUpdateItemData?: (
    itemId: string,
    updater: (prev: ItemData) => ItemData,
  ) => void;
  onDeleteItem: (itemId: string) => void;
  onOpenModal: (itemId: string) => void;
  onMoveItem?: (itemId: string, folderId: string | null) => void; // Callback to move item to folder
  // NOTE: isSelected removed - card subscribes directly to store for performance
  // onToggleSelection is still passed as a prop for the shift+click handler
}

const EMPTY_FLASHCARD_PLACEHOLDER: FlashcardItem = {
  id: "__empty__",
  front: "",
  back: "",
};

const ZOOM_MIN = 0.5;
const ZOOM_MAX = 2.5;
const ZOOM_STEP = 0.1;
const ZOOM_DEFAULT = 1;

/** Center all markdown blocks on the card; keep code blocks full-width and left-aligned. */
const FLASHCARD_STREAMDOWN_CLASS = cn(
  // Fluid type: size comes from the nearest [container-type:size] ancestor (card face)
  "font-medium max-w-none text-center leading-[1.45] text-[length:calc(clamp(0.82rem,0.42rem+3cqmin,2.85rem)*var(--flashcard-zoom,1))]",
  // globals.css fixes .streamdown-content at 0.875rem — inherit this wrapper’s fluid size instead
  "[&_.streamdown-content]:!text-inherit [&_.streamdown-content]:![font-size:1em]",
  "[&_.streamdown-content_p]:!text-inherit [&_.streamdown-content_li]:!text-inherit [&_.streamdown-content_td]:!text-inherit [&_.streamdown-content_th]:!text-inherit",
  "[&_.streamdown-content_h1]:!text-[1.32em] [&_.streamdown-content_h2]:!text-[1.2em] [&_.streamdown-content_h3]:!text-[1.1em] [&_.streamdown-content_h4]:!text-[1.04em]",
  "[&_.streamdown-content_pre]:!text-[0.9em]",
  "[&_.streamdown-content]:flex [&_.streamdown-content]:flex-col [&_.streamdown-content]:items-center [&_.streamdown-content]:text-center",
  // Lists: drop outside gutter so the block sits in the centered column
  "[&_.streamdown-content_ul]:!ml-0 [&_.streamdown-content_ul]:list-inside",
  "[&_.streamdown-content_ol]:!ml-0 [&_.streamdown-content_ol]:list-inside",
  // Wide / monospace blocks: stretch and align like normal editors
  "[&_.streamdown-content_[data-streamdown=code-block]]:w-full [&_.streamdown-content_[data-streamdown=code-block]]:max-w-full [&_.streamdown-content_[data-streamdown=code-block]]:self-stretch [&_.streamdown-content_[data-streamdown=code-block]]:!text-left",
  "[&_.streamdown-content_pre]:w-full [&_.streamdown-content_pre]:max-w-full [&_.streamdown-content_pre]:self-stretch [&_.streamdown-content_pre]:!text-left",
  // Tables: use full width when present; cells follow markdown alignment when set
  "[&_.streamdown-content_table]:w-full [&_.streamdown-content_table]:max-w-full [&_.streamdown-content_table]:self-stretch",
);

/** Read-only markdown per side. */
const FlashcardSideMarkdownView = memo(
  function FlashcardSideMarkdownView({
    markdown,
    isScrollLocked,
    className = "",
  }: {
    markdown: string;
    isScrollLocked: boolean;
    className?: string;
  }) {
    return (
      <div
        className={`workspace-card-readonly-editor [container-type:size] text-foreground size-full min-h-0 antialiased ${isScrollLocked ? "overflow-hidden" : "overflow-auto"} ${className}`}
        style={{
          paddingTop: "1.5rem",
          paddingBottom: "1.5rem",
          paddingLeft: "1.5rem",
          paddingRight: "1.5rem",
        }}
      >
        <div
          className={`flex flex-col items-center min-w-0 w-full ${isScrollLocked ? "justify-center min-h-full" : ""}`}
        >
          <div className="w-full max-w-full min-w-0 text-center">
            {!markdown.trim() ? (
              <div className="text-center text-muted-foreground px-2 text-[length:calc(clamp(0.72rem,0.3rem+2cqmin,1.05rem)*var(--flashcard-zoom,1))]">
                Ask the AI or click the pencil icon to add flashcards
              </div>
            ) : (
              <StreamdownMarkdown className={FLASHCARD_STREAMDOWN_CLASS}>
                {markdown}
              </StreamdownMarkdown>
            )}
          </div>
        </div>
      </div>
    );
  },
  (prev, next) =>
    prev.markdown === next.markdown &&
    prev.isScrollLocked === next.isScrollLocked &&
    prev.className === next.className,
);

export function FlashcardWorkspaceCard({
  item,
  allItems,
  workspaceName,
  workspaceIcon,
  workspaceColor,
  onUpdateItem,
  onUpdateItemData,
  onDeleteItem,
  onOpenModal,
  onMoveItem,
}: FlashcardWorkspaceCardProps) {
  // Subscribe directly to this card's selection state from the store
  // This prevents full grid re-renders when selection changes
  const isSelected = useUIStore((state) => state.selectedCardIds.has(item.id));
  const onToggleSelection = useUIStore((state) => state.toggleCardSelection);
  const { resolvedTheme } = useTheme();

  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [showMoveDialog, setShowMoveDialog] = useState(false);
  const [showRenameDialog, setShowRenameDialog] = useState(false);
  const [isColorPickerOpen, setIsColorPickerOpen] = useState(false);
  const [isFlipped, setIsFlipped] = useState(false);
  const [isFlipping, setIsFlipping] = useState(false);
  // Get scroll lock state from Zustand store (persists across interactions)
  const isScrollLocked = useUIStore(selectItemScrollLocked(item.id));
  const toggleItemScrollLocked = useUIStore(
    (state) => state.toggleItemScrollLocked,
  );
  const flashcardData = item.data as FlashcardData;
  const persistedZoom =
    (flashcardData as FlashcardData & { zoom?: number }).zoom ?? ZOOM_DEFAULT;
  const [localZoom, setLocalZoom] = useState<number>(persistedZoom);

  // Navigation State
  const [currentIndex, setCurrentIndex] = useState(0);

  const cards = useMemo(
    () => flashcardData.cards ?? [],
    [flashcardData.cards],
  );

  // Ensure index is valid
  useEffect(() => {
    if (currentIndex >= cards.length) {
      setCurrentIndex(0);
    }
  }, [cards.length, currentIndex]);

  useEffect(() => {
    setLocalZoom(persistedZoom);
  }, [persistedZoom]);

  const clampZoom = (z: number) =>
    Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, Math.round(z * 10) / 10));

  const applyZoom = useCallback(
    (next: number) => {
      const clamped = clampZoom(next);
      setLocalZoom(clamped);
      if (onUpdateItemData) {
        // Preferred path: compose with any in-flight `updateItemData` updaters
        // for this item so we never clobber pending Tiptap edits.
        onUpdateItemData(item.id, (prev) => ({
          ...(prev as FlashcardData),
          zoom: clamped,
        }));
        return;
      }
      // Fallback (legacy wiring): full `data` replacement via updateItem.
      onUpdateItem(item.id, {
        data: { ...(item.data as FlashcardData), zoom: clamped },
      });
    },
    [item.id, item.data, onUpdateItem, onUpdateItemData],
  );

  // Persist index change (optional debounce?)
  const handleIndexChange = useCallback((newIndex: number) => {
    // Don't persist on every click to avoid network spam, or do?
    // For now just local state is smooth, maybe updating item is fine.
    // Let's keep it local for now, prop update on unmount?
    setCurrentIndex(newIndex);
  }, []);

  const currentCard = useMemo((): FlashcardItem => {
    if (cards.length === 0) {
      return EMPTY_FLASHCARD_PLACEHOLDER;
    }
    const safeIndex = Math.min(
      Math.max(0, currentIndex),
      cards.length - 1,
    );
    return cards[safeIndex] ?? EMPTY_FLASHCARD_PLACEHOLDER;
  }, [cards, currentIndex]);

  // Flashcard flip animation duration (matches FlipCard component CSS)
  const FLIP_ANIMATION_DURATION = 600;

  // Tracking for flip debounce
  const lastFlipTimeRef = useRef<number>(0);

  // Track minimal local drag detection (same pattern as WorkspaceCard)
  const mouseDownRef = useRef<{ x: number; y: number } | null>(null);
  const hasMovedRef = useRef<boolean>(false);
  const listenersActiveRef = useRef<boolean>(false);
  const DRAG_THRESHOLD = 10; // pixels - movement beyond this prevents flip

  // OPTIMIZED: Store handlers in refs so they can be added/removed dynamically
  const handlersRef = useRef<{
    handleGlobalMouseMove: ((e: MouseEvent) => void) | null;
    handleGlobalMouseUp: (() => void) | null;
  }>({ handleGlobalMouseMove: null, handleGlobalMouseUp: null });

  // Cleanup listeners on unmount
  useEffect(() => {
    return () => {
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
      }
    };
  }, []);

  const handleDelete = useCallback(() => {
    setShowDeleteDialog(true);
  }, []);

  const confirmDelete = useCallback(() => {
    onDeleteItem(item.id);
    setShowDeleteDialog(false);
  }, [item.id, onDeleteItem]);

  const handleColorChange = useCallback(
    (color: ColorResult) => {
      onUpdateItem(item.id, { color: color.hex as CardColor });
      setIsColorPickerOpen(false);
    },
    [item.id, onUpdateItem],
  );

  const handleRename = useCallback(
    (newName: string) => {
      onUpdateItem(item.id, { name: newName });
      toast.success("Flashcard renamed");
    },
    [item.id, onUpdateItem],
  );

  // Helper function to hide tabs during flip animation
  const startFlipAnimation = useCallback(() => {
    setIsFlipping(true);
    setTimeout(() => setIsFlipping(false), FLIP_ANIMATION_DURATION);
  }, []);

  // Debounced flip logic
  const handleFlip = useCallback(() => {
    const now = Date.now();
    if (now - lastFlipTimeRef.current < 200) return;
    lastFlipTimeRef.current = now;
    setIsFlipped((prev) => !prev);
    startFlipAnimation();
  }, [startFlipAnimation]);

  // Handle mouse down - track initial position for drag detection
  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      // Don't track if clicking on interactive elements
      const target = e.target as HTMLElement;
      if (
        target.closest("button") ||
        target.closest(".flashcard-control-button") ||
        target.closest('[role="menuitem"]')
      ) {
        return;
      }

      // Check if clicking inside a text selection area
      const selection = window.getSelection();
      if (selection && selection.toString().length > 0) {
        e.stopPropagation();
        return;
      }

      mouseDownRef.current = { x: e.clientX, y: e.clientY };
      hasMovedRef.current = false;

      // Only add global listeners when mouseDown occurs
      if (!listenersActiveRef.current) {
        const handleGlobalMouseMove = (e: MouseEvent) => {
          if (!mouseDownRef.current) return;

          // Calculate movement delta
          const deltaX = Math.abs(e.clientX - mouseDownRef.current.x);
          const deltaY = Math.abs(e.clientY - mouseDownRef.current.y);

          if (hasMovedRef.current) {
            return;
          }

          // Check if user is selecting text
          const selection = window.getSelection();
          if (selection && selection.toString().length > 0) {
            mouseDownRef.current = null;
            hasMovedRef.current = false;
            return;
          }

          // Check if movement exceeds threshold (drag detected)
          if (deltaX > DRAG_THRESHOLD || deltaY > DRAG_THRESHOLD) {
            hasMovedRef.current = true;
          }
        };

        const handleGlobalMouseUp = () => {
          mouseDownRef.current = null;
          // Clean up listeners
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

  const handleClick = useCallback(
    (e: React.MouseEvent) => {
      // If unlocked, we are in "content mode" - allow text selection/scrolling, disable flip
      if (!isScrollLocked) return;

      // Also prevent flip if user was selecting text (fallback check)
      const selection = window.getSelection();
      if (selection && selection.toString().length > 0) return;

      // Shift+click toggles card selection
      if (e.shiftKey) {
        e.stopPropagation();
        onToggleSelection(item.id);
        return;
      }

      // Prevent flipping if user was dragging
      const wasDragging = hasMovedRef.current;
      hasMovedRef.current = false; // Reset immediately after checking

      if (wasDragging) {
        e.preventDefault();
        e.stopPropagation();
        return;
      }

      // Safe to flip - user clicked without dragging
      handleFlip();
    },
    [handleFlip, isScrollLocked, onToggleSelection, item.id],
  );

  // Navigation Handlers
  const goNext = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      const wasFlipped = isFlipped; // Check if we're currently on the back side
      setIsFlipped(false); // Reset flip
      // Only hide tabs if we were on the back side (will cause flip animation)
      if (wasFlipped) {
        startFlipAnimation();
      }
      handleIndexChange((currentIndex + 1) % cards.length);
    },
    [
      isFlipped,
      startFlipAnimation,
      handleIndexChange,
      currentIndex,
      cards.length,
    ],
  );

  const goPrev = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      const wasFlipped = isFlipped; // Check if we're currently on the back side
      setIsFlipped(false); // Reset flip
      // Only hide tabs if we were on the back side (will cause flip animation)
      if (wasFlipped) {
        startFlipAnimation();
      }
      handleIndexChange((currentIndex - 1 + cards.length) % cards.length);
    },
    [
      isFlipped,
      startFlipAnimation,
      handleIndexChange,
      currentIndex,
      cards.length,
    ],
  );

  // Calculate border styling to match WorkspaceCard
  const borderColor = isSelected
    ? "rgba(255, 255, 255, 0.8)"
    : item.color
      ? getCardAccentColor(item.color, resolvedTheme === "dark" ? 0.5 : 0.3)
      : "transparent";
  const borderWidth = isSelected ? "3px" : "1px";
  const selectedBoxShadow =
    isSelected && resolvedTheme !== "dark"
      ? "0 0 3px rgba(0, 0, 0, 0.8), 0 0 8px rgba(0, 0, 0, 0.5)"
      : undefined;
  const neutralControlBg =
    resolvedTheme === "dark" ? "rgba(255, 255, 255, 0.1)" : "rgba(0, 0, 0, 0.1)";
  const neutralControlHoverBg = "rgba(0, 0, 0, 0.5)";
  const selectedControlBg = isSelected
    ? "rgba(239, 68, 68, 0.3)"
    : neutralControlBg;
  const selectedControlHoverBg = isSelected
    ? "rgba(239, 68, 68, 0.5)"
    : neutralControlHoverBg;
  const getControlStyle = (backgroundColor: string) => ({
    backgroundColor,
    backdropFilter: "blur(8px)",
  });
  const createControlHoverHandlers = (baseColor: string, hoverColor: string) => ({
    onMouseEnter: (e: React.MouseEvent<HTMLButtonElement>) => {
      e.currentTarget.style.backgroundColor = hoverColor;
    },
    onMouseLeave: (e: React.MouseEvent<HTMLButtonElement>) => {
      e.currentTarget.style.backgroundColor = baseColor;
    },
  });

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <div
          id={`item-${item.id}`}
          className="group size-full relative rounded-md"
          style={{ ["--flashcard-zoom" as string]: String(localZoom) }}
          onMouseDown={handleMouseDown}
          onClick={handleClick}
        >
          {/* Floating Controls */}
          <div
            className={`absolute top-2 right-2 z-20 flex items-center gap-2 transition-opacity opacity-0 group-hover:opacity-100`}
          >
            {/* Scroll Lock/Unlock Button */}
            <button
              type="button"
              aria-label={
                isScrollLocked
                  ? "Click to unlock scroll"
                  : "Click to lock scroll"
              }
              title={
                isScrollLocked
                  ? "Click to unlock scroll"
                  : "Click to lock scroll"
              }
              className="flashcard-control-button inline-flex h-8 items-center justify-center gap-1.5 pl-2.5 pr-3 rounded-xl text-white/90 hover:text-white hover:scale-105 hover:shadow-lg transition-all duration-200 cursor-pointer"
              style={getControlStyle(neutralControlBg)}
              {...createControlHoverHandlers(
                neutralControlBg,
                neutralControlHoverBg,
              )}
              onMouseDown={(e) => {
                e.stopPropagation();
                e.preventDefault();
              }}
              onClick={(e) => {
                e.stopPropagation();
                toggleItemScrollLocked(item.id);
              }}
            >
              {isScrollLocked ? (
                <PiMouseScrollFill className="h-4 w-4 shrink-0" />
              ) : (
                <PiMouseScrollBold className="h-4 w-4 shrink-0" />
              )}
              <span className="text-xs font-medium">
                {isScrollLocked ? "Scroll" : "Lock"}
              </span>
            </button>

            <div
              className="flashcard-control-button inline-flex h-8 items-center overflow-hidden rounded-xl text-white/90"
              style={getControlStyle(neutralControlBg)}
            >
              <button
                type="button"
                aria-label="Zoom out"
                title="Zoom out"
                disabled={localZoom <= ZOOM_MIN + 1e-6}
                className="inline-flex h-8 w-8 items-center justify-center cursor-pointer hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent"
                onMouseDown={(e) => {
                  e.stopPropagation();
                  e.preventDefault();
                }}
                onClick={(e) => {
                  e.stopPropagation();
                  applyZoom(localZoom - ZOOM_STEP);
                }}
              >
                <ZoomOut className="h-4 w-4" />
              </button>
              <button
                type="button"
                aria-label={`Zoom: ${Math.round(localZoom * 100)}% — click to reset`}
                title={`Zoom: ${Math.round(localZoom * 100)}% — click to reset`}
                className="cursor-pointer select-none px-2 text-xs font-medium tabular-nums tracking-tight hover:text-white"
                onMouseDown={(e) => {
                  e.stopPropagation();
                  e.preventDefault();
                }}
                onClick={(e) => {
                  e.stopPropagation();
                  applyZoom(ZOOM_DEFAULT);
                }}
              >
                {Math.round(localZoom * 100)}%
              </button>
              <button
                type="button"
                aria-label="Zoom in"
                title="Zoom in"
                disabled={localZoom >= ZOOM_MAX - 1e-6}
                className="inline-flex h-8 w-8 items-center justify-center cursor-pointer hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent"
                onMouseDown={(e) => {
                  e.stopPropagation();
                  e.preventDefault();
                }}
                onClick={(e) => {
                  e.stopPropagation();
                  applyZoom(localZoom + ZOOM_STEP);
                }}
              >
                <ZoomIn className="h-4 w-4" />
              </button>
            </div>

            <button
              type="button"
              aria-label="Edit flashcard"
              title="Edit flashcard"
              className="flashcard-control-button inline-flex h-8 w-8 items-center justify-center rounded-xl text-white/90 hover:text-white hover:scale-110 hover:shadow-lg transition-all duration-200 cursor-pointer"
              style={getControlStyle(neutralControlBg)}
              {...createControlHoverHandlers(
                neutralControlBg,
                neutralControlHoverBg,
              )}
              onMouseDown={(e) => e.stopPropagation()}
              onClick={(e) => {
                e.stopPropagation();
                onOpenModal(item.id);
              }}
            >
              <Pencil className="h-4 w-4" />
            </button>

            <button
              type="button"
              aria-label={isSelected ? "Deselect card" : "Select card"}
              title={isSelected ? "Deselect card" : "Select card"}
              className="flashcard-control-button inline-flex h-8 w-8 items-center justify-center rounded-xl text-white/90 hover:text-white hover:scale-110 hover:shadow-lg transition-all duration-200 cursor-pointer"
              style={getControlStyle(selectedControlBg)}
              {...createControlHoverHandlers(
                selectedControlBg,
                selectedControlHoverBg,
              )}
              onMouseDown={(e) => e.stopPropagation()}
              onClick={(e) => {
                e.stopPropagation();
                onToggleSelection(item.id);
              }}
            >
              {isSelected ? (
                <X className="h-4 w-4" />
              ) : (
                <CheckCircle2 className="h-4 w-4" />
              )}
            </button>

            <DropdownMenu>
              <DropdownMenuTrigger asChild className="cursor-pointer">
                <button
                  type="button"
                  aria-label="Card settings"
                  title="Card settings"
                  className="flashcard-control-button inline-flex h-8 w-8 items-center justify-center rounded-xl text-white/90 hover:text-white hover:scale-110 hover:shadow-lg transition-all duration-200 cursor-pointer"
                  style={getControlStyle(neutralControlBg)}
                  {...createControlHoverHandlers(
                    neutralControlBg,
                    neutralControlHoverBg,
                  )}
                  onMouseDown={(e) => e.stopPropagation()}
                  onClick={(e) => e.stopPropagation()}
                >
                  <MoreVertical className="h-4 w-4" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                align="end"
                className="w-48"
                onClick={(e) => e.stopPropagation()}
              >
                <DropdownMenuItem onSelect={() => setShowRenameDialog(true)}>
                  <Pencil className="mr-2 h-4 w-4" />
                  <span>Rename</span>
                </DropdownMenuItem>
                {onMoveItem && (
                  <>
                    <DropdownMenuItem onSelect={() => setShowMoveDialog(true)}>
                      <FolderInput className="mr-2 h-4 w-4" />
                      <span>Move to</span>
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                  </>
                )}
                <DropdownMenuItem onSelect={() => onOpenModal(item.id)}>
                  <Pencil className="mr-2 h-4 w-4" />
                  <span>Edit</span>
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => setIsColorPickerOpen(true)}>
                  <Palette className="mr-2 h-4 w-4" />
                  <span>Change Color</span>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={handleDelete}
                  className="text-destructive focus:text-destructive"
                >
                  <Trash2 className="mr-2 h-4 w-4" />
                  <span>Delete</span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          <Dialog open={isColorPickerOpen} onOpenChange={setIsColorPickerOpen}>
            <DialogContent
              className="w-auto max-w-fit p-6"
              onClick={(e) => e.stopPropagation()}
              onMouseDown={(e) => e.stopPropagation()}
            >
              <DialogHeader>
                <DialogTitle>Choose a Color</DialogTitle>
              </DialogHeader>
              <div
                className="flex justify-center color-picker-wrapper"
                onClick={(e) => e.stopPropagation()}
                onMouseDown={(e) => e.stopPropagation()}
              >
                <SwatchesPicker
                  color={item.color || "#3B82F6"}
                  colors={SWATCHES_COLOR_GROUPS}
                  onChangeComplete={handleColorChange}
                />
              </div>
            </DialogContent>
          </Dialog>

          {/* Navigation Controls - Only show if Multiple Cards */}
          {cards.length > 1 && (
            <>
              {/* Prev Button */}
              <button
                className="absolute left-2 top-1/2 -translate-y-1/2 z-20 p-2 rounded-full bg-black/20 hover:bg-black/40 text-white/50 hover:text-white transition-all opacity-0 group-hover:opacity-100 backdrop-blur-sm flashcard-control-button cursor-pointer"
                onClick={goPrev}
                onMouseDown={(e) => e.stopPropagation()}
                title="Previous Card"
              >
                <ChevronLeft className="w-6 h-6" />
              </button>
              {/* Next Button */}
              <button
                className="absolute right-2 top-1/2 -translate-y-1/2 z-20 p-2 rounded-full bg-black/20 hover:bg-black/40 text-white/50 hover:text-white transition-all opacity-0 group-hover:opacity-100 backdrop-blur-sm flashcard-control-button cursor-pointer"
                onClick={goNext}
                onMouseDown={(e) => e.stopPropagation()}
                title="Next Card"
              >
                <ChevronRight className="w-6 h-6" />
              </button>

              {/* Card Counter */}
              <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-20 px-3 py-1 rounded-full bg-black/20 text-white/70 text-xs font-medium backdrop-blur-sm pointer-events-none transition-opacity opacity-0 group-hover:opacity-100">
                {currentIndex + 1} / {cards.length}
              </div>
            </>
          )}

          {/* Flashcard Stack Container */}
          <div className="relative size-full flex flex-col">
            {/* Main Flashcard - takes up space minus the tabs */}
            <div className="relative flex-1" style={{ marginBottom: "12px" }}>
              {/* Check for template-created items awaiting generation */}
              {item.name === "Update me" &&
              (!flashcardData.cards || flashcardData.cards.length === 0) ? (
                // Generating skeleton for template-created flashcards
                <div
                  className="size-full rounded-md flex flex-col items-center justify-center p-6 text-center"
                  style={{
                    backgroundColor: item.color
                      ? getCardColorCSS(item.color as CardColor, 0.25)
                      : "var(--card)",
                    border: `${borderWidth} solid ${borderColor}`,
                    boxShadow: selectedBoxShadow,
                  }}
                >
                  <div className="flex items-center gap-2 text-white/60 text-sm">
                    <div className="w-2 h-2 bg-blue-400 rounded-full animate-pulse"></div>
                    Generating flashcards...
                  </div>
                </div>
              ) : (
                <FlipCard
                  front={
                    <FlashcardSideMarkdownView
                      markdown={currentCard.front}
                      isScrollLocked={isScrollLocked}
                      className="p-4"
                    />
                  }
                  back={
                    <FlashcardSideMarkdownView
                      markdown={currentCard.back}
                      isScrollLocked={isScrollLocked}
                      className="p-4"
                    />
                  }
                  color={item.color}
                  isFlipped={isFlipped}
                  borderColor={borderColor}
                  borderWidth={borderWidth}
                  selectedBoxShadow={selectedBoxShadow}
                />
              )}
              {/* Stack Tab 1 (directly below main card) - hidden during flip */}
              <div
                className="absolute left-1 right-1 rounded-b-md transition-opacity duration-200"
                style={{
                  top: "100%",
                  height: "6px",
                  backgroundColor: item.color
                    ? getCardColorCSS(item.color as CardColor, 0.32)
                    : "var(--card)",
                  borderLeft: "none",
                  borderRight: "none",
                  borderBottom: "none",
                  borderTop: "none",
                  opacity: isFlipping ? 0 : 1,
                }}
              />
              {/* Stack Tab 2 (bottom-most, slightly narrower) - hidden during flip */}
              <div
                className="absolute left-2 right-2 rounded-b-md transition-opacity duration-200"
                style={{
                  top: "calc(100% + 4px)",
                  height: "6px",
                  backgroundColor: item.color
                    ? getCardColorCSS(item.color as CardColor, 0.15)
                    : "var(--card)",
                  borderLeft: "none",
                  borderRight: "none",
                  borderBottom: "none",
                  borderTop: "none",
                  opacity: isFlipping ? 0 : 1,
                }}
              />
            </div>
          </div>

          <AlertDialog
            open={showDeleteDialog}
            onOpenChange={setShowDeleteDialog}
          >
            <AlertDialogContent onClick={(e) => e.stopPropagation()}>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete Flashcard</AlertDialogTitle>
                <AlertDialogDescription>
                  Are you sure you want to delete "
                  {item.name || "this flashcard"}"? You can restore from version
                  history if needed.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={confirmDelete}>
                  Delete
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>

          {/* Rename Dialog */}
          <RenameDialog
            open={showRenameDialog}
            onOpenChange={setShowRenameDialog}
            currentName={item.name || "Untitled"}
            itemType={item.type}
            onRename={handleRename}
          />

          {/* Move to Dialog */}
          {onMoveItem && allItems && workspaceName && (
            <MoveToDialog
              open={showMoveDialog}
              onOpenChange={setShowMoveDialog}
              item={item}
              allItems={allItems}
              workspaceName={workspaceName}
              workspaceIcon={workspaceIcon}
              workspaceColor={workspaceColor}
              onMove={(folderId) => {
                onMoveItem(item.id, folderId);
                toast.success("Item moved");
              }}
            />
          )}
        </div>
      </ContextMenuTrigger>

      {/* Right-Click Context Menu */}
      <ContextMenuContent className="w-48">
        <ContextMenuItem onSelect={() => setShowRenameDialog(true)}>
          <Pencil className="mr-2 h-4 w-4" />
          <span>Rename</span>
        </ContextMenuItem>
        {onMoveItem && (
          <>
            <ContextMenuItem onSelect={() => setShowMoveDialog(true)}>
              <FolderInput className="mr-2 h-4 w-4" />
              <span>Move to</span>
            </ContextMenuItem>
            <ContextMenuSeparator />
          </>
        )}
        <ContextMenuItem onSelect={() => onOpenModal(item.id)}>
          <Pencil className="mr-2 h-4 w-4" />
          <span>Edit</span>
        </ContextMenuItem>
        <ContextMenuItem onSelect={() => setIsColorPickerOpen(true)}>
          <Palette className="mr-2 h-4 w-4" />
          <span>Change Color</span>
        </ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem
          onSelect={handleDelete}
          className="text-destructive focus:text-destructive"
        >
          <Trash2 className="mr-2 h-4 w-4" />
          <span>Delete</span>
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
}

export default FlashcardWorkspaceCard;
