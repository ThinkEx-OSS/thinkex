import type { Layout, LayoutItem } from "react-grid-layout";
import type { Item, CardType, LayoutPosition, ResponsiveLayouts } from "./types";

/**
 * Canonical grid sizing model.
 * A compact card (note/pdf/folder) is exactly 1 height unit.
 */
export const COMPACT_CARD_HEIGHT_UNITS = 1;
export const GRID_ROW_HEIGHT_PX = 148;
export const GRID_GAP_PX = 16;
export const LEGACY_TO_BASE_HEIGHT_RATIO = 4;

/**
 * Default dimensions for each card type in grid units
 */
export const DEFAULT_CARD_DIMENSIONS: Record<CardType, { w: number; h: number }> = {
  note: { w: 1, h: COMPACT_CARD_HEIGHT_UNITS },
  pdf: { w: 1, h: COMPACT_CARD_HEIGHT_UNITS },
  flashcard: { w: 2, h: COMPACT_CARD_HEIGHT_UNITS },
  folder: { w: 1, h: COMPACT_CARD_HEIGHT_UNITS },
  youtube: { w: 1, h: 1 },
  quiz: { w: 2, h: 3 },
  image: { w: 4, h: 3 },
  audio: { w: 2, h: 2 },
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

function shouldMigrateLegacyScale(itemType: CardType, layout: LayoutPosition): boolean {
  // Detect old 25px-row model values and migrate to the compact=1 model once.
  // Thresholds are type-aware so migrated layouts won't be remigrated.
  switch (itemType) {
    case "note":
    case "pdf":
    case "folder":
      return layout.h >= 4;
    case "flashcard":
      return layout.h >= 5;
    case "youtube":
      return layout.h >= 4;
    case "quiz":
      return layout.h >= 8;
    case "audio":
      return layout.h >= 8;
    case "image":
      return layout.h >= 7;
    default:
      return layout.h >= 8;
  }
}

function migrateLegacyLayoutScale(itemType: CardType, layout: LayoutPosition): LayoutPosition {
  if (!shouldMigrateLegacyScale(itemType, layout)) return layout;
  return {
    ...layout,
    y: Math.max(0, Math.round(layout.y / LEGACY_TO_BASE_HEIGHT_RATIO)),
    h: Math.max(COMPACT_CARD_HEIGHT_UNITS, Math.round(layout.h / LEGACY_TO_BASE_HEIGHT_RATIO)),
  };
}

/**
 * Get the layout for a specific breakpoint from an item.
 * Handles backwards compatibility with old flat layout format.
 */
export function getLayoutForBreakpoint(item: Item, breakpoint: 'lg' | 'xxs'): LayoutPosition | undefined {
  if (!item.layout) return undefined;

  const normalize = (layout: LayoutPosition): LayoutPosition => {
    let sanitized: LayoutPosition = {
      x: Math.max(0, Math.round(layout.x)),
      y: Math.max(0, Math.round(layout.y)),
      w: Math.max(1, Math.round(layout.w)),
      h: Math.max(COMPACT_CARD_HEIGHT_UNITS, Math.round(layout.h)),
    };
    sanitized = migrateLegacyLayoutScale(item.type, sanitized);
    // YouTube: clamp to 1x1 (legacy cards may have w=2)
    if (item.type === 'youtube') {
      sanitized = { ...sanitized, w: 1, h: COMPACT_CARD_HEIGHT_UNITS };
    }
    return sanitized;
  };

  if (isLegacyLayout(item.layout)) {
    // Old format - treat as 'lg' layout
    return breakpoint === 'lg' ? normalize(item.layout) : undefined;
  }

  // New format - get the specific breakpoint
  const layout = item.layout[breakpoint];
  return layout ? normalize(layout) : undefined;
}

export const DEFAULT_COLS = 4;

/**
 * Convert items to LayoutItem array for a specific breakpoint.
 */
export function itemsToLayout(items: Item[], breakpoint: 'lg' | 'xxs' = 'lg'): LayoutItem[] {
  return items.map((item) => {
    const layout = getLayoutForBreakpoint(item, breakpoint);

    // YouTube: fixed at 1x1; no resize handles
    if (item.type === 'youtube') {
      return {
        i: item.id,
        x: layout?.x ?? 0,
        y: layout?.y ?? 0,
        w: layout?.w ?? DEFAULT_CARD_DIMENSIONS[item.type].w,
        h: layout?.h ?? DEFAULT_CARD_DIMENSIONS[item.type].h,
        minW: 1,
        minH: COMPACT_CARD_HEIGHT_UNITS,
        maxW: 1,
        maxH: COMPACT_CARD_HEIGHT_UNITS,
        isResizable: false,
      };
    }

    // Images: flexible aspect ratios with width-driven height snapping
    if (item.type === 'image') {
      return {
        i: item.id,
        x: layout?.x ?? 0,
        y: layout?.y ?? 0,
        w: layout?.w ?? DEFAULT_CARD_DIMENSIONS[item.type].w,
        h: layout?.h ?? DEFAULT_CARD_DIMENSIONS[item.type].h,
        minW: 1, // Allow narrow 1-column images
        minH: COMPACT_CARD_HEIGHT_UNITS,
        maxW: 4,
        maxH: 6,
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
        minH: COMPACT_CARD_HEIGHT_UNITS,
        maxW: 4,
        maxH: 7,
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
      minH: COMPACT_CARD_HEIGHT_UNITS,
      maxW: 4,
      maxH: 7,
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
  customH?: number,
  breakpoint: 'lg' | 'xxs' = 'lg'
): { x: number; y: number; w: number; h: number } {
  const validType = (newItemType in DEFAULT_CARD_DIMENSIONS) ? newItemType : 'note';
  const dimensions = DEFAULT_CARD_DIMENSIONS[validType];
  const w = customW ?? Math.min(dimensions.w, cols);
  const h = customH ?? dimensions.h;

  if (existingItems.length === 0) {
    return { x: 0, y: 0, w, h };
  }

  // Build an occupancy grid so we can detect gaps between items, not just column bottoms.
  // Find the maximum Y (bottom edge) across all existing items.
  let maxY = 0;
  const occupiedRects: { x: number; y: number; w: number; h: number }[] = [];

  existingItems.forEach((item) => {
    const layout = getLayoutForBreakpoint(item, breakpoint);
    const ix = layout?.x ?? 0;
    const iy = layout?.y ?? 0;
    const iw = layout?.w ?? DEFAULT_CARD_DIMENSIONS[item.type]?.w ?? 1;
    const ih = layout?.h ?? DEFAULT_CARD_DIMENSIONS[item.type]?.h ?? COMPACT_CARD_HEIGHT_UNITS;
    occupiedRects.push({ x: ix, y: iy, w: iw, h: ih });
    maxY = Math.max(maxY, iy + ih);
  });

  // Check if a w×h block at (startX, startY) overlaps any occupied rect
  function isPositionFree(startX: number, startY: number): boolean {
    for (const rect of occupiedRects) {
      // Two rectangles overlap if they overlap on both axes
      if (
        startX < rect.x + rect.w &&
        startX + w > rect.x &&
        startY < rect.y + rect.h &&
        startY + h > rect.y
      ) {
        return false;
      }
    }
    return true;
  }

  // Scan row-by-row, column-by-column for the first position that fits.
  // This naturally fills gaps left by deleted or moved items.
  // We scan up to maxY (to find gaps) and then one row beyond (guaranteed empty).
  for (let y = 0; y <= maxY; y++) {
    for (let x = 0; x <= cols - w; x++) {
      if (isPositionFree(x, y)) {
        return { x, y, w, h };
      }
    }
  }

  // Fallback: place below everything (should always be reached by the loop above at y=maxY)
  return { x: 0, y: maxY, w, h };
}

/** Default height for all items in xxs (single-column) mode */
export const XXS_DEFAULT_HEIGHT = 3;

/**
 * Generate missing layouts for items that don't have them.
 * Works with the 'lg' breakpoint by default.
 * In xxs mode, new layouts use h=10 by default for consistent single-column stacking.
 */
export function generateMissingLayouts(items: Item[], cols: number = DEFAULT_COLS, breakpoint: 'lg' | 'xxs' = 'lg'): Item[] {
  const result: Item[] = [];

  // For xxs, sort by lg position so stacking order matches 4-col visual order
  const itemsToProcess =
    breakpoint === 'xxs'
      ? [...items].sort((a, b) => {
          const aLg = getLayoutForBreakpoint(a, 'lg');
          const bLg = getLayoutForBreakpoint(b, 'lg');
          const aY = aLg?.y ?? 0;
          const bY = bLg?.y ?? 0;
          if (aY !== bY) return aY - bY;
          return (aLg?.x ?? 0) - (bLg?.x ?? 0);
        })
      : items;

  itemsToProcess.forEach((item) => {
    const existingLayout = getLayoutForBreakpoint(item, breakpoint);

    if (existingLayout) {
      // Clamp width first, then compute x based on the clamped width
      const clampedW = Math.min(existingLayout.w, cols);
      const adjustedLayout = {
        ...existingLayout,
        w: clampedW,
        x: Math.max(0, Math.min(existingLayout.x, cols - clampedW)),
      };

      // Preserve the responsive structure
      const newLayouts: ResponsiveLayouts = isLegacyLayout(item.layout)
        ? { [breakpoint]: adjustedLayout }
        : { ...item.layout as ResponsiveLayouts, [breakpoint]: adjustedLayout };

      result.push({
        ...item,
        layout: newLayouts,
      });
    } else {
      const position =
        breakpoint === 'xxs'
          ? findNextAvailablePosition(
              result,
              item.type,
              cols,
              item.name,
              item.subtitle,
              1, // w=1 for single column
              item.type === 'folder' || item.type === 'flashcard' || item.type === 'youtube' ? undefined : XXS_DEFAULT_HEIGHT,
              'xxs'
            )
          : findNextAvailablePosition(result, item.type, cols, item.name, item.subtitle);

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
    const h = existingLayout?.h ?? DEFAULT_CARD_DIMENSIONS[item.type]?.h ?? COMPACT_CARD_HEIGHT_UNITS;
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