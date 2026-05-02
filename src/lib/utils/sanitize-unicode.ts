/**
 * Replace unpaired UTF-16 surrogates with the Unicode replacement character (U+FFFD).
 * PostgreSQL jsonb rejects lone surrogates per RFC 8259.
 */
export function stripUnpairedSurrogates(str: string): string {
  // Match high surrogate not followed by low surrogate, or lone low surrogate
  return str.replace(
    /[\ud800-\udbff](?![\udc00-\udfff])|(?<![\ud800-\udbff])[\udc00-\udfff]/g,
    '\ufffd',
  );
}

/**
 * Recursively sanitize all string values in a JSON-serializable object,
 * replacing unpaired UTF-16 surrogates with U+FFFD.
 */
export function sanitizeForJsonb<T>(value: T): T {
  if (typeof value === 'string') {
    return stripUnpairedSurrogates(value) as T;
  }
  if (Array.isArray(value)) {
    return value.map(sanitizeForJsonb) as T;
  }
  if (value !== null && typeof value === 'object') {
    const result: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) {
      result[k] = sanitizeForJsonb(v);
    }
    return result as T;
  }
  return value;
}
