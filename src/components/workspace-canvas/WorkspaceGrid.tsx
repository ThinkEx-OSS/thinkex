import { Responsive as ResponsiveGridLayout, type Layout, type LayoutItem, useContainerWidth, verticalCompactor } from "react-grid-layout";
import { useMemo, useCallback, useRef, useEffect } from "react";
import React from "react";
import type { Item, CardType } from "@/lib/workspace-state/types";
import type { CardColor } from "@/lib/workspace-state/colors";
import { itemsToLayout, generateMissingLayouts, updateItemsWithLayout, hasLayoutChanged } from "@/lib/workspace-state/grid-layout-helpers";
import { isDescendantOf } from "@/lib/workspace-state/search";
import { WorkspaceCard } from "./WorkspaceCard";
import { FlashcardWorkspaceCard } from "./FlashcardWorkspaceCard";
import { FolderCard } from "./FolderCard";
import { useUIStore } from "@/lib/stores/ui-store";

interface WorkspaceGridProps {
  items: Item[]; // Filtered items to display (includes folder-type items)
  allItems: Item[]; // All items (unfiltered) for layout updates
  isFiltered: boolean; // Whether currently in filtered mode
  isTemporaryFilter?: boolean; // Whether in temporary filter mode (search) - prevents layout saves
  onDragStart: () => void;
  onDragStop: (layout: LayoutItem[]) => void;
  onUpdateItem: (itemId: string, updates: Partial<Item>) => void;
  onDeleteItem: (itemId: string) => void;
  onUpdateAllItems: (items: Item[]) => void;
  onOpenModal: (itemId: string) => void;
  selectedCardIds: Set<string>;
  onToggleSelection: (itemId: string) => void;
  onGridDragStateChange?: (isDragging: boolean) => void;
  workspaceName: string;
  workspaceIcon?: string | null;
  workspaceColor?: string | null;
  onMoveItem?: (itemId: string, folderId: string | null) => void; // Callback to move item to folder
  onMoveItems?: (itemIds: string[], folderId: string | null) => void; // Callback to move multiple items to folder (bulk move)
  onOpenFolder?: (folderId: string) => void; // Callback when folder is clicked
  onDeleteFolderWithContents?: (folderId: string) => void; // Callback to delete folder and all items inside
  addItem?: (type: CardType, name?: string, initialData?: Partial<Item['data']>) => string | void; // Function to add new items
  onPDFUpload?: (files: File[]) => Promise<void>; // Function to handle PDF upload
  setOpenModalItemId?: (id: string | null) => void; // Function to open modal for newly created items
}

/**
 * Grid layout component that manages the positioning and layout of workspace cards.
 * Handles drag-and-drop, resizing, and layout recalculation.
 */
export function WorkspaceGrid({
  items,
  allItems,
  isFiltered,
  isTemporaryFilter = false,
  onDragStart,
  onDragStop,
  onUpdateItem,
  onDeleteItem,
  onUpdateAllItems,
  onOpenModal,
  selectedCardIds,
  onToggleSelection,
  onGridDragStateChange,
  workspaceName,
  workspaceIcon,
  workspaceColor,
  onMoveItem,
  onMoveItems,
  onOpenFolder,
  onDeleteFolderWithContents,
  addItem,
  onPDFUpload,
  setOpenModalItemId,
}: WorkspaceGridProps) {
  const layoutChangeTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const hasUserInteractedRef = useRef<boolean>(false);
  const draggedItemIdRef = useRef<string | null>(null);
  const hoveredFolderIdRef = useRef<string | null>(null);
  const clearCardSelection = useUIStore((state) => state.clearCardSelection);
  // Get the currently open items to hide them from the grid (when open in panel, not maximized)
  const openPanelIds = useUIStore((state) => state.openPanelIds);
  const maximizedItemId = useUIStore((state) => state.maximizedItemId);

  // Use container width hook for v2 API
  const { width, containerRef, mounted } = useContainerWidth();

  // Track current breakpoint for saving layouts
  // Note: We use RGL's onBreakpointChange to update this, so we initialize to 'lg'
  const currentBreakpointRef = useRef<'lg' | 'xxs'>('lg');

  // OPTIMIZED: Store layout in ref to avoid including it in callback dependencies
  // This prevents handleDragStop from changing when layout changes, which causes ReactGridLayout re-renders
  const layoutRef = useRef<LayoutItem[]>([]);

  // OPTIMIZED: Store allItems in ref to avoid callback dependencies
  // This prevents callbacks from changing when these values change
  const allItemsRef = useRef(allItems);

  // Update refs whenever values change
  React.useEffect(() => {
    allItemsRef.current = allItems;
  }, [allItems]);

  // Generate layouts for items that don't have them
  // Note: We use 4 columns as the base for layout generation
  const itemsWithLayout = useMemo(() => {
    return generateMissingLayouts(items, 4);
  }, [items]);

  // Filter out items that are currently open in a panel (not maximized)
  // This hides the cards from the grid when viewing in the side panel
  const displayItems = useMemo(() => {
    if (openPanelIds.length > 0 && !maximizedItemId) {
      return itemsWithLayout.filter(item => !openPanelIds.includes(item.id));
    }
    return itemsWithLayout;
  }, [itemsWithLayout, openPanelIds, maximizedItemId]);


  // Note: Standard react-grid-layout handles bounds automatically.
  // Custom constraints (Youtube height, etc) are handled in onResize callback.

  // Note: Layout is now computed in combinedLayout below to include folders

  // Debounced handler for live updates during drag/resize
  // NOTE: We disable this and only save on drag stop to prevent unnecessary saves on clicks
  // react-grid-layout fires onLayoutChange even on simple clicks, causing unwanted updates
  const handleLayoutChange = useCallback((newLayout: Layout, allLayouts: Partial<Record<string, Layout>>) => {
    // Cancel any pending timeouts - we only save on drag stop now
    if (layoutChangeTimeoutRef.current) {
      clearTimeout(layoutChangeTimeoutRef.current);
      layoutChangeTimeoutRef.current = null;
    }

    // Don't save anything from onLayoutChange - handleDragStop handles all saves
    // This prevents unwanted BULK-UPDATE events on simple clicks
    return;
  }, []);

  // Handle drag start - with RGL v2, this only fires after 3px movement (real drag, not click)
  const handleDragStart = useCallback((layout: Layout, oldItem: LayoutItem | null, newItem: LayoutItem | null, placeholder: LayoutItem | null, e: Event, element: HTMLElement | undefined) => {
    // Check if the click originated from a dropdown menu - if so, don't start drag
    const target = e.target as HTMLElement;
    if (
      target.closest('[data-slot="dropdown-menu-item"]') ||
      target.closest('[data-slot="dropdown-menu-content"]') ||
      target.closest('[data-slot="dropdown-menu-trigger"]') ||
      target.closest('[role="menuitem"]')
    ) {
      // Prevent drag by not setting draggedItemIdRef
      return;
    }

    // Extract item ID from the element
    if (!oldItem) return; // Safety check for null oldItem
    const itemId = oldItem.i;
    draggedItemIdRef.current = itemId;
    hoveredFolderIdRef.current = null; // Reset hover state

    hasUserInteractedRef.current = true;
    onDragStart();
    onGridDragStateChange?.(true);
  }, [onDragStart, onGridDragStateChange]);

  // Handle drag to detect folder hover based on cursor position
  const handleDrag = useCallback((layout: Layout, oldItem: LayoutItem | null, newItem: LayoutItem | null, placeholder: LayoutItem | null, e: Event, element: HTMLElement | undefined) => {
    const draggedItemId = draggedItemIdRef.current;
    if (!draggedItemId || !e) return;

    const draggedItem = allItemsRef.current.find(i => i.id === draggedItemId);
    if (!draggedItem) {
      if (hoveredFolderIdRef.current !== null) {
        hoveredFolderIdRef.current = null;
        window.dispatchEvent(new CustomEvent('folder-drag-hover', {
          detail: { folderId: null, isHovering: false }
        }));
      }
      return;
    }

    // Use cursor position to find which folder is under the cursor
    // Temporarily hide dragged element to get accurate elementFromPoint result
    const draggedElement = element;
    if (!draggedElement) return; // Safety check
    const originalPointerEvents = draggedElement.style.pointerEvents;
    draggedElement.style.pointerEvents = 'none';

    // Cast Event to MouseEvent to access clientX/clientY
    const mouseEvent = e as MouseEvent;
    const elementUnderCursor = document.elementFromPoint(mouseEvent.clientX, mouseEvent.clientY);

    // Restore pointer events
    draggedElement.style.pointerEvents = originalPointerEvents;

    if (!elementUnderCursor) {
      if (hoveredFolderIdRef.current !== null) {
        hoveredFolderIdRef.current = null;
        window.dispatchEvent(new CustomEvent('folder-drag-hover', {
          detail: { folderId: null, isHovering: false }
        }));
      }
      return;
    }

    // Walk up the DOM tree to find folder element
    let current: HTMLElement | null = elementUnderCursor as HTMLElement;
    let folderElement: HTMLElement | null = null;

    while (current && current !== document.body) {
      // Check for data-folder-id attribute (we'll add this to FolderCard)
      if (current.dataset.folderId) {
        folderElement = current;
        break;
      }
      current = current.parentElement;
    }

    let hoveredFolder: string | null = null;
    if (folderElement) {
      hoveredFolder = folderElement.dataset.folderId || null;
    }

    // If dragging a folder onto another folder, check for circular references
    if (draggedItem.type === 'folder' && hoveredFolder) {
      // Prevent dropping folder onto itself
      if (draggedItemId === hoveredFolder) {
        hoveredFolder = null;
      } else {
        // Prevent dropping folder onto its descendant
        if (isDescendantOf(hoveredFolder, draggedItemId, allItemsRef.current)) {
          hoveredFolder = null;
        }
      }
    }

    // Calculate selected count - if dragged card is selected, count all selected, otherwise just 1
    const isDraggedCardSelected = selectedCardIds.has(draggedItemId);
    const selectedCount = isDraggedCardSelected ? selectedCardIds.size : 1;

    // Update hover state if changed
    if (hoveredFolder !== hoveredFolderIdRef.current) {
      hoveredFolderIdRef.current = hoveredFolder;
      window.dispatchEvent(new CustomEvent('folder-drag-hover', {
        detail: { folderId: hoveredFolder, isHovering: hoveredFolder !== null, selectedCount }
      }));
    } else if (hoveredFolder !== null) {
      // Even if folder hasn't changed, update selected count in case selection changed during drag
      window.dispatchEvent(new CustomEvent('folder-drag-hover', {
        detail: { folderId: hoveredFolder, isHovering: true, selectedCount }
      }));
    }
  }, [selectedCardIds]);

  // Handle resize start - track which item is being resized
  const handleResizeStart = useCallback((layout: Layout, oldItem: LayoutItem | null, newItem: LayoutItem | null, placeholder: LayoutItem | null, e: Event, element: HTMLElement | undefined) => {
    hasUserInteractedRef.current = true;
    // Track which item is being resized (same as drag)
    if (!oldItem) return;
    draggedItemIdRef.current = oldItem.i;
    // Note: resize doesn't trigger autoscroll, so we don't call onDragStart here
    onGridDragStateChange?.(true);
  }, [onGridDragStateChange]);

  // Handle drag stop - with RGL v2, this only fires for actual drags (not clicks)
  // Click handling is now done by individual card components via their onClick handlers
  const handleDragStop = useCallback((newLayout: Layout, oldItem: LayoutItem | null, newItem: LayoutItem | null, placeholder: LayoutItem | null, e: Event, element: HTMLElement | undefined) => {
    const draggedItemId = draggedItemIdRef.current;

    // If no drag was started (e.g., click on dropdown), exit early
    if (!draggedItemId) {
      onDragStop([]);
      onGridDragStateChange?.(false);
      return;
    }

    // Find the item
    const item = allItemsRef.current.find(i => i.id === draggedItemId);
    const isFolder = item?.type === 'folder';

    // Cancel any pending debounced update
    if (layoutChangeTimeoutRef.current) {
      clearTimeout(layoutChangeTimeoutRef.current);
    }

    // Always call onDragStop to reset auto-scroll state
    onDragStop(newLayout.length > 0 && !isFiltered ? [...newLayout] : []);

    // Don't save layout if in temporary filter mode (search)
    if (isTemporaryFilter) {
      hoveredFolderIdRef.current = null;
      draggedItemIdRef.current = null;
      onGridDragStateChange?.(false);
      return;
    }

    // Handle folder drop - if dropping on a folder, move the item (works for both items and folders)
    const hoveredFolderId = hoveredFolderIdRef.current;
    if (hoveredFolderId && draggedItemId) {
      // Check if dragged card is part of selection
      const isDraggedCardSelected = selectedCardIds.has(draggedItemId);
      const cardsToMove = isDraggedCardSelected
        ? Array.from(selectedCardIds)
        : [draggedItemId];

      // Filter out invalid moves (already in folder, circular references, etc.)
      const validCardsToMove: string[] = [];
      for (const cardId of cardsToMove) {
        const card = allItemsRef.current.find(i => i.id === cardId);
        if (!card) continue;

        // Skip if already in target folder
        if (card.folderId === hoveredFolderId) continue;

        // Check circular references for folders
        if (card.type === 'folder') {
          if (cardId === hoveredFolderId ||
            isDescendantOf(hoveredFolderId, cardId, allItemsRef.current)) {
            continue; // Skip invalid moves
          }
        }

        validCardsToMove.push(cardId);
      }

      // Use bulk move if multiple cards, otherwise use single move
      // Only proceed if we have at least one move handler
      if (validCardsToMove.length > 0 && (onMoveItem || onMoveItems)) {
        // Hide the card elements to prevent React Grid Layout from animating them back
        // Only hide if we're actually going to move them (handlers exist)
        for (const cardId of validCardsToMove) {
          const cardElement = document.querySelector(`[id="item-${cardId}"]`)?.closest('.react-grid-item') as HTMLElement;
          if (cardElement) {
            cardElement.style.display = 'none';
            cardElement.style.visibility = 'hidden';
            cardElement.style.opacity = '0';
            cardElement.style.pointerEvents = 'none';
          }
        }

        if (validCardsToMove.length === 1 && onMoveItem) {
          // Single item move
          onMoveItem(validCardsToMove[0], hoveredFolderId);
        } else if (validCardsToMove.length > 1 && onMoveItems) {
          // Bulk move
          onMoveItems(validCardsToMove, hoveredFolderId);
        } else if (onMoveItem) {
          // Fallback to single move if bulk not available
          validCardsToMove.forEach(cardId => onMoveItem(cardId, hoveredFolderId));
        }

        // Clear selection after successful move (only if we moved selected cards)
        if (isDraggedCardSelected) {
          clearCardSelection();
        }
      }

      // Clear state and exit
      hoveredFolderIdRef.current = null;
      window.dispatchEvent(new CustomEvent('folder-drag-hover', {
        detail: { folderId: null, isHovering: false }
      }));
      draggedItemIdRef.current = null;
      onGridDragStateChange?.(false);
      return;
    }

    // Check if layout actually changed (position or size)
    let layoutChanged = false;
    const newItemLayout = newLayout.find(l => l.i === draggedItemId);
    const currentItemLayout = layoutRef.current.find(l => l.i === draggedItemId);

    if (newItemLayout && currentItemLayout) {
      layoutChanged =
        newItemLayout.x !== currentItemLayout.x ||
        newItemLayout.y !== currentItemLayout.y ||
        newItemLayout.w !== currentItemLayout.w ||
        newItemLayout.h !== currentItemLayout.h;
    }

    if (layoutChanged) {
      // Save the new layout to the current breakpoint
      const updatedItems = updateItemsWithLayout(allItemsRef.current, [...newLayout], currentBreakpointRef.current);
      onUpdateAllItems(updatedItems);
    }

    // Clear hover state
    if (hoveredFolderIdRef.current !== null) {
      hoveredFolderIdRef.current = null;
      window.dispatchEvent(new CustomEvent('folder-drag-hover', {
        detail: { folderId: null, isHovering: false }
      }));
    }

    // Clear the dragged item reference
    draggedItemIdRef.current = null;
    onGridDragStateChange?.(false);
  }, [onDragStop, isFiltered, isTemporaryFilter, onGridDragStateChange, onUpdateAllItems, onMoveItem, onMoveItems, selectedCardIds]);

  // Handle resize to enforce constraints
  const handleResize = useCallback((layout: Layout, oldItem: LayoutItem | null, newItem: LayoutItem | null, placeholder: LayoutItem | null, e: Event, element: HTMLElement | undefined) => {
    // Enforce custom constraints for YouTube and single-column items
    if (!newItem) return;
    const itemData = allItemsRef.current.find(i => i.id === newItem.i);

    if (itemData) {
      if (itemData.type === 'youtube') {
        // Enforce height based on width for Youtube
        if (newItem.w === 4) newItem.h = 10;
        else if (newItem.w === 3) newItem.h = 8;
        else if (newItem.w === 2) newItem.h = 5;
      } else if (itemData.type === 'folder' || itemData.type === 'pdf' || itemData.type === 'flashcard') {
        // Folders, PDFs, and flashcards don't need minimum height enforcement - skip
      } else if (newItem.w >= 2) {
        // Enforce larger minimum height for non-YouTube/non-folder/non-PDF cards at width 2+
        newItem.h = Math.max(newItem.h, 9);
      } else if (newItem.w === 1 && currentBreakpointRef.current !== 'xxs') {
        // Auto min height for single column only if not in mobile view (where everything is w=1)
        newItem.h = 4;
      }

      // Sync placeholder if it exists
      if (placeholder) {
        placeholder.w = newItem.w;
        placeholder.h = newItem.h;
      }
    }
  }, []);

  // Handle resize stop - save immediately
  const handleResizeStop = useCallback((newLayout: Layout) => {
    // Cancel any pending debounced update
    if (layoutChangeTimeoutRef.current) {
      clearTimeout(layoutChangeTimeoutRef.current);
    }

    // Note: resize doesn't use autoscroll, but we call onDragStop anyway as a safety measure
    // in case there's any edge case where drag state got stuck
    onDragStop([]);

    // Don't save if in temporary filter mode (search), but folder views should save
    if (isTemporaryFilter) {
      onGridDragStateChange?.(false);
      draggedItemIdRef.current = null;
      return;
    }

    // For resize, we always save since resize always changes layout
    // Folders are now items with type: 'folder', so they're included in updateItemsWithLayout
    const updatedItems = updateItemsWithLayout(allItemsRef.current, [...newLayout], currentBreakpointRef.current);
    onUpdateAllItems(updatedItems);

    draggedItemIdRef.current = null;
    onGridDragStateChange?.(false);
  }, [isTemporaryFilter, onUpdateAllItems, onGridDragStateChange, onDragStop]);


  // Handle item updates - no automatic height recalculation
  // Height calculations are only used during initial card placement
  // Users can manually resize cards as needed
  // OPTIMIZED: Wrap parent callback to ensure stable reference
  const handleUpdateItem = useCallback((itemId: string, updates: Partial<Item>) => {
    onUpdateItem(itemId, updates);
  }, [onUpdateItem]);

  // OPTIMIZED: Wrap all callbacks to ensure stable references
  const handleDeleteItem = useCallback((itemId: string) => {
    onDeleteItem(itemId);
  }, [onDeleteItem]);

  const handleOpenModal = useCallback((itemId: string) => {
    onOpenModal(itemId);
  }, [onOpenModal]);

  const handleToggleSelection = useCallback((itemId: string) => {
    onToggleSelection(itemId);
  }, [onToggleSelection]);

  // Folder operation handler (folders are now items with type: 'folder')
  const handleOpenFolder = useCallback((folderId: string) => {
    onOpenFolder?.(folderId);
  }, [onOpenFolder]);

  // Create a map of folder item counts (for folder-type items)
  const folderItemCounts = useMemo(() => {
    const counts = new Map<string, number>();
    allItems.forEach(item => {
      if (item.folderId) {
        counts.set(item.folderId, (counts.get(item.folderId) || 0) + 1);
      }
    });
    return counts;
  }, [allItems]);

  // Collect existing colors for card color generation
  const existingColors = useMemo(() => {
    return itemsWithLayout
      .map(item => item.color)
      .filter(Boolean) as CardColor[];
  }, [itemsWithLayout]);


  // OPTIMIZED: Memoize array props to prevent ResponsiveGridLayout/DraggableCore re-renders
  // These arrays are recreated on every render, causing unnecessary re-renders
  const margin = useMemo(() => [16, 16] as [number, number], []);
  const containerPadding = useMemo(() => [16, 0] as [number, number], []);
  const resizeHandles = useMemo(() => ['s', 'w', 'e', 'n', 'se', 'sw', 'ne', 'nw'] as Array<'s' | 'w' | 'e' | 'n' | 'se' | 'sw' | 'ne' | 'nw'>, []);

  // OPTIMIZED: Create stable Set reference check - only recreate if Set contents changed
  // Convert Set to sorted array string for stable comparison
  const selectedCardIdsKey = useMemo(() => {
    return Array.from(selectedCardIds).sort().join(',');
  }, [selectedCardIds]);

  // OPTIMIZED: Create stable items key to prevent unnecessary children recreation
  // Only recreate children when items actually change (by ID/content), not just reference
  const itemsKey = useMemo(() => {
    return displayItems.map(item => `${item.id}:${item.name}:${item.type}`).join('|');
  }, [displayItems]);

  // Layout for all items (including folder-type items)
  const combinedLayout = useMemo(() => {
    const itemLayouts = itemsToLayout(displayItems);
    // Update layout ref
    layoutRef.current = itemLayouts;
    return itemLayouts;
  }, [displayItems]);

  // Memoize children to take advantage of ResponsiveGridLayout's shouldComponentUpdate optimization
  const children = useMemo(() => {
    return displayItems.map((item) => (
      <div key={item.id}>
        {item.type === 'folder' ? (
          <FolderCard
            item={item}
            itemCount={folderItemCounts.get(item.id) || 0}
            allItems={allItems}
            workspaceName={workspaceName}
            workspaceIcon={workspaceIcon}
            workspaceColor={workspaceColor}
            onOpenFolder={handleOpenFolder}
            onUpdateItem={handleUpdateItem}
            onDeleteItem={handleDeleteItem}
            onDeleteFolderWithContents={onDeleteFolderWithContents}
            onMoveItem={onMoveItem}
          />
        ) : item.type === 'flashcard' ? (
          <FlashcardWorkspaceCard
            item={item}
            allItems={allItems}
            workspaceName={workspaceName}
            workspaceIcon={workspaceIcon}
            workspaceColor={workspaceColor}
            onUpdateItem={handleUpdateItem}
            onDeleteItem={handleDeleteItem}
            onOpenModal={handleOpenModal}
            onMoveItem={onMoveItem}
          />
        ) : (
          <WorkspaceCard
            item={item}
            allItems={allItems}
            workspaceName={workspaceName}
            workspaceIcon={workspaceIcon}
            workspaceColor={workspaceColor}
            onUpdateItem={handleUpdateItem}
            onDeleteItem={handleDeleteItem}
            onOpenModal={handleOpenModal}
            existingColors={existingColors}
            onMoveItem={onMoveItem}
          />
        )}
      </div>
    ));
    // Use stable keys instead of object references to prevent unnecessary recreations
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    itemsKey, // Stable key based on item IDs/names/types - only changes when items actually change
    handleUpdateItem,
    handleDeleteItem,
    handleOpenModal,
    existingColors,
    onMoveItem,
    onDeleteFolderWithContents,
    handleOpenFolder,
    folderItemCounts,
    workspaceName,
    workspaceColor,
  ]);

  // Cleanup on unmount - ensure drag state is reset
  useEffect(() => {
    return () => {
      if (layoutChangeTimeoutRef.current) {
        clearTimeout(layoutChangeTimeoutRef.current);
      }
      // Ensure autoscroll state is cleaned up on unmount
      // This handles edge cases where component unmounts during drag
      onDragStop([]);
      onGridDragStateChange?.(false);
    };
  }, [onDragStop, onGridDragStateChange]);

  // Define breakpoints and columns
  const breakpoints = useMemo(() => ({ lg: 600, xxs: 0 }), []);
  const cols = useMemo(() => ({ lg: 4, xxs: 1 }), []);

  // Create layouts object for ResponsiveGridLayout with both breakpoints
  // Only provide xxs layout if at least one item has a saved xxs layout
  // Otherwise, let the library auto-generate from lg
  const hasAnyXxsLayout = useMemo(() =>
    itemsWithLayout.some(item => {
      if (!item.layout) return false;
      // Check if it's responsive format with xxs key
      return 'xxs' in item.layout && item.layout.xxs !== undefined;
    }), [itemsWithLayout]);
  const xxsLayout = useMemo(() => hasAnyXxsLayout ? itemsToLayout(itemsWithLayout, 'xxs') : [], [itemsWithLayout, hasAnyXxsLayout]);
  const layouts = useMemo(() => ({
    lg: combinedLayout,
    xxs: xxsLayout.length > 0 ? xxsLayout : undefined
  }), [combinedLayout, xxsLayout]);

  // Handle breakpoint changes to track current breakpoint for saving layouts
  const handleBreakpointChange = useCallback((newBreakpoint: string, newCols: number) => {
    currentBreakpointRef.current = newBreakpoint as 'lg' | 'xxs';
  }, []);

  return (
    <div className={`${selectedCardIds.size > 0 ? 'pb-20' : ''} size-full workspace-grid-container`} ref={containerRef}>
      <style>{`
        .react-grid-item {
          transition: transform 100ms ease-out !important;
        }
        .react-grid-item.react-grid-placeholder {
          transition: transform 100ms ease-out !important;
        }
        /* Hide resize handles when YouTube video is playing */
        .react-grid-item:has([data-youtube-playing="true"]) .react-resizable-handle {
          display: none !important;
        }
      `}</style>
      {mounted && (
        <ResponsiveGridLayout
          className="layout"
          width={width}
          layouts={layouts}
          breakpoints={breakpoints}
          cols={cols}
          rowHeight={30}
          margin={margin}
          containerPadding={containerPadding}

          dragConfig={{ enabled: true }}
          resizeConfig={{
            enabled: true,
            handles: resizeHandles,
          }}

          onLayoutChange={handleLayoutChange}
          onDragStart={handleDragStart}
          onDrag={handleDrag}
          onDragStop={handleDragStop}
          onResize={handleResize}
          onResizeStart={handleResizeStart}
          onResizeStop={handleResizeStop}
          onBreakpointChange={handleBreakpointChange}
          compactor={verticalCompactor}
        >
          {children}
        </ResponsiveGridLayout>
      )}
    </div>
  );
}
