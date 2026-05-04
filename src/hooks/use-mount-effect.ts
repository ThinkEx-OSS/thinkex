/* oxlint-disable eslint(no-restricted-imports) */
import { useEffect } from "react";

/**
 * Runs an effect exactly once on mount (and cleanup on unmount).
 * This is the only sanctioned way to call useEffect with an empty dependency array.
 * For all other cases, use derived state, event handlers, or a purpose-named hook.
 *
 * @see https://gist.github.com/alvinsng/5dd68c6ece355dbdbd65340ec2927b1d
 */
export function useMountEffect(effect: () => void | (() => void)): void {
  // oxlint-disable-next-line react-hooks/exhaustive-deps -- mount-only by design
  useEffect(effect, []);
}
