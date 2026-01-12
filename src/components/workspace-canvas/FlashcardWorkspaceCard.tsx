"use client";

import { useState, useCallback, useEffect, useRef, useMemo, memo } from "react";
import { toast } from "sonner";
import { MoreVertical, Trash2, CheckCircle2, Pencil, Palette, ChevronLeft, ChevronRight, X, FolderInput } from "lucide-react";
import type { Item, FlashcardData, FlashcardItem } from "@/lib/workspace-state/types";
import { FlipCard } from "./FlipCard";
import { SWATCHES_COLOR_GROUPS, getCardColorCSS, getCardAccentColor, type CardColor } from "@/lib/workspace-state/colors";
import { SwatchesPicker, ColorResult } from "react-color";
import { useUIStore } from "@/lib/stores/ui-store";
import { plainTextToBlocks, type Block } from "@/components/editor/BlockNoteEditor";
import { BlockNotePreview, PreviewBlock } from "@/components/editor/BlockNotePreview";
import { generateItemId } from "@/lib/workspace-state/item-helpers";
import { useCardContextProvider } from "@/hooks/ai/use-card-context-provider";
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

interface FlashcardWorkspaceCardProps {
    item: Item;
    allItems?: Item[]; // All items for the move dialog tree
    workspaceName?: string;
    workspaceIcon?: string | null;
    workspaceColor?: string | null;
    onUpdateItem: (itemId: string, updates: Partial<Item>) => void;
    onDeleteItem: (itemId: string) => void;
    onOpenModal: (itemId: string) => void;
    onMoveItem?: (itemId: string, folderId: string | null) => void; // Callback to move item to folder
    // NOTE: isSelected removed - card subscribes directly to store for performance
    // onToggleSelection is still passed as a prop for the shift+click handler
}

// Helper component to handle side content rendering with BlockNote
// Memoized to prevent re-renders during parent state changes (e.g., isFlipped)
const FlashcardSideContent = memo(function FlashcardSideContent({
    blocks,
    textFallback,
    isEditing,
    isScrollLocked,
    className = ""
}: {
    blocks: unknown,
    textFallback: string,
    isEditing: boolean,
    isScrollLocked: boolean,
    className?: string
}) {
    const scrollContainerRef = useRef<HTMLDivElement>(null);
    const frozenContentRef = useRef<Block[] | null>(null);

    // Parse or use blocks
    const content = useMemo(() => {
        if (blocks && Array.isArray(blocks) && blocks.length > 0) {
            return blocks as Block[];
        }
        return plainTextToBlocks(textFallback || "Click pencil icon to add content");
    }, [blocks, textFallback]);

    // Freeze content while editing to prevent flicker
    const displayContent = useMemo(() => {
        if (isEditing) {
            const currentContentStr = JSON.stringify(content);
            const frozenContentStr = frozenContentRef.current ? JSON.stringify(frozenContentRef.current) : null;

            if (frozenContentStr !== currentContentStr) {
                frozenContentRef.current = content;
            }
            return frozenContentRef.current || content;
        } else {
            frozenContentRef.current = content;
            return content;
        }
    }, [isEditing, content]);

    // Create a stable content hash for effect dependency
    const contentHash = useMemo(() => {
        if (displayContent.length === 0) return '';
        return JSON.stringify(displayContent.map(b => ({ id: b.id, type: b.type })));
    }, [displayContent]);

    return (
        <div
            ref={scrollContainerRef}
            className={`workspace-card-readonly-editor size-full min-h-0 ${isScrollLocked ? 'overflow-hidden' : 'overflow-y-auto overflow-x-hidden'} ${className}`}
            style={{
                // Ensure white text cascades to BlockNote default styles where possible
                color: 'white',
                // Explicitly contain scroll chaining
                overscrollBehaviorY: 'contain',
                // Center text within the flashcard
                textAlign: 'center',
                // Match ItemHeader note card title styling: text-base (1rem) font-medium (500)
                fontSize: '1rem',
                fontWeight: 500,
                padding: '1rem',
                // Text rendering optimization - NO transforms here to avoid 3D context conflicts
                WebkitFontSmoothing: 'antialiased',
                MozOsxFontSmoothing: 'grayscale' as any,
            }}
            onMouseDown={(e) => {
                if (!isScrollLocked) {
                    e.stopPropagation();
                }
            }}
            onWheel={(e) => {
                if (!isScrollLocked) {
                    e.stopPropagation();
                }
            }}
        >
            <div className="size-full flex flex-col justify-center items-center px-6">
                <div className="w-full">
                    {displayContent.map((block, index) => (
                        <PreviewBlock
                            key={block.id || index}
                            block={block}
                            index={index}
                            blocks={displayContent}
                            isScrollLocked={isScrollLocked}
                        />
                    ))}
                </div>
            </div>
        </div>
    );
}, (prevProps, nextProps) => {
    // Custom comparison to prevent unnecessary re-renders during flip animation
    // Only re-render if content or scroll lock actually changes
    const blocksEqual = JSON.stringify(prevProps.blocks) === JSON.stringify(nextProps.blocks);
    const textEqual = prevProps.textFallback === nextProps.textFallback;
    const editingEqual = prevProps.isEditing === nextProps.isEditing;
    const scrollLockEqual = prevProps.isScrollLocked === nextProps.isScrollLocked;
    const classEqual = prevProps.className === nextProps.className;

    return blocksEqual && textEqual && editingEqual && scrollLockEqual && classEqual;
});

export function FlashcardWorkspaceCard({
    item,
    allItems,
    workspaceName,
    workspaceIcon,
    workspaceColor,
    onUpdateItem,
    onDeleteItem,
    onOpenModal,
    onMoveItem,
}: FlashcardWorkspaceCardProps) {
    // Register this card's minimal context (title, id, type) with the assistant
    useCardContextProvider(item);

    // Subscribe directly to this card's selection state from the store
    // This prevents full grid re-renders when selection changes
    const isSelected = useUIStore(
        (state) => state.selectedCardIds.has(item.id)
    );
    const onToggleSelection = useUIStore((state) => state.toggleCardSelection);

    const [showDeleteDialog, setShowDeleteDialog] = useState(false);
    const [showMoveDialog, setShowMoveDialog] = useState(false);
    const [isColorPickerOpen, setIsColorPickerOpen] = useState(false);
    const [isFlipped, setIsFlipped] = useState(false);
    const [isFlipping, setIsFlipping] = useState(false);
    const [isScrollLocked, setIsScrollLocked] = useState(true);
    const flashcardData = item.data as FlashcardData;

    // Navigation State
    const [currentIndex, setCurrentIndex] = useState(flashcardData.currentIndex || 0);

    // MIGRATION: Ensure cards array exists
    const cards = useMemo(() => {
        if (flashcardData.cards && flashcardData.cards.length > 0) {
            return flashcardData.cards;
        }
        // Return temporary migration array
        return [{
            id: 'temp-migration',
            front: flashcardData.front || "",
            back: flashcardData.back || "",
            frontBlocks: flashcardData.frontBlocks,
            backBlocks: flashcardData.backBlocks
        } as FlashcardItem];
    }, [flashcardData]);

    // Ensure index is valid
    useEffect(() => {
        if (currentIndex >= cards.length) {
            setCurrentIndex(0);
        }
    }, [cards.length, currentIndex]);

    // Persist index change (optional debounce?)
    const handleIndexChange = (newIndex: number) => {
        // Don't persist on every click to avoid network spam, or do?
        // For now just local state is smooth, maybe updating item is fine.
        // Let's keep it local for now, prop update on unmount?
        setCurrentIndex(newIndex);
        // If we want persistence: onUpdateItem(item.id, { data: { ...flashcardData, currentIndex: newIndex }});
    };

    const currentCard = cards[currentIndex] || cards[0];

    // Tracking for flip debounce
    const lastFlipTimeRef = useRef<number>(0);

    // Check if this card is currently being edited in the modal
    const isEditingInModal = useUIStore((state) => state.openPanelIds.includes(item.id));

    const handleDelete = useCallback(() => {
        setShowDeleteDialog(true);
    }, []);

    const confirmDelete = useCallback(() => {
        onDeleteItem(item.id);
        setShowDeleteDialog(false);
    }, [item.id, onDeleteItem]);

    const handleColorChange = useCallback((color: ColorResult) => {
        onUpdateItem(item.id, { color: color.hex as CardColor });
        setIsColorPickerOpen(false);
    }, [item.id, onUpdateItem]);

    // Debounced flip logic 
    const handleFlip = useCallback(() => {
        const now = Date.now();
        if (now - lastFlipTimeRef.current < 200) return;
        lastFlipTimeRef.current = now;
        setIsFlipped((prev) => !prev);
        setIsFlipping(true);
        // Hide stack tabs during flip animation, reappear slightly before animation ends
        setTimeout(() => setIsFlipping(false), 400);
    }, []);


    const handleClick = useCallback((e: React.MouseEvent) => {
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

        // With RGL v2, click events only fire for actual clicks (not drags)
        // so we can safely flip without distance checking
        handleFlip();
    }, [handleFlip, isScrollLocked, onToggleSelection, item.id]);

    // Navigation Handlers
    const goNext = (e: React.MouseEvent) => {
        e.stopPropagation();
        setIsFlipped(false); // Reset flip
        handleIndexChange((currentIndex + 1) % cards.length);
    };

    const goPrev = (e: React.MouseEvent) => {
        e.stopPropagation();
        setIsFlipped(false); // Reset flip
        handleIndexChange((currentIndex - 1 + cards.length) % cards.length);
    };

    // Calculate border styling to match WorkspaceCard
    const borderColor = isSelected ? 'rgba(255, 255, 255, 0.8)' : (item.color ? getCardAccentColor(item.color, 0.5) : 'transparent');
    const borderWidth = isSelected ? '2px' : '1px';

    return (
        <ContextMenu>
            <ContextMenuTrigger asChild>
                <div
                    id={`item-${item.id}`}
                    className="group size-full relative rounded-md shadow-sm hover:shadow-md"
                    style={{
                        transition: 'box-shadow 150ms ease-out',
                    }}
                    onClick={handleClick}
                >
                    {/* Floating Controls */}
                    <div className={`absolute top-2 right-2 z-20 flex items-center gap-2 transition-opacity opacity-0 group-hover:opacity-100`}>
                        <button
                            type="button"
                            aria-label="Edit flashcard"
                            title="Edit flashcard"
                            className="flashcard-control-button inline-flex h-8 w-8 items-center justify-center rounded-xl text-white/90 hover:text-white hover:scale-110 hover:shadow-lg transition-all duration-200 cursor-pointer"
                            style={{ backgroundColor: 'rgba(255, 255, 255, 0.1)', backdropFilter: 'blur(8px)' }}
                            onMouseEnter={(e) => (e.currentTarget as HTMLButtonElement).style.backgroundColor = 'rgba(0, 0, 0, 0.5)'}
                            onMouseLeave={(e) => (e.currentTarget as HTMLButtonElement).style.backgroundColor = 'rgba(255, 255, 255, 0.1)'}
                            onMouseDown={(e) => e.stopPropagation()}
                            onClick={(e) => { e.stopPropagation(); onOpenModal(item.id); }}
                        >
                            <Pencil className="h-4 w-4" />
                        </button>

                        <button
                            type="button"
                            aria-label={isSelected ? 'Deselect card' : 'Select card'}
                            title={isSelected ? 'Deselect card' : 'Select card'}
                            className="flashcard-control-button inline-flex h-8 w-8 items-center justify-center rounded-xl text-white/90 hover:text-white hover:scale-110 hover:shadow-lg transition-all duration-200 cursor-pointer"
                            style={{ backgroundColor: isSelected ? 'rgba(239, 68, 68, 0.3)' : 'rgba(255, 255, 255, 0.1)', backdropFilter: 'blur(8px)' }}
                            onMouseEnter={(e) => (e.currentTarget as HTMLButtonElement).style.backgroundColor = isSelected ? 'rgba(239, 68, 68, 0.5)' : 'rgba(0, 0, 0, 0.5)'}
                            onMouseLeave={(e) => (e.currentTarget as HTMLButtonElement).style.backgroundColor = isSelected ? 'rgba(239, 68, 68, 0.3)' : 'rgba(255, 255, 255, 0.1)'}
                            onMouseDown={(e) => e.stopPropagation()}
                            onClick={(e) => { e.stopPropagation(); onToggleSelection(item.id); }}
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
                                    style={{ backgroundColor: 'rgba(255, 255, 255, 0.1)', backdropFilter: 'blur(8px)' }}
                                    onMouseEnter={(e) => (e.currentTarget as HTMLButtonElement).style.backgroundColor = 'rgba(0, 0, 0, 0.5)'}
                                    onMouseLeave={(e) => (e.currentTarget as HTMLButtonElement).style.backgroundColor = 'rgba(255, 255, 255, 0.1)'}
                                    onMouseDown={(e) => e.stopPropagation()}
                                    onClick={(e) => e.stopPropagation()}
                                >
                                    <MoreVertical className="h-4 w-4" />
                                </button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-48" onClick={(e) => e.stopPropagation()}>
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
                                <DropdownMenuItem onClick={handleDelete} className="text-destructive focus:text-destructive">
                                    <Trash2 className="mr-2 h-4 w-4" />
                                    <span>Delete</span>
                                </DropdownMenuItem>
                            </DropdownMenuContent>
                        </DropdownMenu>
                    </div>

                    <Dialog open={isColorPickerOpen} onOpenChange={setIsColorPickerOpen}>
                        <DialogContent className="w-auto max-w-fit p-6" onClick={(e) => e.stopPropagation()} onMouseDown={(e) => e.stopPropagation()}>
                            <DialogHeader>
                                <DialogTitle>Choose a Color</DialogTitle>
                            </DialogHeader>
                            <div className="flex justify-center color-picker-wrapper" onClick={(e) => e.stopPropagation()} onMouseDown={(e) => e.stopPropagation()}>
                                <SwatchesPicker color={item.color || '#3B82F6'} colors={SWATCHES_COLOR_GROUPS} onChangeComplete={handleColorChange} />
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
                        <div className="relative flex-1" style={{ marginBottom: '12px' }}>
                            <FlipCard
                                front={
                                    <FlashcardSideContent
                                        blocks={currentCard.frontBlocks}
                                        textFallback={currentCard.front}
                                        isEditing={isEditingInModal}
                                        isScrollLocked={isScrollLocked}
                                        className="p-4"
                                    />
                                }
                                back={
                                    <FlashcardSideContent
                                        blocks={currentCard.backBlocks}
                                        textFallback={currentCard.back}
                                        isEditing={isEditingInModal}
                                        isScrollLocked={isScrollLocked}
                                        className="p-4"
                                    />
                                }
                                color={item.color}
                                isFlipped={isFlipped}
                                borderColor={borderColor}
                                borderWidth={borderWidth}
                            />
                            {/* Stack Tab 1 (directly below main card) - hidden during flip */}
                            <div
                                className="absolute left-1 right-1 rounded-b-md transition-opacity duration-200"
                                style={{
                                    top: '100%',
                                    height: '6px',
                                    backgroundColor: item.color ? getCardColorCSS(item.color as CardColor, 0.32) : 'var(--card)',
                                    border: borderColor && borderWidth ? `${borderWidth} solid ${borderColor}` : 'none',
                                    borderTop: 'none',
                                    opacity: isFlipping ? 0 : 1,
                                }}
                            />
                            {/* Stack Tab 2 (bottom-most, slightly narrower) - hidden during flip */}
                            <div
                                className="absolute left-2 right-2 rounded-b-md transition-opacity duration-200"
                                style={{
                                    top: 'calc(100% + 4px)',
                                    height: '6px',
                                    backgroundColor: item.color ? getCardColorCSS(item.color as CardColor, 0.15) : 'var(--card)',
                                    border: `1px solid ${item.color ? getCardColorCSS(item.color as CardColor, 0.15) : 'var(--card)'}`,
                                    borderTop: 'none',
                                    opacity: isFlipping ? 0 : 1,
                                }}
                            />
                        </div>
                    </div>

                    <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
                        <AlertDialogContent onClick={(e) => e.stopPropagation()}>
                            <AlertDialogHeader>
                                <AlertDialogTitle>Delete Flashcard</AlertDialogTitle>
                                <AlertDialogDescription>
                                    Are you sure you want to delete "{item.name || 'this flashcard'}"? This action cannot be undone.
                                </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                                <AlertDialogCancel>Cancel</AlertDialogCancel>
                                <AlertDialogAction onClick={confirmDelete}>Delete</AlertDialogAction>
                            </AlertDialogFooter>
                        </AlertDialogContent>
                    </AlertDialog>

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
                                toast.success('Item moved');
                            }}
                        />
                    )}
                </div>
            </ContextMenuTrigger>

            {/* Right-Click Context Menu */}
            <ContextMenuContent className="w-48">
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
