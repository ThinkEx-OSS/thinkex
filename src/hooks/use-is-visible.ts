'use client';

import { useState, useEffect, useRef, RefObject } from 'react';

/**
 * Hook that tracks whether an element is visible in the viewport.
 * Uses IntersectionObserver for efficient visibility detection.
 * 
 * @param ref - Ref to the element to observe
 * @param options - IntersectionObserver options
 * @returns boolean indicating if the element is currently visible
 */
export function useIsVisible(
    ref: RefObject<Element | null>,
    options?: IntersectionObserverInit
): boolean {
    const [isVisible, setIsVisible] = useState(false);

    useEffect(() => {
        const element = ref.current;
        if (!element) return;

        const observer = new IntersectionObserver(
            ([entry]) => {
                setIsVisible(entry.isIntersecting);
            },
            {
                // Default: trigger when any part is visible
                threshold: 0,
                // Add some margin to start loading slightly before visible
                rootMargin: '100px',
                ...options,
            }
        );

        observer.observe(element);

        return () => {
            observer.disconnect();
        };
    }, [ref, options]);

    return isVisible;
}

/**
 * Hook that tracks whether an element has ever been visible.
 * Once visible, it stays "true" even if scrolled out of view.
 * Useful for "load once when first visible" patterns.
 * 
 * @param ref - Ref to the element to observe
 * @param options - IntersectionObserver options
 * @returns boolean indicating if the element has ever been visible
 */
export function useHasBeenVisible(
    ref: RefObject<Element | null>,
    options?: IntersectionObserverInit
): boolean {
    const [hasBeenVisible, setHasBeenVisible] = useState(false);

    useEffect(() => {
        if (hasBeenVisible) return; // Already visible, no need to observe

        const element = ref.current;
        if (!element) return;

        const observer = new IntersectionObserver(
            ([entry]) => {
                if (entry.isIntersecting) {
                    setHasBeenVisible(true);
                    observer.disconnect(); // Stop observing once visible
                }
            },
            {
                threshold: 0,
                rootMargin: '100px',
                ...options,
            }
        );

        observer.observe(element);

        return () => {
            observer.disconnect();
        };
    }, [ref, options, hasBeenVisible]);

    return hasBeenVisible;
}
