/**
 * Preprocesses markdown content to normalize LaTeX delimiters for Streamdown/remark-math.
 *
 * Handles:
 * 0. Citation: model outputs <citation>X</citation>; URLs get placeholder; [citation:X] fallback
 * 1. Protects currency values ($19.99, $5, $1,000) from being parsed as math
 * 2. Converts \(...\) → $...$ and \[...\] → $$...$$ (remark-math doesn't support these)
 *
 * Note: \$ (escaped currency) is handled natively by the markdown parser as a backslash
 * escape — no special handling needed here.
 *
 * Preserves code blocks (``` and inline `) so their contents are never modified.
 */

// Storage for URL citations replaced during preprocess to avoid GFM autolink interference.
// Populated in preprocessCitations, consumed by CitationRenderer.
let _pendingUrlCitations = new Map<string, string>();
let _urlCiteIdx = 0;

/** Get a stored URL by placeholder key (urlcite0, urlcite1, etc.). */
export function getCitationUrl(placeholder: string): string | undefined {
  return _pendingUrlCitations.get(placeholder);
}

/**
 * Handles citation markup.
 * - Model outputs <citation>X</citation> directly for workspace refs.
 * - For <citation>https://...</citation>, replaces URL with placeholder to avoid GFM autolinks.
 * - Fallback: [citation:X] → <citation>X</citation> for legacy or model slip-ups.
 */
function preprocessCitations(markdown: string): string {
  if (!markdown) return markdown;
  _pendingUrlCitations = new Map();
  _urlCiteIdx = 0;

  // URLs inside <citation>: replace with placeholder to avoid GFM autolinks
  let out = markdown.replace(
    /<citation>(https?:\/\/[^<]+)<\/citation>/g,
    (_, url: string) => {
      const key = `urlcite${_urlCiteIdx++}`;
      _pendingUrlCitations.set(key, url.trim());
      return `<citation>${key}</citation>`;
    }
  );

  // Fallback: [citation:X] → <citation>X</citation> (legacy format; URL in brackets also gets placeholder)
  out = out.replace(/\[citation:\s*([^\]]+)\s*\]/g, (_, content: string) => {
    const trimmed = content.trim();
    if (!trimmed) return "";
    const urlMatch = trimmed.match(/^(https?:\/\/\S+)$/);
    if (urlMatch) {
      const key = `urlcite${_urlCiteIdx++}`;
      _pendingUrlCitations.set(key, urlMatch[1].trim());
      return `<citation>${key}</citation>`;
    }
    return `<citation>${trimmed}</citation>`;
  });

  return out;
}

// Currency pattern: $ followed by digits, optional commas/decimals — e.g. $5, $19.99, $1,000.50
// Must NOT be preceded by another $ (to avoid matching inside $$...$$)
const CURRENCY_REGEX = /(?<!\$)\$(\d{1,3}(?:,\d{3})*(?:\.\d{1,2})?)\b/g;

export function preprocessLatex(markdown: string): string {
  if (!markdown) return markdown;

  // 0. Convert [citation:X] to <citation>X</citation> (SurfSense-style inline)
  markdown = preprocessCitations(markdown);

  // 1. Protect code blocks and inline code from modification
  const preserved: string[] = [];
  let result = markdown.replace(/```[\s\S]*?```|`[^`\n]+`/g, (match: string) => {
    preserved.push(match);
    return `\x00CODE${preserved.length - 1}\x00`;
  });

  // 2. Protect currency values from being parsed as math delimiters
  //    e.g. "$19.99" → placeholder, restored at the end
  const currencies: string[] = [];
  result = result.replace(CURRENCY_REGEX, (match) => {
    currencies.push(match);
    return `\x00CUR${currencies.length - 1}\x00`;
  });

  // 3. Convert \(...\) → $...$ (inline math)
  result = result.replace(/\\\(([\s\S]*?)\\\)/g, (_match, math) => {
    return `$${math}$`;
  });

  // 4. Convert \[...\] → $$...$$ (display math)
  result = result.replace(/\\\[([\s\S]*?)\\\]/g, (_match, math) => {
    return `$$${math}$$`;
  });

  // 5. Restore protected currency values
  result = result.replace(/\x00CUR(\d+)\x00/g, (_match, idx) => {
    return currencies[Number(idx)];
  });

  // 6. Restore protected code blocks
  result = result.replace(/\x00CODE(\d+)\x00/g, (_match, idx) => {
    return preserved[Number(idx)];
  });

  return result;
}
