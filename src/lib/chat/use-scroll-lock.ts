"use client";

import { useCallback, type RefObject } from "react";

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
  return useCallback(() => {
    const el = ref.current;
    if (!el || typeof window === "undefined") return;
    const scrollable = findClosestScrollableAncestor(el);
    if (!scrollable) return;
    const locked = scrollable.scrollTop;
    const start = performance.now();
    const tick = () => {
      if (scrollable.scrollTop !== locked) scrollable.scrollTop = locked;
      if (performance.now() - start < durationMs) {
        requestAnimationFrame(tick);
      }
    };
    requestAnimationFrame(tick);
  }, [ref, durationMs]);
}
