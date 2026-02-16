import { useEffect, useState, RefObject } from 'react';

/**
 * Hook to measure the width and height of an element using ResizeObserver
 * @param ref - Ref to the element to measure
 * @returns The current width and height of the element in pixels
 */
export function useElementSize(
  ref: RefObject<HTMLElement | null>
): { width: number | undefined; height: number | undefined } {
  const [size, setSize] = useState<{ width: number | undefined; height: number | undefined }>({
    width: undefined,
    height: undefined,
  });

  useEffect(() => {
    const element = ref.current;
    if (!element) return;

    // Set initial size
    setSize({ width: element.offsetWidth, height: element.offsetHeight });

    // Create ResizeObserver to watch for size changes
    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const box = entry.borderBoxSize?.[0];
        const newWidth = box?.inlineSize ?? entry.contentRect.width;
        const newHeight = box?.blockSize ?? entry.contentRect.height;
        setSize({ width: newWidth, height: newHeight });
      }
    });

    resizeObserver.observe(element);

    return () => {
      resizeObserver.disconnect();
    };
  }, [ref]);

  return size;
}
