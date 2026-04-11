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

export function getCitationUrl(placeholder: string, citationUrls: Map<string, string>): string | undefined {
  return citationUrls.get(placeholder);
}

function preprocessCitations(markdown: string): { text: string; citationUrls: Map<string, string> } {
  const citationUrls = new Map<string, string>();
  if (!markdown) return { text: markdown, citationUrls };
  let urlCiteIdx = 0;

  let out = markdown.replace(
    /<citation>(https?:\/\/[^<]+)<\/citation>/g,
    (_, url: string) => {
      const key = `urlcite${urlCiteIdx++}`;
      citationUrls.set(key, url.trim());
      return `<citation>${key}</citation>`;
    }
  );

  out = out.replace(/\[citation:\s*([^\]]+)\s*\]/g, (_, content: string) => {
    const trimmed = content.trim();
    if (!trimmed) return "";
    const urlMatch = trimmed.match(/^(https?:\/\/\S+)$/);
    if (urlMatch) {
      const key = `urlcite${urlCiteIdx++}`;
      citationUrls.set(key, urlMatch[1].trim());
      return `<citation>${key}</citation>`;
    }
    return `<citation>${trimmed}</citation>`;
  });

  return { text: out, citationUrls };
}

// Currency pattern: $ followed by digits, optional commas/decimals, optional k/M/B — e.g. $5, $19.99, $100k, $100M
// Must NOT be preceded by another $ (to avoid matching inside $$...$$)
// Must NOT be followed by $ — e.g. $127$ or ($127$ or $127$. is math, not currency
export const CURRENCY_REGEX =
  /(?<!\$)\$(\d{1,3}(?:,\d{3})*(?:\.\d{1,2})?(?:[kKmMbB])?)(?!\$)\b/g;

/** Same as preprocess steps 3–4: TeX-style delimiters → remark-math / TipTap-style `$…$` and `$$…$$`. */
export function convertTexDelimitersToDollars(s: string): string {
  return s
    .replace(/\\\(([\s\S]*?)\\\)/g, (_match, math: string) => `$${math}$`)
    .replace(/\\\[([\s\S]*?)\\\]/g, (_match, math: string) => `$$${math}$$`);
}

export function preprocessLatex(markdown: string): { text: string; citationUrls: Map<string, string> } {
  if (!markdown) return { text: markdown, citationUrls: new Map() };

  const preserved: string[] = [];
  let result = markdown.replace(/```[\s\S]*?```|`[^`\n]+`/g, (match: string) => {
    preserved.push(match);
    return `\x00CODE${preserved.length - 1}\x00`;
  });

  const { text: withCitations, citationUrls } = preprocessCitations(result);
  result = withCitations;

  const currencies: string[] = [];
  result = result.replace(CURRENCY_REGEX, (match) => {
    currencies.push(match);
    return `\x00CUR${currencies.length - 1}\x00`;
  });

  result = convertTexDelimitersToDollars(result);

  result = result.replace(/\x00CUR(\d+)\x00/g, (_match, idx) => {
    return currencies[Number(idx)];
  });

  result = result.replace(/\x00CODE(\d+)\x00/g, (_match, idx) => {
    return preserved[Number(idx)];
  });

  return { text: result, citationUrls };
}
