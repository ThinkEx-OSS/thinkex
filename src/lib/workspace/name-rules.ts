/**
 * Filesystem-style naming rules for workspace items and folders.
 *
 * Design goals:
 *  - Portable: reject characters that break on Windows, macOS, or URL-safe paths.
 *  - Reversible: a name that passes validation round-trips through getVirtualPath
 *    unchanged (no silent sanitization).
 *  - Predictable for humans: trim whitespace, reject empty / reserved names.
 *
 * These rules apply at every rename/create entry point — UI inputs,
 * AI rename via item_edit (workspace-worker), and bulk creation flows.
 */

export const MAX_ITEM_NAME_LENGTH = 255;

// Characters that either break the POSIX path model or are reserved on
// common consumer filesystems (Windows/NTFS). Rejecting them keeps the
// item's raw name consistent with its virtual path representation.
export const INVALID_NAME_CHARS_REGEX = /[\/\\\x00-\x1f<>:"|?*]/;
export const INVALID_NAME_CHARS_REGEX_GLOBAL = /[\/\\\x00-\x1f<>:"|?*]/g;

export const RESERVED_NAMES: ReadonlySet<string> = new Set([".", ".."]);

export type NameValidationResult =
  | { valid: true; normalized: string }
  | { valid: false; error: string };

/**
 * Validate and normalize a proposed item/folder name.
 *
 * The returned `normalized` value (on success) is always the caller-intended
 * display string, with leading/trailing whitespace trimmed. Callers should
 * persist `normalized`, not the raw input.
 */
export function validateItemName(rawName: unknown): NameValidationResult {
  if (typeof rawName !== "string") {
    return { valid: false, error: "Name must be a string" };
  }
  const normalized = rawName.trim();
  if (normalized.length === 0) {
    return { valid: false, error: "Name cannot be empty" };
  }
  const codePointLength = [...normalized].length;
  if (codePointLength > MAX_ITEM_NAME_LENGTH) {
    return {
      valid: false,
      error: `Name is too long (max ${MAX_ITEM_NAME_LENGTH} characters)`,
    };
  }
  if (INVALID_NAME_CHARS_REGEX.test(normalized)) {
    return {
      valid: false,
      error: 'Name cannot contain: / \\ < > : " | ? * or control characters',
    };
  }
  if (RESERVED_NAMES.has(normalized)) {
    return { valid: false, error: `"${normalized}" is a reserved name` };
  }
  return { valid: true, normalized };
}
