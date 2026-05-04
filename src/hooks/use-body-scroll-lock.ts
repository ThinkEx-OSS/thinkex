/* oxlint-disable eslint(no-restricted-imports) */
import { useEffect } from "react";

let lockCount = 0;
let originalOverflow = "";

/**
 * Locks `document.body` scroll when `locked` is true.
 * Uses a shared counter so concurrent locks don't conflict.
 */
export function useBodyScrollLock(locked: boolean): void {
  useEffect(() => {
    if (!locked) return;
    if (lockCount === 0) {
      originalOverflow = document.body.style.overflow;
      document.body.style.overflow = "hidden";
    }
    lockCount++;
    return () => {
      lockCount--;
      if (lockCount === 0) {
        document.body.style.overflow = originalOverflow;
      }
    };
  }, [locked]);
}
