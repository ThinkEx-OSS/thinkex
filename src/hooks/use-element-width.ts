import { useEffect, useState, RefObject } from 'react';

/**
 * Hook to measure the width of an element using ResizeObserver
 * @param ref - Ref to the element to measure
 * @returns The current width of the element in pixels
 */
export function useElementWidth(ref: RefObject<HTMLElement | null>): number | undefined {
    const [width, setWidth] = useState<number | undefined>(undefined);

    useEffect(() => {
        const element = ref.current;
        if (!element) return;

        // Set initial width
        setWidth(element.offsetWidth);

        // Create ResizeObserver to watch for size changes
        const resizeObserver = new ResizeObserver((entries) => {
            for (const entry of entries) {
                // Use borderBoxSize for more accurate measurements
                const newWidth = entry.borderBoxSize?.[0]?.inlineSize ?? entry.contentRect.width;
                setWidth(newWidth);
            }
        });

        resizeObserver.observe(element);

        return () => {
            resizeObserver.disconnect();
        };
    }, [ref]);

    return width;
}
