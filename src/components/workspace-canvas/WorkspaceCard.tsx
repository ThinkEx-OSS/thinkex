import { QuizContent } from "./QuizContent";
import { ImageCardContent } from "./ImageCardContent";
import {
  MoreVertical,
  Trash2,
  Palette,
  CheckCircle2,
  FolderInput,
  Copy,
  X,
  Pencil,
  Loader2,
  File,
  FileText,
  Brain,
  Mic,
  Globe,
} from "lucide-react";
import { PiMouseScrollFill, PiMouseScrollBold } from "react-icons/pi";
import { useCallback, useState, memo, useRef, useEffect } from "react";
import { useTheme } from "next-themes";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import ItemHeader from "@/components/workspace-canvas/ItemHeader";
import {
  getCardColorCSS,
  getCardAccentColor,
  getCardColorWithBlackMix,
  getIconColorFromCardColorWithOpacity,
  getLighterCardColor,
  SWATCHES_COLOR_GROUPS,
  type CardColor,
} from "@/lib/workspace-state/colors";
import type {
  Item,
  PdfData,
  FlashcardData,
  YouTubeData,
  WebsiteData,
  DocumentData,
} from "@/lib/workspace-state/types";
import { SwatchesPicker, ColorResult } from "react-color";
import { AudioCardContent } from "./AudioCardContent";
import LazyAppPdfViewer from "@/components/pdf/LazyAppPdfViewer";
import { StreamdownMarkdown } from "@/components/ui/streamdown-markdown";
import { Skeleton } from "@/components/ui/skeleton";
import { useUIStore, selectItemScrollLocked } from "@/lib/stores/ui-store";
import { Flashcard } from "react-quizlet-flashcard";
import "react-quizlet-flashcard/dist/index.css";
import { useElementSize } from "@/hooks/use-element-size";
import {
  extractYouTubeVideoId,
  extractYouTubePlaylistId,
} from "@/lib/utils/youtube-url";
import { YouTubeCardContent } from "./YouTubeCardContent";
import { getLayoutForBreakpoint } from "@/lib/workspace-state/grid-layout-helpers";
import { SourcesDisplay } from "./SourcesDisplay";

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
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import MoveToDialog from "@/components/modals/MoveToDialog";
import RenameDialog from "@/components/modals/RenameDialog";
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
  const articleRef = useRef<HTMLElement>(null);

  // Measure card size to determine if we should show preview
  const { width: cardWidth, height: cardHeight } = useElementSize(articleRef);

  // Show preview only if card is wide AND tall enough for meaningful content
  // Width: ~320px (roughly when w > 1 in grid); Height: ~180px minimum
  // OPTIMIZED: Treat undefined (initial) as sufficient to prevent flicker on mount
  const meetsWidth = cardWidth === undefined || cardWidth > 320;
  const meetsHeight = cardHeight === undefined || cardHeight > 180;
  const shouldShowPreview = meetsWidth && meetsHeight;

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
    const md = (item.data as DocumentData).markdown?.trim() ?? "";
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

      // Default: open in focus mode (maximized modal)
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

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <div className="group size-full">
          <article
            ref={articleRef}
            id={`item-${item.id}`}
            data-youtube-card
            data-item-type={item.type}
            data-has-preview={shouldShowPreview}
            className={`relative rounded-md scroll-mt-4 size-full flex flex-col overflow-hidden transition-all duration-200 cursor-pointer ${
              item.type === "youtube" ||
              item.type === "image" ||
              (item.type === "pdf" && shouldShowPreview)
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
                  : item.type === "youtube" ||
                      item.type === "image" ||
                      (item.type === "pdf" && shouldShowPreview)
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
            {/* Floating Controls Container */}
            <div
              className={`absolute top-3 right-3 z-20 flex items-center gap-2 ${isEditingTitle ? "" : "opacity-0 group-hover:opacity-100"}`}
            >
                {/* Scroll Lock/Unlock Button - Hidden for YouTube, image, quiz, and narrow document/PDF cards */}
                {item.type !== "youtube" &&
                  item.type !== "image" &&
                  item.type !== "quiz" &&
                  !(
                    item.type === "document" &&
                    (!shouldShowPreview || documentAwaitingGeneration)
                  ) &&
                  !(item.type === "pdf" && !shouldShowPreview) &&
                  !(item.type === "audio" && !shouldShowPreview) && (
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
                      className="inline-flex h-8 items-center justify-center gap-1.5 pl-2.5 pr-3 rounded-xl text-white/90 hover:text-white hover:scale-105 hover:shadow-lg transition-all duration-200 cursor-pointer"
                      style={{
                        backgroundColor:
                          item.type === "pdf" && shouldShowPreview
                            ? "rgba(0, 0, 0, 0.6)"
                            : resolvedTheme === "dark"
                              ? "rgba(255, 255, 255, 0.1)"
                              : "rgba(0, 0, 0, 0.2)",
                        backdropFilter: "blur(8px)",
                      }}
                      onMouseDown={(e) => {
                        e.stopPropagation();
                        e.preventDefault();
                      }}
                      onMouseEnter={(e) => {
                        (
                          e.currentTarget as HTMLButtonElement
                        ).style.backgroundColor =
                          item.type === "pdf" && shouldShowPreview
                            ? "rgba(0, 0, 0, 0.8)"
                            : resolvedTheme === "dark"
                              ? "rgba(0, 0, 0, 0.5)"
                              : "rgba(0, 0, 0, 0.3)";
                      }}
                      onMouseLeave={(e) => {
                        (
                          e.currentTarget as HTMLButtonElement
                        ).style.backgroundColor =
                          item.type === "pdf" && shouldShowPreview
                            ? "rgba(0, 0, 0, 0.6)"
                            : resolvedTheme === "dark"
                              ? "rgba(255, 255, 255, 0.1)"
                              : "rgba(0, 0, 0, 0.2)";
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
                      <span
                        className={cn(
                          "text-xs font-medium",
                          resolvedTheme === "dark"
                            ? "text-white/90"
                            : "text-white/80",
                        )}
                      >
                        {isScrollLocked ? "Scroll" : "Lock"}
                      </span>
                    </button>
                  )}

                {/* Selection Button */}
                <button
                  type="button"
                  aria-label={isSelected ? "Deselect card" : "Select card"}
                  title={isSelected ? "Deselect card" : "Select card"}
                  className="inline-flex h-8 w-8 items-center justify-center rounded-xl text-white/90 hover:text-white hover:scale-110 hover:shadow-lg transition-all duration-200 cursor-pointer"
                  style={{
                    backgroundColor: isSelected
                      ? item.type === "pdf" && shouldShowPreview
                        ? "rgba(239, 68, 68, 0.4)"
                        : "rgba(239, 68, 68, 0.3)"
                      : item.type === "pdf" && shouldShowPreview
                        ? "rgba(0, 0, 0, 0.6)"
                        : resolvedTheme === "dark"
                          ? "rgba(255, 255, 255, 0.1)"
                          : "rgba(0, 0, 0, 0.2)",
                    backdropFilter: "blur(8px)",
                  }}
                  onMouseDown={(e) => {
                    e.stopPropagation();
                    e.preventDefault();
                  }}
                  onMouseEnter={(e) => {
                    (
                      e.currentTarget as HTMLButtonElement
                    ).style.backgroundColor = isSelected
                      ? item.type === "pdf" && shouldShowPreview
                        ? "rgba(239, 68, 68, 0.6)"
                        : "rgba(239, 68, 68, 0.5)"
                      : item.type === "pdf" && shouldShowPreview
                        ? "rgba(0, 0, 0, 0.8)"
                        : resolvedTheme === "dark"
                          ? "rgba(0, 0, 0, 0.5)"
                          : "rgba(0, 0, 0, 0.3)";
                  }}
                  onMouseLeave={(e) => {
                    (
                      e.currentTarget as HTMLButtonElement
                    ).style.backgroundColor = isSelected
                      ? item.type === "pdf" && shouldShowPreview
                        ? "rgba(239, 68, 68, 0.4)"
                        : "rgba(239, 68, 68, 0.3)"
                      : item.type === "pdf" && shouldShowPreview
                        ? "rgba(0, 0, 0, 0.6)"
                        : resolvedTheme === "dark"
                          ? "rgba(255, 255, 255, 0.1)"
                          : "rgba(0, 0, 0, 0.2)";
                  }}
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

                {/* Options Menu */}
                <DropdownMenu>
                  <DropdownMenuTrigger asChild className="cursor-pointer">
                    <button
                      type="button"
                      aria-label="Card settings"
                      title="Card settings"
                      className="inline-flex h-8 w-8 items-center justify-center rounded-xl text-white/90 hover:text-white hover:scale-110 hover:shadow-lg transition-all duration-200 cursor-pointer"
                      style={{
                        backgroundColor:
                          item.type === "pdf" && shouldShowPreview
                            ? "rgba(0, 0, 0, 0.6)"
                            : resolvedTheme === "dark"
                              ? "rgba(255, 255, 255, 0.1)"
                              : "rgba(0, 0, 0, 0.2)",
                        backdropFilter: "blur(8px)",
                      }}
                      onMouseDown={(e) => {
                        e.stopPropagation();
                        e.preventDefault();
                      }}
                      onMouseEnter={(e) => {
                        (
                          e.currentTarget as HTMLButtonElement
                        ).style.backgroundColor =
                          item.type === "pdf" && shouldShowPreview
                            ? "rgba(0, 0, 0, 0.8)"
                            : resolvedTheme === "dark"
                              ? "rgba(0, 0, 0, 0.5)"
                              : "rgba(0, 0, 0, 0.3)";
                      }}
                      onMouseLeave={(e) => {
                        (
                          e.currentTarget as HTMLButtonElement
                        ).style.backgroundColor =
                          item.type === "pdf" && shouldShowPreview
                            ? "rgba(0, 0, 0, 0.6)"
                            : resolvedTheme === "dark"
                              ? "rgba(255, 255, 255, 0.1)"
                              : "rgba(0, 0, 0, 0.2)";
                      }}
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
                    <DropdownMenuItem
                      onSelect={() => setShowRenameDialog(true)}
                    >
                      <Pencil className="mr-2 h-4 w-4" />
                      <span>Rename</span>
                    </DropdownMenuItem>
                    {onMoveItem && (
                      <>
                        <DropdownMenuItem
                          onSelect={() => setShowMoveDialog(true)}
                        >
                          <FolderInput className="mr-2 h-4 w-4" />
                          <span>Move to</span>
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                      </>
                    )}
                    {item.type === "document" && (
                      <>
                        <DropdownMenuItem onSelect={handleCopyMarkdown}>
                          <Copy className="mr-2 h-4 w-4" />
                          <span>Copy Markdown</span>
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                      </>
                    )}
                    <DropdownMenuItem
                      onSelect={() => setIsColorPickerOpen(true)}
                    >
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

            {/* Type badge - rect in bottom-left corner (when card is small) */}
            {(item.type === "pdf" ||
              item.type === "quiz" ||
              item.type === "audio" ||
              item.type === "website" ||
              item.type === "document") &&
              !shouldShowPreview && (
                <span
                  className="absolute left-0 bottom-0 z-0 flex items-center gap-1.5 pl-2.5 pr-1.5 py-2 rounded-tr-md rounded-bl-md text-xs font-semibold uppercase tracking-wider w-max pointer-events-none"
                  style={{
                    backgroundColor: getIconColorFromCardColorWithOpacity(
                      item.color,
                      resolvedTheme === "dark",
                      resolvedTheme === "dark" ? 0.3 : 0.55,
                    ),
                    color:
                      resolvedTheme === "dark"
                        ? getLighterCardColor(item.color, true, 0)
                        : getCardColorWithBlackMix(item.color, 0.18),
                  }}
                >
                  {item.type === "pdf" ? (
                    (item.data as PdfData)?.ocrStatus === "processing" ? (
                      <>
                        <Loader2 className="h-5 w-5 shrink-0 animate-spin" />
                        <span>Reading...</span>
                      </>
                    ) : (
                      <>
                        <File className="h-5 w-5 shrink-0" />
                        <span>PDF</span>
                      </>
                    )
                  ) : item.type === "quiz" ? (
                    <>
                      <Brain className="h-5 w-5 shrink-0" />
                      <span>Quiz</span>
                    </>
                  ) : item.type === "website" ? (
                    (() => {
                      const websiteData = item.data as WebsiteData;
                      const favicon = websiteData.favicon;
                      const fallbackId = `fallback-${item.id}`;
                      const faviconId = `favicon-${item.id}`;
                      return (
                        <>
                          {favicon && (
                            /* eslint-disable-next-line @next/next/no-img-element */
                            <img
                              id={faviconId}
                              src={favicon}
                              alt=""
                              className="h-5 w-5 shrink-0 rounded"
                              onLoad={(e) => {
                                // Hide default globe icons (they stay 16x16 even with sz=64)
                                if (e.currentTarget.naturalHeight === 16) {
                                  e.currentTarget.style.display = "none";
                                  const fallback =
                                    document.getElementById(fallbackId);
                                  if (fallback) fallback.style.display = "flex";
                                }
                              }}
                              onError={(e) => {
                                e.currentTarget.style.display = "none";
                                const fallback =
                                  document.getElementById(fallbackId);
                                if (fallback) fallback.style.display = "flex";
                              }}
                            />
                          )}
                          <div
                            id={fallbackId}
                            className="h-5 w-5 shrink-0 flex items-center justify-center"
                            style={{ display: favicon ? "none" : "flex" }}
                          >
                            <Globe className="h-5 w-5 shrink-0" />
                          </div>
                          <span>Website</span>
                        </>
                      );
                    })()
                  ) : item.type === "document" ? (
                    <>
                      <FileText className="h-5 w-5 shrink-0" />
                      <span>DOC</span>
                    </>
                  ) : (
                    <>
                      <Mic className="h-5 w-5 shrink-0" />
                      <span>Recording</span>
                    </>
                  )}
                </span>
              )}

            {/* Color Picker Dialog */}
            <Dialog
              open={isColorPickerOpen}
              onOpenChange={setIsColorPickerOpen}
            >
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

            <div
              className={
                (item.type === "pdf" ||
                  item.type === "quiz" ||
                  item.type === "audio" ||
                  item.type === "document") &&
                !shouldShowPreview
                  ? "flex-1 flex flex-col relative"
                  : "flex-shrink-0"
              }
            >
              {/* Hide header for template items awaiting generation */}
              {item.type !== "youtube" &&
                item.type !== "image" &&
                !(item.type === "pdf" && shouldShowPreview) &&
                item.name !== "Update me" && (
                  <div className="relative z-10">
                    <ItemHeader
                      id={item.id}
                      name={item.name}
                      subtitle={item.subtitle}
                      description={""}
                      onNameChange={handleNameChange}
                      onNameCommit={handleNameCommit}
                      onSubtitleChange={handleSubtitleChange}
                      readOnly={
                        (item.type === "pdf" ||
                          item.type === "quiz" ||
                          item.type === "audio" ||
                          item.type === "document") &&
                        !shouldShowPreview
                      }
                      noMargin={true}
                      onTitleFocus={handleTitleFocus}
                      onTitleBlur={handleTitleBlur}
                      allowWrap={
                        (item.type === "pdf" ||
                          item.type === "quiz" ||
                          item.type === "audio" ||
                          item.type === "document") &&
                        !shouldShowPreview
                      }
                    />

                    {/* Sources Section - only shown when card is wide */}
                    {item.type === "document" &&
                      shouldShowPreview &&
                      (item.data as DocumentData).sources &&
                      (item.data as DocumentData).sources!.length > 0 && (
                        <div className="px-1 mt-2 mb-1">
                          <SourcesDisplay
                            sources={(item.data as DocumentData).sources!}
                          />
                        </div>
                      )}
                  </div>
                )}
            </div>

            {/* PDF Content - render embedded PDF viewer if card is wide enough */}
            {item.type === "pdf" &&
              shouldShowPreview &&
              (() => {
                const pdfData = item.data as PdfData;
                const isOcrProcessing = pdfData?.ocrStatus === "processing";
                const pdfPreviewUrl = pdfData.fileUrl;

                return (
                  <div
                    className={`flex-1 min-h-0 relative ${isScrollLocked ? "overflow-hidden" : "overflow-auto"}`}
                    style={{ pointerEvents: isScrollLocked ? "none" : "auto" }}
                  >
                    {isScrollLocked ? null : (
                      <LazyAppPdfViewer
                        pdfSrc={pdfPreviewUrl}
                        itemId={item.id}
                        itemName={item.name}
                      />
                    )}
                    {/* OCR processing indicator overlay */}
                    {isOcrProcessing && pdfPreviewUrl && (
                      <div
                        className="absolute bottom-0 left-0 right-0 flex items-center justify-center gap-2 py-2 px-3 bg-primary/90 text-primary-foreground text-xs font-medium"
                        style={{ color: "inherit" }}
                      >
                        <Loader2 className="h-3.5 w-3.5 animate-spin shrink-0" />
                        Reading...
                      </div>
                    )}
                  </div>
                );
              })()}

            {/* Quiz Content - render interactive quiz (clicks on non-interactive areas open modal via parent) */}
            {item.type === "quiz" && shouldShowPreview && (
              <div className="flex-1 min-h-0">
                <QuizContent
                  item={item}
                  onUpdateData={(updater) =>
                    onUpdateItem(item.id, {
                      data: updater(item.data) as Item["data"],
                    })
                  }
                  isScrollLocked={isScrollLocked}
                />
              </div>
            )}

            {/* Flashcard Content - render interactive flashcard */}
            {item.type === "flashcard" &&
              (() => {
                const flashcardData = item.data as FlashcardData;
                const card0 = flashcardData.cards?.[0];
                const frontText = card0?.front?.trim()
                  ? card0.front
                  : "Click to add front content";
                const backText = card0?.back?.trim()
                  ? card0.back
                  : "Click to add back content";

                return (
                  <div
                    className="flex-1 flex items-center justify-center p-6 min-h-0"
                    onClick={(e) => {
                      // Stop propagation so clicking the flashcard itself doesn't open the modal
                      // Only clicking outside the flashcard (on the card background) opens modal
                      e.stopPropagation();
                    }}
                  >
                    <div className="w-full h-full max-w-md max-h-[400px] flex items-center justify-center">
                      <Flashcard
                        front={{
                          html: (
                            <div
                              className="p-8 flex items-center justify-center h-full text-center text-lg font-medium overflow-y-auto"
                              style={{
                                color:
                                  resolvedTheme === "dark"
                                    ? "#f3f4f6"
                                    : "#111827",
                              }}
                            >
                              <div className="w-full text-left">
                                <StreamdownMarkdown className="text-lg leading-snug">
                                  {frontText}
                                </StreamdownMarkdown>
                              </div>
                            </div>
                          ),
                        }}
                        back={{
                          html: (
                            <div
                              className="p-8 flex items-center justify-center h-full text-center text-lg font-medium overflow-y-auto"
                              style={{
                                color:
                                  resolvedTheme === "dark"
                                    ? "#f3f4f6"
                                    : "#111827",
                              }}
                            >
                              <div className="w-full text-left">
                                <StreamdownMarkdown className="text-lg leading-snug">
                                  {backText}
                                </StreamdownMarkdown>
                              </div>
                            </div>
                          ),
                        }}
                      />
                    </div>
                  </div>
                );
              })()}

            {/* YouTube Content - render YouTube embed */}
            {item.type === "youtube" &&
              (() => {
                const youtubeData = item.data as YouTubeData;
                const hasValidUrl =
                  extractYouTubeVideoId(youtubeData.url) !== null ||
                  extractYouTubePlaylistId(youtubeData.url) !== null;

                if (!hasValidUrl) {
                  // Invalid URL - show error state
                  return (
                    <div className="p-0 min-h-0">
                      <div className="flex flex-col items-center justify-center gap-3 text-center h-full p-4">
                        <div className="rounded-lg p-4 bg-red-500/10 border border-red-500/20 flex items-center justify-center">
                          <span
                            className={cn(
                              "font-medium",
                              resolvedTheme === "dark"
                                ? "text-red-400"
                                : "text-red-600",
                            )}
                          >
                            Invalid YouTube URL
                          </span>
                        </div>
                        <p
                          className={cn(
                            "text-xs",
                            resolvedTheme === "dark"
                              ? "text-muted-foreground/70"
                              : "text-muted-foreground/50",
                          )}
                        >
                          Please check the URL and try again
                        </p>
                      </div>
                    </div>
                  );
                }

                return <YouTubeCardContent item={item} />;
              })()}

            {/* Image Content - render frameless image */}
            {item.type === "image" && (
              <ImageCardContent item={item} />
            )}

            {/* Audio Content - render audio player and transcript */}
            {item.type === "audio" && shouldShowPreview && (
              <div className="flex-1 min-h-0 overflow-hidden">
                <AudioCardContent
                  item={item}
                  isCompact
                  isScrollLocked={isScrollLocked}
                />
              </div>
            )}

            {item.type === "document" &&
              shouldShowPreview &&
              (documentAwaitingGeneration ? (
                <div className="flex-1 min-h-0 p-4 flex flex-col gap-3">
                  <div className="flex items-center gap-2 text-muted-foreground text-sm">
                    <div className="w-2 h-2 bg-blue-400 rounded-full animate-pulse" />
                    Generating document...
                  </div>
                  <Skeleton className="h-4 w-full bg-foreground/10" />
                  <Skeleton className="h-4 w-3/4 bg-foreground/10" />
                  <Skeleton className="h-4 w-5/6 bg-foreground/10" />
                </div>
              ) : (
                <div
                  className={`flex-1 min-h-0 px-3 pb-3 overflow-y-scroll ${isScrollLocked ? "pointer-events-none" : ""}`}
                  style={{
                    pointerEvents: isScrollLocked ? "none" : "auto",
                    scrollbarGutter: "stable",
                  }}
                >
                  <StreamdownMarkdown className="text-sm leading-6">
                    {documentPreviewText}
                  </StreamdownMarkdown>
                </div>
              ))}
          </article>

          {/* Delete Confirmation Dialog */}
          <AlertDialog
            open={showDeleteDialog}
            onOpenChange={setShowDeleteDialog}
          >
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete Card</AlertDialogTitle>
                <AlertDialogDescription>
                  Are you sure you want to delete &quot;
                  {item.name || "this card"}&quot;? You can restore from version
                  history if needed.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  onClick={handleDeleteConfirm}
                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                >
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
          {onMoveItem && (
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
        {item.type === "document" && (
          <>
            <ContextMenuItem onSelect={handleCopyMarkdown}>
              <Copy className="mr-2 h-4 w-4" />
              <span>Copy Markdown</span>
            </ContextMenuItem>
            <ContextMenuSeparator />
          </>
        )}
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

    // Compare layout (use lg breakpoint for comparison)
    const prevLayout = getLayoutForBreakpoint(prevProps.item, "lg");
    const nextLayout = getLayoutForBreakpoint(nextProps.item, "lg");
    if (prevLayout?.x !== nextLayout?.x) return false;
    if (prevLayout?.y !== nextLayout?.y) return false;
    if (prevLayout?.w !== nextLayout?.w) return false;
    if (prevLayout?.h !== nextLayout?.h) return false;

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
