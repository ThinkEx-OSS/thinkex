import { MoreVertical, Trash2, Palette, CheckCircle2, FolderInput, FileText, Copy, X, Pencil } from "lucide-react";
import { PiMouseScrollFill, PiMouseScrollBold } from "react-icons/pi";
import { useCallback, useState, memo, useRef, useEffect, useMemo } from "react";
import { toast } from "sonner";
import { usePostHog } from 'posthog-js/react';
import ItemHeader from "@/components/workspace-canvas/ItemHeader";
import { getCardColorCSS, getCardAccentColor, getDistinctCardColor, SWATCHES_COLOR_GROUPS, type CardColor } from "@/lib/workspace-state/colors";
import type { Item, NoteData, PdfData, FlashcardData, YouTubeData } from "@/lib/workspace-state/types";
import { SwatchesPicker, ColorResult } from "react-color";
import { plainTextToBlocks, type Block } from "@/components/editor/BlockNoteEditor";
import { serializeBlockNote } from "@/lib/utils/serialize-blocknote";
import { BlockNotePreview } from "@/components/editor/BlockNotePreview";
import { DeepResearchCardContent } from "./DeepResearchCardContent";
import LazyAppPdfViewer from "@/components/pdf/LazyAppPdfViewer";
import { LightweightPdfPreview } from "@/components/pdf/LightweightPdfPreview";

import { Skeleton } from "@/components/ui/skeleton";
import { useUIStore, selectItemScrollLocked } from "@/lib/stores/ui-store";
import { Flashcard } from "react-quizlet-flashcard";
import "react-quizlet-flashcard/dist/index.css";
import ReactMarkdown from "react-markdown";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import { useCardContextProvider } from "@/hooks/ai/use-card-context-provider";
import { useElementWidth } from "@/hooks/use-element-width";
import { useIsVisible } from "@/hooks/use-is-visible";
import { getYouTubeEmbedUrl } from "@/lib/utils/youtube-url";
import { YouTubeCardContent } from "./YouTubeCardContent";
import { getLayoutForBreakpoint } from "@/lib/workspace-state/grid-layout-helpers";
import { ItemOpenPrompt } from "@/components/workspace-canvas/ItemOpenPrompt";
import { createPortal } from "react-dom";
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
  existingColors: CardColor[];
  // NOTE: isSelected is now subscribed directly from the store to prevent
  // full grid re-renders when selection changes
  onMoveItem?: (itemId: string, folderId: string | null) => void; // Callback to move item to folder
}

/**
 * Component to handle lazy loading of note content
 * Shows skeleton immediately, then loads preview asynchronously
 * OPTIMIZED: Skips preview updates when card is being edited in modal
 */
function WorkspaceCardNoteContent({ item, isScrollLocked }: { item: Item, isScrollLocked: boolean }) {
  const noteData = item.data as NoteData;
  const hasBlockContent = noteData.blockContent && Array.isArray(noteData.blockContent) && (noteData.blockContent as Block[]).length > 0;


  // Use state for scroll container so re-render is triggered when element mounts
  // This fixes the issue where virtualizer initializes with null scroll element
  const [scrollContainer, setScrollContainer] = useState<HTMLDivElement | null>(null);

  // Check if this card is currently being edited in the modal
  // OPTIMIZED: Subscribe to a derived boolean instead of the raw ID
  // This way, only THIS card's component re-renders when its modal state changes
  // Other cards won't re-render because their isEditingInModal stays false
  const isEditingInModal = useUIStore(
    (state) => state.openPanelIds.includes(item.id)
  );

  // Store the last rendered content to freeze preview while modal is open
  const frozenContentRef = useRef<Block[] | null>(null);

  // OPTIMIZED: Memoize blocks array to prevent unnecessary re-renders
  // Only recreate if blockContent or field1 actually changes
  const content = useMemo(() => {
    if (hasBlockContent) {
      return noteData.blockContent as Block[];
    }
    return plainTextToBlocks(noteData.field1 || "");
  }, [hasBlockContent, noteData.blockContent, noteData.field1]);

  // OPTIMIZED: Freeze preview content when modal is open for this card
  // But allow updates if content changes significantly (external updates like from AI)
  const displayContent = useMemo(() => {
    if (isEditingInModal) {
      // If modal is open, check if content changed significantly
      // This handles external updates (like from AI) while preventing re-renders from user typing
      const currentContentStr = JSON.stringify(content);
      const frozenContentStr = frozenContentRef.current ? JSON.stringify(frozenContentRef.current) : null;

      // If content changed externally (different from frozen), update frozen content
      if (frozenContentStr !== currentContentStr) {
        frozenContentRef.current = content;
      }

      return frozenContentRef.current || content;
    } else {
      // Modal is closed, update frozen content and use current content
      frozenContentRef.current = content;
      return content;
    }
  }, [isEditingInModal, content]);

  // Create a stable content hash for effect dependency
  // This avoids re-running effect when content array reference changes but content is the same
  const contentHash = useMemo(() => {
    if (displayContent.length === 0) return '';
    // Create a simple hash from block IDs and content
    return JSON.stringify(displayContent.map(b => ({ id: b.id, type: b.type })));
  }, [displayContent]);

  if (displayContent.length > 0) {
    return (
      <div
        ref={setScrollContainer}
        className="workspace-card-readonly-editor flex-1 min-h-0"
        style={{
          paddingLeft: '0.5rem',
          paddingRight: '0.5rem',
          overflow: isScrollLocked ? 'hidden' : 'auto'
        }}
      >
        <BlockNotePreview
          blocks={displayContent}
          isScrollLocked={isScrollLocked}
          scrollParent={scrollContainer}
        />
      </div>
    );
  }
  return null;
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
  existingColors,
  onMoveItem,
}: WorkspaceCardProps) {
  const posthog = usePostHog();

  // Subscribe directly to this card's selection state from the store
  // This prevents full grid re-renders when selection changes
  const isSelected = useUIStore(
    (state) => state.selectedCardIds.has(item.id)
  );
  const onToggleSelection = useUIStore((state) => state.toggleCardSelection);

  // Check if this card is currently open in the panel (not maximized/modal)
  const isOpenInPanel = useUIStore(
    (state) => state.openPanelIds.includes(item.id) && state.maximizedItemId !== item.id
  );
  const openPanelIds = useUIStore(state => state.openPanelIds);
  const maximizedItemId = useUIStore(state => state.maximizedItemId);
  const setOpenModalItemId = useUIStore((state) => state.setOpenModalItemId);
  const openPanel = useUIStore((state) => state.openPanel);

  // Register this card's minimal context (title, id, type) with the assistant
  useCardContextProvider(item);

  // No dynamic calculations needed - just overflow hidden
  const [isColorPickerOpen, setIsColorPickerOpen] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [showMoveDialog, setShowMoveDialog] = useState(false);
  const [showRenameDialog, setShowRenameDialog] = useState(false);
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  // Get scroll lock state from Zustand store (persists across interactions)
  const isScrollLocked = useUIStore(selectItemScrollLocked(item.id));
  const toggleItemScrollLocked = useUIStore((state) => state.toggleItemScrollLocked);
  const [isDragging, setIsDragging] = useState(false);
  const setItemPrompt = useUIStore((state) => state.setItemPrompt);
  const articleRef = useRef<HTMLElement>(null);

  // Measure card width to determine if we should show preview
  const cardWidth = useElementWidth(articleRef);

  // Show preview if card is wider than ~250px (roughly when w > 1 in grid)
  // This threshold works for single-column minimized cards vs wider cards
  // OPTIMIZED: Treat undefined (initial) as wide enough to prevent flicker on mount
  const shouldShowPreview = cardWidth === undefined || cardWidth > 250;

  // PERFORMANCE: Track visibility for PDF virtualization
  // Only mount PDF content when card is visible in viewport
  const isCardVisible = useIsVisible(articleRef, { rootMargin: '200px' });

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
    return () => {
      if (listenersActiveRef.current && handlersRef.current.handleGlobalMouseMove && handlersRef.current.handleGlobalMouseUp) {
        document.removeEventListener('mousemove', handlersRef.current.handleGlobalMouseMove);
        document.removeEventListener('mouseup', handlersRef.current.handleGlobalMouseUp);
        listenersActiveRef.current = false;
      }
    };
  }, []);

  // Check if card is being dragged by checking parent element for dragging class
  // State to track if YouTube video is playing
  const playingYouTubeCardIds = useUIStore(state => state.playingYouTubeCardIds);
  const setCardPlaying = useUIStore(state => state.setCardPlaying);
  const isYouTubePlaying = playingYouTubeCardIds.has(item.id);

  useEffect(() => {
    if (!articleRef.current || item.type !== 'youtube') return;

    const checkDragging = () => {
      const parent = articleRef.current?.closest('.react-grid-item');
      const dragging = parent?.classList.contains('react-draggable-dragging') ?? false;
      setIsDragging(dragging);
    };

    // Check initially
    checkDragging();

    // Use MutationObserver to watch for class changes on parent
    const parent = articleRef.current.closest('.react-grid-item');
    if (!parent) return;

    const observer = new MutationObserver(checkDragging);
    observer.observe(parent, {
      attributes: true,
      attributeFilter: ['class']
    });

    return () => {
      observer.disconnect();
    };
  }, [item.type, item.id]);


  // OPTIMIZED: Memoize ItemHeader callbacks to prevent inline function creation
  const handleNameChange = useCallback((v: string) => {
    onUpdateItem(item.id, { name: v });
  }, [item.id, onUpdateItem]);

  const handleNameCommit = useCallback((v: string) => {
    onUpdateItem(item.id, { name: v });
  }, [item.id, onUpdateItem]);

  const handleSubtitleChange = useCallback((v: string) => {
    onUpdateItem(item.id, { subtitle: v });
  }, [item.id, onUpdateItem]);

  const handleTitleFocus = useCallback(() => {
    setIsEditingTitle(true);
  }, []);

  const handleTitleBlur = useCallback(() => {
    setIsEditingTitle(false);
  }, []);

  // Handle color change from color picker
  const handleColorChange = useCallback((color: ColorResult) => {
    posthog.capture('card-color-changed', { card_id: item.id, new_color: color.hex });
    onUpdateItem(item.id, { color: color.hex as CardColor });
    setIsColorPickerOpen(false);
  }, [item.id, onUpdateItem, posthog]);

  const handleDelete = useCallback(() => {
    setShowDeleteDialog(true);
  }, []);

  const handleDeleteConfirm = useCallback(() => {
    posthog.capture('card-deleted', { card_id: item.id, card_name: item.name });
    onDeleteItem(item.id);
    setShowDeleteDialog(false);
    toast.success("Card deleted successfully");
  }, [item.id, onDeleteItem, item.name, posthog]);

  const handleRename = useCallback((newName: string) => {
    onUpdateItem(item.id, { name: newName });
    toast.success("Card renamed");
  }, [item.id, onUpdateItem]);

  // Handle copying note content as markdown
  const handleCopyMarkdown = useCallback(() => {
    if (item.type !== 'note') return;

    const noteData = item.data as NoteData;
    let markdownContent = '';

    // Prefer BlockNote blocks, fall back to plain text
    if (noteData.blockContent && Array.isArray(noteData.blockContent) && noteData.blockContent.length > 0) {
      markdownContent = serializeBlockNote(noteData.blockContent as Block[]);
    } else if (noteData.field1) {
      markdownContent = noteData.field1;
    }

    if (markdownContent) {
      navigator.clipboard.writeText(markdownContent).then(() => {
        toast.success("Copied to clipboard");
      }).catch(() => {
        toast.error("Failed to copy");
      });
    } else {
      toast.error("No content to copy");
    }
  }, [item.type, item.data]);

  // Handle mouse down - track initial position for local movement detection
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    // Don't track if clicking on interactive elements or text inputs
    const target = e.target as HTMLElement;
    if (
      target.closest('button') ||
      target.closest('input') ||
      target.closest('textarea') ||
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
        if (listenersActiveRef.current && handlersRef.current.handleGlobalMouseMove && handlersRef.current.handleGlobalMouseUp) {
          document.removeEventListener('mousemove', handlersRef.current.handleGlobalMouseMove);
          document.removeEventListener('mouseup', handlersRef.current.handleGlobalMouseUp);
          listenersActiveRef.current = false;
          handlersRef.current.handleGlobalMouseMove = null;
          handlersRef.current.handleGlobalMouseUp = null;
        }
      };

      handlersRef.current.handleGlobalMouseMove = handleGlobalMouseMove;
      handlersRef.current.handleGlobalMouseUp = handleGlobalMouseUp;
      document.addEventListener('mousemove', handleGlobalMouseMove);
      document.addEventListener('mouseup', handleGlobalMouseUp);
      listenersActiveRef.current = true;
    }
  }, [DRAG_THRESHOLD]);

  // Handle mouse move on card - detect if user moved before releasing
  // Note: This is a fallback - the global listener handles most cases
  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    // The global listener handles this, but we keep this for local element-specific checks
    if (!mouseDownRef.current) return;

    // Only check for text input/selection if drag hasn't been detected yet
    // This prevents starting a drag when user is trying to select text
    const target = e.target as HTMLElement;
    if (
      target.closest('textarea') ||
      target.closest('input') ||
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

  const handleCardClick = useCallback((e: React.MouseEvent) => {
    // Check if click originated from dropdown menu
    const target = e.target as HTMLElement;
    if (target.closest('[data-slot="dropdown-menu-item"]') ||
      target.closest('[data-slot="dropdown-menu-content"]') ||
      target.closest('[data-slot="dropdown-menu-trigger"]') ||
      target.closest('[data-slot="dialog-content"]') ||
      target.closest('[data-slot="dialog-close"]') ||
      target.closest('[data-slot="dialog-overlay"]')) {
      e.preventDefault();
      e.stopPropagation();
      return;
    }

    // For flashcard cards, check if click is on the flashcard itself
    // If so, let the flashcard handle it (for flipping)
    if (item.type === 'flashcard') {
      // Check if click is on the flashcard component or its children
      const flashcardElement = target.closest('.flashcard-container, .flashcard, [class*="flashcard"]');
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

    // Prevent opening panel for notes with active deep research
    if (item.type === 'note') {
      const noteData = item.data as NoteData;
      if (noteData.deepResearch && noteData.deepResearch.status !== 'complete') {
        e.preventDefault();
        e.stopPropagation();
        toast.info("Research in progress - please wait for it to complete");
        return;
      }
    }

    // For YouTube cards, handle click to play
    if (item.type === 'youtube') {
      // If we got here, it wasn't a drag (checked above)
      // So treat this as a click to play
      e.stopPropagation();
      if (!isYouTubePlaying) {
        setCardPlaying(item.id, true);
      }
      return;
    }

    // If this card is already open in panel mode, close it instead of re-opening
    if (isOpenInPanel) {
      setOpenModalItemId(null);
      return;
    }

    // Check if another item is already open (and not this one)
    // If so, show prompt to replace or split
    // Only for items that open in panel (Note/PDF)
    // AND only if grid has multiple columns (desktop-ish) - on mobile maybe just replace?
    // Let's enable for all for now or check window width? Keeping simple.
    if (openPanelIds.length > 0 && !openPanelIds.includes(item.id) && !maximizedItemId && (item.type === 'note' || item.type === 'pdf')) {
      // Prevent default open
      e.stopPropagation();

      setItemPrompt({
        itemId: item.id,
        x: e.clientX,
        y: e.clientY
      });
      return;
    }

    onOpenModal(item.id);
  }, [isEditingTitle, isOpenInPanel, item.id, item.type, onOpenModal, setOpenModalItemId, openPanelIds, isYouTubePlaying, setCardPlaying, maximizedItemId]);

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <div className="group size-full">
          <article
            ref={articleRef}
            id={`item-${item.id}`}
            data-youtube-playing={isYouTubePlaying}
            data-item-type={item.type}
            data-has-preview={shouldShowPreview}
            className={`relative rounded-md scroll-mt-4 size-full flex flex-col overflow-hidden transition-all duration-200 cursor-pointer ${item.type === 'youtube' || (item.type === 'pdf' && shouldShowPreview)
              ? 'p-0'
              : 'p-4 border shadow-sm hover:border-foreground/30 hover:shadow-md focus-within:border-foreground/50'
              }`}
            style={{
              backgroundColor: item.type === 'youtube' ? 'transparent' : (item.color ? getCardColorCSS(item.color, 0.25) : 'var(--card)'),
              borderColor: isSelected ? 'rgba(255, 255, 255, 0.8)' : (item.color ? getCardAccentColor(item.color, 0.5) : 'transparent'),
              borderWidth: isSelected ? '2px' : (item.type === 'youtube' || (item.type === 'pdf' && shouldShowPreview) ? '0px' : '1px'),
              transition: 'border-color 150ms ease-out, box-shadow 150ms ease-out, background-color 150ms ease-out'
            } as React.CSSProperties}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onClick={handleCardClick}
          >
            {/* Floating Controls Container */}
            <div className={`absolute top-3 right-3 z-10 flex items-center gap-2 ${isEditingTitle || isYouTubePlaying ? 'opacity-0 pointer-events-none' : 'opacity-0 group-hover:opacity-100'}`}>
              {/* Scroll Lock/Unlock Button - Hidden for YouTube and narrow note/PDF cards */}
              {item.type !== 'youtube' && !(item.type === 'note' && !shouldShowPreview) && !(item.type === 'pdf' && !shouldShowPreview) && (
                <button
                  type="button"
                  aria-label={isScrollLocked ? 'Click to unlock scroll' : 'Click to lock scroll'}
                  title={isScrollLocked ? 'Click to unlock scroll' : 'Click to lock scroll'}
                  className="inline-flex h-8 items-center justify-center gap-1.5 pl-2.5 pr-3 rounded-xl text-white/90 hover:text-white hover:scale-105 hover:shadow-lg transition-all duration-200 cursor-pointer"
                  style={{
                    backgroundColor: (item.type === 'pdf' && shouldShowPreview) ? 'rgba(0, 0, 0, 0.6)' : 'rgba(255, 255, 255, 0.1)',
                    backdropFilter: 'blur(8px)'
                  }}
                  onMouseDown={(e) => {
                    e.stopPropagation();
                    e.preventDefault();
                  }}
                  onMouseEnter={(e) => {
                    (e.currentTarget as HTMLButtonElement).style.backgroundColor = (item.type === 'pdf' && shouldShowPreview) ? 'rgba(0, 0, 0, 0.8)' : 'rgba(0, 0, 0, 0.5)';
                  }}
                  onMouseLeave={(e) => {
                    (e.currentTarget as HTMLButtonElement).style.backgroundColor = (item.type === 'pdf' && shouldShowPreview) ? 'rgba(0, 0, 0, 0.6)' : 'rgba(255, 255, 255, 0.1)';
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
                  <span className="text-xs font-medium">{isScrollLocked ? 'Scroll' : 'Lock'}</span>
                </button>
              )}

              {/* Selection Button */}
              <button
                type="button"
                aria-label={isSelected ? 'Deselect card' : 'Select card'}
                title={isSelected ? 'Deselect card' : 'Select card'}
                className="inline-flex h-8 w-8 items-center justify-center rounded-xl text-white/90 hover:text-white hover:scale-110 hover:shadow-lg transition-all duration-200 cursor-pointer"
                style={{
                  backgroundColor: isSelected
                    ? ((item.type === 'pdf' && shouldShowPreview) ? 'rgba(239, 68, 68, 0.4)' : 'rgba(239, 68, 68, 0.3)')
                    : ((item.type === 'pdf' && shouldShowPreview) ? 'rgba(0, 0, 0, 0.6)' : 'rgba(255, 255, 255, 0.1)'),
                  backdropFilter: 'blur(8px)'
                }}
                onMouseDown={(e) => {
                  e.stopPropagation();
                  e.preventDefault();
                }}
                onMouseEnter={(e) => {
                  (e.currentTarget as HTMLButtonElement).style.backgroundColor = isSelected
                    ? ((item.type === 'pdf' && shouldShowPreview) ? 'rgba(239, 68, 68, 0.6)' : 'rgba(239, 68, 68, 0.5)')
                    : ((item.type === 'pdf' && shouldShowPreview) ? 'rgba(0, 0, 0, 0.8)' : 'rgba(0, 0, 0, 0.5)');
                }}
                onMouseLeave={(e) => {
                  (e.currentTarget as HTMLButtonElement).style.backgroundColor = isSelected
                    ? ((item.type === 'pdf' && shouldShowPreview) ? 'rgba(239, 68, 68, 0.4)' : 'rgba(239, 68, 68, 0.3)')
                    : ((item.type === 'pdf' && shouldShowPreview) ? 'rgba(0, 0, 0, 0.6)' : 'rgba(255, 255, 255, 0.1)');
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
                      backgroundColor: (item.type === 'pdf' && shouldShowPreview) ? 'rgba(0, 0, 0, 0.6)' : 'rgba(255, 255, 255, 0.1)',
                      backdropFilter: 'blur(8px)'
                    }}
                    onMouseDown={(e) => {
                      e.stopPropagation();
                      e.preventDefault();
                    }}
                    onMouseEnter={(e) => {
                      (e.currentTarget as HTMLButtonElement).style.backgroundColor = (item.type === 'pdf' && shouldShowPreview) ? 'rgba(0, 0, 0, 0.8)' : 'rgba(0, 0, 0, 0.5)';
                    }}
                    onMouseLeave={(e) => {
                      (e.currentTarget as HTMLButtonElement).style.backgroundColor = (item.type === 'pdf' && shouldShowPreview) ? 'rgba(0, 0, 0, 0.6)' : 'rgba(255, 255, 255, 0.1)';
                    }}
                    onClick={(e) => e.stopPropagation()}
                  >
                    <MoreVertical className="h-4 w-4" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-48" onClick={(e) => e.stopPropagation()}>
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
                  {item.type === 'note' && (
                    <>
                      <DropdownMenuItem onSelect={handleCopyMarkdown}>
                        <Copy className="mr-2 h-4 w-4" />
                        <span>Copy Markdown</span>
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                    </>
                  )}
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

            {/* Color Picker Dialog */}
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
                    color={item.color || '#3B82F6'}
                    colors={SWATCHES_COLOR_GROUPS}
                    onChangeComplete={handleColorChange}
                  />
                </div>
              </DialogContent>
            </Dialog>

            {/* Card Content - show compact layout when preview is hidden */}
            <div className={(item.type === 'note' || item.type === 'pdf') && !shouldShowPreview ? "flex-1 flex flex-col" : "flex-shrink-0"}>
              {item.type !== 'youtube' && !(item.type === 'pdf' && shouldShowPreview) && (
                <ItemHeader
                  id={item.id}
                  name={item.name}
                  subtitle={item.subtitle}
                  description={""}
                  onNameChange={handleNameChange}
                  onNameCommit={handleNameCommit}
                  onSubtitleChange={handleSubtitleChange}
                  readOnly={(item.type === 'note' || item.type === 'pdf') && !shouldShowPreview}
                  noMargin={true}
                  onTitleFocus={handleTitleFocus}
                  onTitleBlur={handleTitleBlur}
                  allowWrap={(item.type === 'note' || item.type === 'pdf') && !shouldShowPreview}
                />
              )
              }
              {/* Subtle type label for narrow cards without preview */}
              {(item.type === 'note' || item.type === 'pdf') && !shouldShowPreview && (
                <span className="text-[10px] uppercase tracking-wider text-white/40 mt-auto">
                  {item.type === 'note' ? 'Note' : 'PDF'}
                </span>
              )}
            </div>

            {/* Note Content - render preview if card is wide enough */}
            {item.type === 'note' && shouldShowPreview && (
              <WorkspaceCardNoteContent item={item} isScrollLocked={isScrollLocked} />
            )}

            {/* PDF Content - render embedded PDF viewer if card is wide enough */}
            {/* PERFORMANCE: Only mount PDF content when card is visible (virtualization) */}
            {/* When scroll is locked, render lightweight placeholder instead of full PDF viewer */}
            {item.type === 'pdf' && shouldShowPreview && (() => {
              const pdfData = item.data as PdfData;

              return (
                <div
                  className={`flex-1 min-h-0 ${isScrollLocked ? 'overflow-hidden' : 'overflow-auto'}`}
                  style={{ pointerEvents: isScrollLocked ? 'none' : 'auto' }}
                >
                  {!isCardVisible ? (
                    // Placeholder when card is not visible - very lightweight
                    <div className="w-full h-full flex items-center justify-center bg-[#1a1a1a] text-white/30 text-xs">
                      PDF
                    </div>
                  ) : isScrollLocked ? (
                    <LightweightPdfPreview
                      pdfSrc={pdfData.fileUrl}
                      className="w-full h-full"
                    />
                  ) : (
                    <LazyAppPdfViewer pdfSrc={pdfData.fileUrl} />
                  )}
                </div>
              );
            })()}

            {/* Flashcard Content - render interactive flashcard */}
            {item.type === 'flashcard' && (() => {
              const flashcardData = item.data as FlashcardData;

              // Helper to serialize blocks to plain text with LaTeX support
              const blocksToText = (blocks: unknown): string => {
                if (!blocks || !Array.isArray(blocks) || blocks.length === 0) return "";

                return (blocks as any[])
                  .map((block) => {
                    // Handle separate Math blocks (display math)
                    if (block.type === "math" && block.props?.latex) {
                      return `$$${block.props.latex}$$`;
                    }

                    // Handle blocks with inline content (paragraphs, headings, bullet list items, etc.)
                    if (block.content && Array.isArray(block.content)) {
                      return block.content
                        .map((item: any) => {
                          if (item.type === "inlineMath" && item.props?.latex) {
                            return `$${item.props.latex}$`;
                          }
                          return item.text || "";
                        })
                        .join("");
                    }

                    return "";
                  })
                  .join("\n\n"); // Use double newline to separate blocks clearly
              };

              // Get display text (prefer blocks, fall back to plain text)
              const frontText = flashcardData.frontBlocks
                ? blocksToText(flashcardData.frontBlocks)
                : flashcardData.front || "Click to add front content";

              const backText = flashcardData.backBlocks
                ? blocksToText(flashcardData.backBlocks)
                : flashcardData.back || "Click to add back content";




              // Common markdown components configuration
              const markdownComponents = {
                p: ({ children }: any) => <span className="block mb-2 last:mb-0">{children}</span>,
                // Add more custom renderers if needed
              };

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
                          <div className="p-8 flex items-center justify-center h-full text-center text-lg font-medium text-gray-900 overflow-y-auto">
                            <div className="w-full">
                              <ReactMarkdown
                                remarkPlugins={[remarkMath]}
                                rehypePlugins={[rehypeKatex]}
                                components={markdownComponents}
                              >
                                {frontText}
                              </ReactMarkdown>
                            </div>
                          </div>
                        )
                      }}
                      back={{
                        html: (
                          <div className="p-8 flex items-center justify-center h-full text-center text-lg font-medium text-gray-900 overflow-y-auto">
                            <div className="w-full">
                              <ReactMarkdown
                                remarkPlugins={[remarkMath]}
                                rehypePlugins={[rehypeKatex]}
                                components={markdownComponents}
                              >
                                {backText}
                              </ReactMarkdown>
                            </div>
                          </div>
                        )
                      }}
                    />
                  </div>
                </div>
              );
            })()}

            {/* YouTube Content - render YouTube embed */}
            {item.type === 'youtube' && (() => {
              const youtubeData = item.data as YouTubeData;
              const embedUrl = getYouTubeEmbedUrl(youtubeData.url);

              if (!embedUrl) {
                // Invalid URL - show error state
                return (
                  <div className="p-0 min-h-0">
                    <div className="flex flex-col items-center justify-center gap-3 text-center h-full p-4">
                      <div className="rounded-lg p-4 bg-red-500/10 border border-red-500/20 flex items-center justify-center">
                        <span className="text-red-400 font-medium">Invalid YouTube URL</span>
                      </div>
                      <p className="text-xs text-muted-foreground/70">
                        Please check the URL and try again
                      </p>
                    </div>
                  </div>
                );
              }

              // Use the YouTubeCardContent component which handles play/adjust state
              return <YouTubeCardContent
                item={item}
                isPlaying={isYouTubePlaying}
                onTogglePlay={(playing) => setCardPlaying(item.id, playing)}
              />;
            })()}

            {/* Deep Research Note - render streaming UI when research is in progress */}
            {item.type === 'note' && (() => {
              const noteData = item.data as NoteData;
              if (noteData.deepResearch && noteData.deepResearch.status !== 'complete') {
                return (
                  <div className="flex-1 min-h-0 overflow-hidden">
                    <DeepResearchCardContent
                      item={item}
                      onUpdateItem={onUpdateItem}
                      isScrollLocked={isScrollLocked}
                    />
                  </div>
                );
              }
              return null;
            })()}
          </article>


          {/* Delete Confirmation Dialog */}
          <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete Card</AlertDialogTitle>
                <AlertDialogDescription>
                  Are you sure you want to delete &quot;{item.name || 'this card'}&quot;? This action cannot be undone.
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
                toast.success('Item moved');
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
        )
        }
        {
          item.type === 'note' && (
            <>
              <ContextMenuItem onSelect={handleCopyMarkdown}>
                <Copy className="mr-2 h-4 w-4" />
                <span>Copy Markdown</span>
              </ContextMenuItem>
              <ContextMenuSeparator />
            </>
          )
        }
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
export const WorkspaceCardMemoized = memo(WorkspaceCard, (prevProps, nextProps) => {
  // Compare item properties
  if (prevProps.item.id !== nextProps.item.id) return false;
  if (prevProps.item.name !== nextProps.item.name) return false;
  if (prevProps.item.subtitle !== nextProps.item.subtitle) return false;
  if (prevProps.item.color !== nextProps.item.color) return false;
  if (prevProps.item.type !== nextProps.item.type) return false;

  // Compare item data (for notes, PDFs, flashcards, and YouTube)
  if (prevProps.item.type === 'note' && nextProps.item.type === 'note') {
    const prevData = prevProps.item.data;
    const nextData = nextProps.item.data;
    if (JSON.stringify(prevData) !== JSON.stringify(nextData)) return false;
  }
  if (prevProps.item.type === 'pdf' && nextProps.item.type === 'pdf') {
    const prevData = prevProps.item.data;
    const nextData = nextProps.item.data;
    if (JSON.stringify(prevData) !== JSON.stringify(nextData)) return false;
  }
  if (prevProps.item.type === 'flashcard' && nextProps.item.type === 'flashcard') {
    const prevData = prevProps.item.data;
    const nextData = nextProps.item.data;
    if (JSON.stringify(prevData) !== JSON.stringify(nextData)) return false;
  }
  if (prevProps.item.type === 'youtube' && nextProps.item.type === 'youtube') {
    const prevData = prevProps.item.data;
    const nextData = nextProps.item.data;
    if (JSON.stringify(prevData) !== JSON.stringify(nextData)) return false;
  }

  // Compare layout (use lg breakpoint for comparison)
  const prevLayout = getLayoutForBreakpoint(prevProps.item, 'lg');
  const nextLayout = getLayoutForBreakpoint(nextProps.item, 'lg');
  if (prevLayout?.x !== nextLayout?.x) return false;
  if (prevLayout?.y !== nextLayout?.y) return false;
  if (prevLayout?.w !== nextLayout?.w) return false;
  if (prevLayout?.h !== nextLayout?.h) return false;

  // NOTE: isSelected is now subscribed directly from the store, not a prop

  // Compare existingColors array (shallow comparison)
  if (prevProps.existingColors.length !== nextProps.existingColors.length) return false;
  if (prevProps.existingColors.some((color, i) => color !== nextProps.existingColors[i])) return false;

  // NOTE: We intentionally do NOT compare callback references (onUpdateItem, onDeleteItem, etc.)
  // These are action handlers that don't affect the rendered output.
  // React Compiler handles memoization, and checking refs here causes unnecessary re-renders
  // when parent components re-render and create new callback instances.

  return true; // Props are equal, skip re-render
});

// Export both the memoized version and original for backwards compatibility
export { WorkspaceCardMemoized as WorkspaceCard };

