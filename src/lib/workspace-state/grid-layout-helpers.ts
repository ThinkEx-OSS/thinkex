import type { Layout, LayoutItem } from "react-grid-layout";
import type { Item, CardType, LayoutPosition, ResponsiveLayouts } from "./types";

/**
 * Default dimensions for each card type in grid units
 */
export const DEFAULT_CARD_DIMENSIONS: Record<CardType, { w: number; h: number }> = {
  note: { w: 1, h: 4 },
  pdf: { w: 1, h: 4 },
  flashcard: { w: 2, h: 5 },
  folder: { w: 1, h: 4 },
  youtube: { w: 4, h: 10 },
  quiz: { w: 1, h: 4 },
  image: { w: 4, h: 10 },
};

/**
 * Helper to check if a layout is in the old flat format or new responsive format.
 * Old format: { x, y, w, h }
 * New format: { lg?: {...}, xxs?: {...} }
 */
function isLegacyLayout(layout: ResponsiveLayouts | LayoutPosition | undefined): layout is LayoutPosition {
  if (!layout) return false;
  // If it has 'x' property directly, it's the old flat format
  return 'x' in layout && typeof layout.x === 'number';
}

/**
 * Get the layout for a specific breakpoint from an item.
 * Handles backwards compatibility with old flat layout format.
 */
export function getLayoutForBreakpoint(item: Item, breakpoint: 'lg' | 'xxs'): LayoutPosition | undefined {
  if (!item.layout) return undefined;

  if (isLegacyLayout(item.layout)) {
    // Old format - treat as 'lg' layout
    return breakpoint === 'lg' ? item.layout : undefined;
  }

  // New format - get the specific breakpoint
  return item.layout[breakpoint];
}

/**
 * Calculates dynamic card height based on title and subtitle
 */
export function calculateCardHeight(
  name: string,
  subtitle: string
): number {
  const CHARS_PER_LINE_TITLE = 40;
  const CHARS_PER_LINE_SUBTITLE = 50;
  const TITLE_LINE_HEIGHT = 1.5;
  const SUBTITLE_LINE_HEIGHT = 1;
  const BASE_PADDING = 3;
  const MIN_HEIGHT = 4;
  const MAX_HEIGHT = 20;

  const titleLength = name?.length || 0;
  const titleLines = titleLength > 0 ? Math.ceil(titleLength / CHARS_PER_LINE_TITLE) : 1;
  const titleHeight = titleLines * TITLE_LINE_HEIGHT;

  const subtitleLength = subtitle?.length || 0;
  const subtitleLines = subtitleLength > 0 ? Math.ceil(subtitleLength / CHARS_PER_LINE_SUBTITLE) : 0;
  const subtitleHeight = subtitleLines * SUBTITLE_LINE_HEIGHT;

  const calculatedHeight = BASE_PADDING + titleHeight + subtitleHeight;

  // Simply return MIN_HEIGHT as requested by user
  return MIN_HEIGHT;
}

export const DEFAULT_COLS = 4;

/**
 * Convert items to LayoutItem array for a specific breakpoint.
 */
export function itemsToLayout(items: Item[], breakpoint: 'lg' | 'xxs' = 'lg'): LayoutItem[] {
  return items.map((item) => {
    const layout = getLayoutForBreakpoint(item, breakpoint);

    // Special constraints for YouTube videos to maintain proper aspect ratios
    if (item.type === 'youtube') {
      return {
        i: item.id,
        x: layout?.x ?? 0,
        y: layout?.y ?? 0,
        w: layout?.w ?? DEFAULT_CARD_DIMENSIONS[item.type].w,
        h: layout?.h ?? DEFAULT_CARD_DIMENSIONS[item.type].h,
        minW: 2, // Minimum width to keep video readable
        minH: 5, // Minimum height for controls
        maxW: 4, // Maximum width (full grid)
        maxH: 11, // Constant maximum height
      };
    }

    // Apply exact same resize constraints for images as YouTube cards
    if (item.type === 'image') {
      return {
        i: item.id,
        x: layout?.x ?? 0,
        y: layout?.y ?? 0,
        w: layout?.w ?? DEFAULT_CARD_DIMENSIONS[item.type].w,
        h: layout?.h ?? DEFAULT_CARD_DIMENSIONS[item.type].h,
        minW: 1, // Allow narrow 1-column images
        minH: 3, // Minimum height for 1-col images (fits 4:3 and 3:2 roughly)
        maxW: 4,
        maxH: 20, // Increased to support tall/square images
      };
    }

    // Folders are anchor items - they act as obstacles but can be dragged/resized
    if (item.type === 'folder') {
      return {
        i: item.id,
        x: layout?.x ?? 0,
        y: layout?.y ?? 0,
        w: layout?.w ?? DEFAULT_CARD_DIMENSIONS[item.type].w,
        h: layout?.h ?? DEFAULT_CARD_DIMENSIONS[item.type].h,
        minW: 1,
        minH: 4,
        maxW: 4,
        maxH: 25,
        anchor: true, // Anchor items act as obstacles but can be moved
      };
    }

    // Default constraints for other card types
    return {
      i: item.id,
      x: layout?.x ?? 0,
      y: layout?.y ?? 0,
      w: layout?.w ?? DEFAULT_CARD_DIMENSIONS[item.type].w,
      h: layout?.h ?? DEFAULT_CARD_DIMENSIONS[item.type].h,
      minW: 1,
      minH: 4,
      maxW: 4,
      maxH: 25,
    };
  });
}

export function findNextAvailablePosition(
  existingItems: Item[],
  newItemType: CardType,
  cols: number = DEFAULT_COLS,
  newItemName: string = "",
  newItemSubtitle: string = "",
  customW?: number,
  customH?: number
): { x: number; y: number; w: number; h: number } {
  const validType = (newItemType in DEFAULT_CARD_DIMENSIONS) ? newItemType : 'note';
  const dimensions = DEFAULT_CARD_DIMENSIONS[validType];
  const w = customW ?? Math.min(dimensions.w, cols);
  // Use default dimensions height instead of calculateCardHeight to ensure quiz cards get height 13
  const h = customH ?? dimensions.h;

  if (existingItems.length === 0) {
    return { x: 0, y: 0, w, h };
  }

  const columnHeights = new Array(cols).fill(0);

  existingItems.forEach((item) => {
    const layout = getLayoutForBreakpoint(item, 'lg');
    const x = layout?.x ?? 0;
    const y = layout?.y ?? 0;
    // Use default dimensions height as fallback instead of calculateCardHeight
    const itemH = layout?.h ?? DEFAULT_CARD_DIMENSIONS[item.type]?.h ?? 4;

    const itemW = layout?.w ?? DEFAULT_CARD_DIMENSIONS[item.type]?.w ?? 1;

    // Update heights for all columns this item spans
    for (let i = 0; i < itemW; i++) {
      const currentX = x + i;
      if (currentX < cols) {
        const bottomOfItem = y + itemH;
        columnHeights[currentX] = Math.max(columnHeights[currentX], bottomOfItem);
      }
    }
  });

  let shortestColumn = 0;
  let shortestHeight = columnHeights[0];

  for (let col = 1; col < cols; col++) {
    if (columnHeights[col] < shortestHeight) {
      shortestHeight = columnHeights[col];
      shortestColumn = col;
    }
  }

  return { x: shortestColumn, y: shortestHeight, w, h };
}

/**
 * Generate missing layouts for items that don't have them.
 * Works with the 'lg' breakpoint by default.
 */
export function generateMissingLayouts(items: Item[], cols: number = DEFAULT_COLS, breakpoint: 'lg' | 'xxs' = 'lg'): Item[] {
  const result: Item[] = [];

  items.forEach((item) => {
    const existingLayout = getLayoutForBreakpoint(item, breakpoint);

    if (existingLayout) {
      const adjustedLayout = {
        ...existingLayout,
        x: Math.min(existingLayout.x, cols - existingLayout.w),
        w: Math.min(existingLayout.w, cols),
      };

      if (adjustedLayout.x < 0) {
        adjustedLayout.x = 0;
      }

      // Preserve the responsive structure
      const newLayouts: ResponsiveLayouts = isLegacyLayout(item.layout)
        ? { [breakpoint]: adjustedLayout }
        : { ...item.layout as ResponsiveLayouts, [breakpoint]: adjustedLayout };

      result.push({
        ...item,
        layout: newLayouts,
      });
    } else {
      const position = findNextAvailablePosition(result, item.type, cols, item.name, item.subtitle);

      // For items without layout, create new responsive structure
      const existingResponsive = isLegacyLayout(item.layout)
        ? { lg: item.layout }
        : (item.layout as ResponsiveLayouts | undefined) ?? {};

      result.push({
        ...item,
        layout: { ...existingResponsive, [breakpoint]: position },
      });
    }
  });

  return result;
}

export function recompactLayout(items: Item[], cols: number): Item[] {
  if (items.length === 0) return items;

  const sortedItems = [...items].sort((a, b) => {
    const aLayout = getLayoutForBreakpoint(a, 'lg');
    const bLayout = getLayoutForBreakpoint(b, 'lg');
    const aY = aLayout?.y ?? 0;
    const bY = bLayout?.y ?? 0;
    if (aY !== bY) return aY - bY;
    return (aLayout?.x ?? 0) - (bLayout?.x ?? 0);
  });

  const columnHeights = new Array(cols).fill(0);

  return sortedItems.map((item) => {
    const existingLayout = getLayoutForBreakpoint(item, 'lg');
    // Use default dimensions height as fallback instead of calculateCardHeight to ensure quiz cards get height 13
    const h = existingLayout?.h ?? DEFAULT_CARD_DIMENSIONS[item.type]?.h ?? 4;
    const dimensions = existingLayout
      ? { w: Math.min(existingLayout.w, cols), h }
      : { w: DEFAULT_CARD_DIMENSIONS[item.type].w, h: DEFAULT_CARD_DIMENSIONS[item.type].h };

    const w = Math.min(dimensions.w, cols);

    let bestColumn = 0;
    let minHeight = columnHeights[0];

    for (let col = 0; col <= cols - w; col++) {
      let maxHeightInRange = columnHeights[col];
      for (let i = col; i < col + w; i++) {
        maxHeightInRange = Math.max(maxHeightInRange, columnHeights[i] || 0);
      }

      if (maxHeightInRange < minHeight) {
        minHeight = maxHeightInRange;
        bestColumn = col;
      }
    }

    const y = minHeight;
    for (let i = bestColumn; i < bestColumn + w; i++) {
      columnHeights[i] = y + dimensions.h;
    }

    const newPosition: LayoutPosition = {
      x: bestColumn,
      y,
      w,
      h: dimensions.h,
    };

    // Preserve existing responsive layouts
    const existingResponsive = isLegacyLayout(item.layout)
      ? {}
      : (item.layout as ResponsiveLayouts | undefined) ?? {};

    return {
      ...item,
      layout: { ...existingResponsive, lg: newPosition },
    };
  });
}

export function hasLayoutChanged(items: Item[], newLayout: LayoutItem[], breakpoint: 'lg' | 'xxs' = 'lg'): boolean {
  const itemsMap = new Map(items.map((item) => [item.id, item]));

  return newLayout.some((newItem) => {
    const currentItem = itemsMap.get(newItem.i);
    const currentLayout = currentItem ? getLayoutForBreakpoint(currentItem, breakpoint) : undefined;
    return (
      !currentItem ||
      !currentLayout ||
      currentLayout.x !== newItem.x ||
      currentLayout.y !== newItem.y ||
      currentLayout.w !== newItem.w ||
      currentLayout.h !== newItem.h
    );
  });
}

/**
 * Update items with new layout positions for a specific breakpoint.
 * When saving to 'lg' (4-column), clears 'xxs' so it regenerates from lg.
 */
export function updateItemsWithLayout(items: Item[], layout: LayoutItem[], breakpoint: 'lg' | 'xxs' = 'lg'): Item[] {
  const itemLayoutMap = new Map(layout.map((l) => [l.i, l]));

  return items.map((item) => {
    const newLayoutItem = itemLayoutMap.get(item.id);
    if (newLayoutItem) {
      const newPosition: LayoutPosition = {
        x: newLayoutItem.x,
        y: newLayoutItem.y,
        w: newLayoutItem.w,
        h: newLayoutItem.h,
      };

      // Preserve existing responsive layouts, update only the current breakpoint
      const existingResponsive = isLegacyLayout(item.layout)
        ? { lg: item.layout }
        : (item.layout as ResponsiveLayouts | undefined) ?? {};

      // When saving to 'lg', clear 'xxs' so it regenerates from the updated lg layout
      if (breakpoint === 'lg') {
        return {
          ...item,
          layout: { lg: newPosition }, // Clear xxs by only keeping lg
        };
      }

      return {
        ...item,
        layout: { ...existingResponsive, [breakpoint]: newPosition },
      };
    }
    return item;
  });
}

export function moveItemToTopLayout(items: Item[], itemId: string): Item[] {
  return items.map((item) => {
    const existingLayout = getLayoutForBreakpoint(item, 'lg');
    if (item.id === itemId && existingLayout) {
      const newPosition: LayoutPosition = { ...existingLayout, y: 0 };

      const existingResponsive = isLegacyLayout(item.layout)
        ? {}
        : (item.layout as ResponsiveLayouts | undefined) ?? {};

      return {
        ...item,
        layout: { ...existingResponsive, lg: newPosition },
      };
    }
    return item;
  });
}

export function moveItemToBottomLayout(items: Item[], itemId: string): Item[] {
  const maxY = Math.max(
    0,
    ...items.map((item) => {
      const layout = getLayoutForBreakpoint(item, 'lg');
      return item.id !== itemId && layout
        ? layout.y + layout.h
        : 0;
    })
  );

  return items.map((item) => {
    const existingLayout = getLayoutForBreakpoint(item, 'lg');
    if (item.id === itemId && existingLayout) {
      const newPosition: LayoutPosition = { ...existingLayout, y: maxY };

      const existingResponsive = isLegacyLayout(item.layout)
        ? {}
        : (item.layout as ResponsiveLayouts | undefined) ?? {};

      return {
        ...item,
        layout: { ...existingResponsive, lg: newPosition },
      };
    }
    return item;
  });
}