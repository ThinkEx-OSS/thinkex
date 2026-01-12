/**
 * Utility functions for marquee selection
 */

export interface Rectangle {
  top: number;
  left: number;
  bottom: number;
  right: number;
  width: number;
  height: number;
}

/**
 * Get the bounding rectangle for a card element
 */
export function calculateCardBounds(itemId: string, scrollContainer: HTMLElement | null): Rectangle | null {
  const element = document.getElementById(`item-${itemId}`);
  if (!element || !scrollContainer) return null;

  const cardRect = element.getBoundingClientRect();
  const containerRect = scrollContainer.getBoundingClientRect();

  // Convert to container-relative coordinates
  return {
    top: cardRect.top - containerRect.top + scrollContainer.scrollTop,
    left: cardRect.left - containerRect.left + scrollContainer.scrollLeft,
    bottom: cardRect.bottom - containerRect.top + scrollContainer.scrollTop,
    right: cardRect.right - containerRect.left + scrollContainer.scrollLeft,
    width: cardRect.width,
    height: cardRect.height,
  };
}

/**
 * Check if two rectangles intersect
 */
export function isRectIntersecting(rect1: Rectangle, rect2: Rectangle): boolean {
  return !(
    rect1.right < rect2.left ||
    rect1.left > rect2.right ||
    rect1.bottom < rect2.top ||
    rect1.top > rect2.bottom
  );
}

/**
 * Get all card IDs that intersect with the marquee rectangle
 */
export function getIntersectingCards(
  marqueeRect: Rectangle,
  cardIds: string[],
  scrollContainer: HTMLElement | null
): string[] {
  const intersectingIds: string[] = [];

  for (const cardId of cardIds) {
    const cardBounds = calculateCardBounds(cardId, scrollContainer);
    if (cardBounds && isRectIntersecting(marqueeRect, cardBounds)) {
      intersectingIds.push(cardId);
    }
  }

  return intersectingIds;
}

/**
 * Create a rectangle from two points (start and end)
 */
export function createRectFromPoints(
  startX: number,
  startY: number,
  endX: number,
  endY: number
): Rectangle {
  const left = Math.min(startX, endX);
  const right = Math.max(startX, endX);
  const top = Math.min(startY, endY);
  const bottom = Math.max(startY, endY);

  return {
    left,
    right,
    top,
    bottom,
    width: right - left,
    height: bottom - top,
  };
}

