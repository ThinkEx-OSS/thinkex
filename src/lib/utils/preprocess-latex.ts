/**
 * Preprocesses markdown content to normalize LaTeX delimiters for Streamdown/remark-math.
 *
 * Handles:
 * 0. Converts SurfSense-style [citation:X] to <citation>X</citation> (inline-only, no block)
 * 1. Protects currency values ($19.99, $5, $1,000) from being parsed as math
 * 2. Converts \(...\) → $...$ and \[...\] → $$...$$ (remark-math doesn't support these)
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
 * Converts [citation:X] to <citation>X</citation>.
 * For URLs: replaces with placeholder to avoid GFM autolinks; stores URL in _pendingUrlCitations.
 * Supports: [citation:https://...], [citation:Title], [citation:Title|quote]
 */
function preprocessCitations(markdown: string): string {
  if (!markdown) return markdown;
  _pendingUrlCitations = new Map();
  _urlCiteIdx = 0;

  // Replace URL citations with placeholders BEFORE markdown parsing
  // GFM autolinks would otherwise convert https://... into <a>, breaking our pattern
  let out = markdown.replace(
    /\[citation:\s*(https?:\/\/[^\]\u200B]+)\s*\]/g,
    (_, url: string) => {
      const key = `urlcite${_urlCiteIdx++}`;
      _pendingUrlCitations.set(key, url.trim());
      return `<citation>${key}</citation>`;
    }
  );

  // Replace remaining [citation:Title] or [citation:Title|quote] with <citation>...</citation>
  // Content can be: workspace title (spaces ok), or title|quote
  out = out.replace(/\[citation:\s*([^\]]+)\s*\]/g, (_, content: string) => {
    const trimmed = content.trim();
    return trimmed ? `<citation>${trimmed}</citation>` : "";
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
