/* oxlint-disable eslint(no-restricted-imports) */
import { useEffect } from "react";

/**
 * Locks `document.body` scroll when `locked` is true.
 * Restores the original overflow value on unlock or unmount.
 */
export function useBodyScrollLock(locked: boolean): void {
  useEffect(() => {
    if (!locked) return;
    const original = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = original;
    };
  }, [locked]);
}
