/**
 * Native text highlighting utilities using the browser's Selection API
 * Replaces the rangy library with modern DOM manipulation
 */

export interface HighlightElement {
  id: string;
  element: HTMLElement;
  text: string;
}

/**
 * Wraps a Range with a highlight element (mark or span)
 * Handles complex cases like multi-node selections
 */
export function highlightRange(
  range: Range,
  highlightId: string,
  className: string = 'text-highlight'
): HighlightElement | null {
  try {
    // Clone the range to avoid modifying the original
    const clonedRange = range.cloneRange();

    // Create the highlight element
    const mark = document.createElement('mark');
    mark.className = className;
    mark.dataset.highlightId = highlightId;

    // Try to use surroundContents first (simplest case)
    try {
      clonedRange.surroundContents(mark);
      return {
        id: highlightId,
        element: mark,
        text: mark.textContent || '',
      };
    } catch {
      // surroundContents fails if the range partially selects nodes
      // Fall back to manual wrapping
      return highlightRangeManually(clonedRange, highlightId, className);
    }
  } catch (error) {
    console.error('Error highlighting range:', error);
    return null;
  }
}

/**
 * Manually wraps a complex range by walking text nodes and wrapping segments
 * Handles cases where surroundContents() fails without breaking DOM structure
 */
function highlightRangeManually(
  range: Range,
  highlightId: string,
  className: string
): HighlightElement | null {
  try {
    const textNodes = getTextNodesInRange(range);
    const markElements: HTMLElement[] = [];
    let fullText = '';

    for (const textNode of textNodes) {
      const { startOffset, endOffset } = getTextNodeOffsets(textNode, range);
      const textContent = textNode.textContent || '';

      if (startOffset >= endOffset) continue;

      const selectedText = textContent.substring(startOffset, endOffset);
      fullText += selectedText;

      // Split the text node at the selection boundaries
      const beforeText = textContent.substring(0, startOffset);
      const afterText = textContent.substring(endOffset);

      // Create the mark element for this segment
      const mark = document.createElement('mark');
      mark.className = className;
      mark.dataset.highlightId = highlightId;
      mark.textContent = selectedText;

      // Replace the text node with: [beforeText] + [mark] + [afterText]
      const parent = textNode.parentNode;
      if (!parent) continue;

      // Create a document fragment to hold all the new nodes
      const fragment = document.createDocumentFragment();

      // Add before text if it exists
      if (beforeText) {
        fragment.appendChild(document.createTextNode(beforeText));
      }

      // Add the mark element
      fragment.appendChild(mark);
      markElements.push(mark);

      // Add after text if it exists
      if (afterText) {
        fragment.appendChild(document.createTextNode(afterText));
      }

      // Replace the original text node with the fragment
      // Validate parent still contains textNode before replacing
      try {
        if (parent.contains(textNode)) {
          parent.replaceChild(fragment, textNode);
        }
      } catch (error) {
        // replaceChild failed - textNode may have been removed
        // This can happen during thread switches
        continue;
      }
    }

    // Return the first mark element as the primary reference
    // All marks share the same highlightId for grouped removal
    return markElements.length > 0 ? {
      id: highlightId,
      element: markElements[0],
      text: fullText,
    } : null;
  } catch (error) {
    console.error('Error in manual highlight:', error);
    return null;
  }
}

/**
 * Gets all text nodes within a range
 */
function getTextNodesInRange(range: Range): Text[] {
  const textNodes: Text[] = [];
  const walker = document.createTreeWalker(
    range.commonAncestorContainer,
    NodeFilter.SHOW_TEXT,
    {
      acceptNode: (node) => {
        if (!range.intersectsNode(node)) {
          return NodeFilter.FILTER_REJECT;
        }
        return NodeFilter.FILTER_ACCEPT;
      }
    }
  );

  let node;
  while (node = walker.nextNode()) {
    textNodes.push(node as Text);
  }

  return textNodes;
}

/**
 * Gets the start and end offsets of a text node within a range
 */
function getTextNodeOffsets(textNode: Text, range: Range): { startOffset: number; endOffset: number } {
  const rangeStart = range.startContainer === textNode ? range.startOffset : 0;
  const rangeEnd = range.endContainer === textNode ? range.endOffset : textNode.textContent?.length || 0;

  return {
    startOffset: rangeStart,
    endOffset: rangeEnd
  };
}

/**
 * Removes a highlight element and restores the original text
 * If the element has a highlightId, removes all marks with the same ID
 */
export function removeHighlight(element: HTMLElement, container?: HTMLElement): void {
  try {
    const highlightId = element.dataset.highlightId;

    if (highlightId) {
      // Remove all marks with the same highlight ID
      removeHighlightById(highlightId, container);
    } else {
      // Single element removal (legacy behavior)
      removeSingleHighlight(element);
    }
  } catch (error) {
    console.error('Error removing highlight:', error);
  }
}

/**
 * Removes all mark elements with a specific highlight ID
 */
function removeHighlightById(highlightId: string, container?: HTMLElement): void {
  try {
    // Find all marks with this highlight ID
    let marks: NodeListOf<Element>;

    if (container && container.querySelectorAll) {
      // Container is an HTMLElement with querySelectorAll
      marks = container.querySelectorAll(`mark[data-highlight-id="${highlightId}"]`);
    } else {
      // Fallback to document search
      marks = document.querySelectorAll(`mark[data-highlight-id="${highlightId}"]`);
    }

    marks.forEach(mark => {
      removeSingleHighlight(mark as HTMLElement);
    });
  } catch (error) {
    console.error('Error removing highlight by ID:', error);
  }
}

/**
 * Removes a single highlight element and restores the original text
 */
function removeSingleHighlight(element: HTMLElement): void {
  try {
    const parent = element.parentNode;
    if (!parent) return;

    // Check if element is still a child of parent before removing
    if (!parent.contains(element)) {
      return;
    }

    // Move all child nodes out of the highlight element
    // Validate on each iteration since DOM might change during thread switches
    while (element.firstChild) {
      // Double-check conditions before each insertBefore call
      if (!parent.contains(element)) {
        // Element is no longer a child, stop processing
        break;
      }

      const firstChild = element.firstChild;
      if (!firstChild) {
        // No more children, exit loop
        break;
      }

      try {
        // Verify element is still a child before inserting
        if (parent.contains(element)) {
          parent.insertBefore(firstChild, element);
        } else {
          // Element was removed during processing, stop
          break;
        }
      } catch (error) {
        // insertBefore failed - element or parent may have changed
        // This can happen during thread switches when DOM is being cleaned up
        break;
      }
    }

    // Remove the now-empty highlight element
    // Double-check element is still a child before removing
    if (parent.contains(element)) {
      try {
        parent.removeChild(element);
      } catch (error) {
        // Element may have been removed by another process
        // This is fine during thread switches
      }
    }

    // Merge adjacent text nodes only if parent is still valid
    try {
      if (parent.parentNode) {
        parent.normalize();
      }
    } catch (error) {
      // normalize may fail if parent is detached
      // Ignore during thread switches
    }
  } catch (error) {
    // Ignore errors - element may have already been removed
    // This can happen during thread switches when DOM is being cleaned up
  }
}

/**
 * Finds all highlight elements in a container
 */
export function findHighlightElements(
  container: HTMLElement,
  className: string = 'text-highlight'
): HTMLElement[] {
  return Array.from(
    container.querySelectorAll<HTMLElement>(`mark.${className}`)
  );
}

/**
 * Removes all highlights from a container
 * Now searches by data-highlight-id to support custom colored highlights
 */
export function clearAllHighlights(
  container: HTMLElement,
  className: string = 'text-highlight'
): void {
  // Find all mark elements with data-highlight-id (works for all highlight types)
  const highlightsWithId = Array.from(
    container.querySelectorAll<HTMLElement>('mark[data-highlight-id]')
  );

  // Also find legacy highlights by class name (for backwards compatibility)
  const legacyHighlights = findHighlightElements(container, className);

  // Combine and deduplicate
  const allHighlights = [...new Set([...highlightsWithId, ...legacyHighlights])];

  // Remove all highlights
  allHighlights.forEach(element => removeHighlight(element, container));

  // Also normalize the container to clean up any remaining text node issues
  container.normalize();
}

/**
 * Finds a highlight element by its ID
 * Returns the first mark element with the given ID
 */
export function findHighlightById(
  container: HTMLElement,
  highlightId: string
): HTMLElement | null {
  return container.querySelector<HTMLElement>(
    `mark[data-highlight-id="${highlightId}"]`
  );
}

/**
 * Finds all highlight elements by their ID
 * Returns all mark elements with the given ID
 */
export function findAllHighlightById(
  container: HTMLElement,
  highlightId: string
): HTMLElement[] {
  return Array.from(
    container.querySelectorAll<HTMLElement>(
      `mark[data-highlight-id="${highlightId}"]`
    )
  );
}

/**
 * Generates a unique highlight ID
 */
export function generateHighlightId(): string {
  return `highlight-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Serializes a range for storage
 */
export function serializeRange(range: Range): {
  startContainer: string;
  startOffset: number;
  endContainer: string;
  endOffset: number;
} {
  return {
    startContainer: range.startContainer.nodeName,
    startOffset: range.startOffset,
    endContainer: range.endContainer.nodeName,
    endOffset: range.endOffset,
  };
}

/**
 * Checks if a selection/range intersects with existing highlights
 * Useful for preventing overlapping highlights
 */
export function hasOverlappingHighlights(
  range: Range,
  container: HTMLElement,
  className: string = 'text-highlight'
): boolean {
  const highlights = findHighlightElements(container, className);

  for (const highlight of highlights) {
    const highlightRange = document.createRange();
    highlightRange.selectNodeContents(highlight);

    // Check if ranges intersect
    if (
      range.compareBoundaryPoints(Range.END_TO_START, highlightRange) < 0 &&
      range.compareBoundaryPoints(Range.START_TO_END, highlightRange) > 0
    ) {
      return true;
    }
  }

  return false;
}

