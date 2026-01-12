/**
 * Detects if the current platform is macOS
 */
export function isMac(): boolean {
  if (typeof window === 'undefined') return false;
  return /Mac|iPhone|iPod|iPad/i.test(navigator.platform) || 
         /Mac|iPhone|iPod|iPad/i.test(navigator.userAgent);
}

/**
 * Returns the platform-specific modifier key symbol
 * @returns "⌘" for Mac, "Ctrl" for Windows/Linux
 */
export function getModifierKey(): string {
  return isMac() ? '⌘' : 'Ctrl';
}

/**
 * Formats a keyboard shortcut with the platform-specific modifier key
 * @param key - The key to combine with the modifier (e.g., 'K', 'M', 'B')
 * @param shift - Whether to include Shift modifier
 * @returns Formatted shortcut string (e.g., "⌘K" on Mac, "Ctrl+K" on Windows)
 */
export function formatKeyboardShortcut(key: string, shift: boolean = false): string {
  const modifier = getModifierKey();
  if (shift) {
    return modifier === '⌘' ? `⌘⇧${key}` : `${modifier}+Shift+${key}`;
  }
  return modifier === '⌘' ? `⌘${key}` : `${modifier}+${key}`;
}
