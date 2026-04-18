"use client";

import { useCallback, useEffect, useRef, type RefObject } from "react";

function findClosestScrollableAncestor(el: HTMLElement | null): HTMLElement | null {
  let cur = el?.parentElement ?? null;
  while (cur) {
    const style = window.getComputedStyle(cur);
    const oy = style.overflowY;
    if ((oy === "auto" || oy === "scroll" || oy === "overlay") && cur.scrollHeight > cur.clientHeight) {
      return cur;
    }
    cur = cur.parentElement;
  }
  return (document.scrollingElement as HTMLElement | null) ?? document.documentElement;
}

export function useScrollLock(
  ref: RefObject<HTMLElement | null>,
  durationMs: number,
): () => void {
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (rafRef.current != null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    };
  }, []);

  return useCallback(() => {
    const el = ref.current;
    if (!el || typeof window === "undefined") return;
    const scrollable = findClosestScrollableAncestor(el);
    if (!scrollable) return;
    if (rafRef.current != null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    const locked = scrollable.scrollTop;
    const start = performance.now();
    const tick = () => {
      if (scrollable.scrollTop !== locked) scrollable.scrollTop = locked;
      if (performance.now() - start < durationMs) {
        rafRef.current = requestAnimationFrame(tick);
      } else {
        rafRef.current = null;
      }
    };
    rafRef.current = requestAnimationFrame(tick);
  }, [ref, durationMs]);
}
