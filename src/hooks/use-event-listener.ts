/* oxlint-disable eslint(no-restricted-imports) */
import { useEffect, useRef } from "react";

/**
 * Attaches a DOM event listener with automatic cleanup.
 * The handler is always fresh (no stale closures) via a ref.
 */
export function useEventListener<K extends keyof WindowEventMap>(
  eventName: K,
  handler: (event: WindowEventMap[K]) => void,
  options?: {
    enabled?: boolean;
    target?: EventTarget | null;
    capture?: boolean;
  }
): void {
  const savedHandler = useRef(handler);
  savedHandler.current = handler;

  const { enabled = true, target, capture = false } = options ?? {};

  useEffect(() => {
    const el = target ?? window;
    if (!enabled || !el) return;

    const listener = (event: Event) => savedHandler.current(event as WindowEventMap[K]);
    el.addEventListener(eventName, listener, { capture });
    return () => el.removeEventListener(eventName, listener, { capture });
  }, [eventName, enabled, target, capture]);
}
