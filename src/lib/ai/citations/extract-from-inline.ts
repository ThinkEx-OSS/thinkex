import type { Citation } from "./types";

const CITATIONS_BLOCK_REGEX = /<citations>([\s\S]*?)<\/citations>/i;

/**
 * Parses the optional model-generated <citations>...</citations> block from message text.
 * The model outputs sources at the beginning (no quotes — quotes are per-instance in inline elements).
 */
export function extractCitationsFromInlineData(
  message: { id?: string; role?: string; content?: unknown[] },
  _thread?: { messages?: unknown[] }
): Citation[] {
  const content = message?.content;
  if (!Array.isArray(content)) return [];

  const textParts = content
    .filter((p): p is { type: string; text?: string } => (p as any)?.type === "text" && typeof (p as any).text === "string")
    .map((p) => (p as { text: string }).text);

  const fullText = textParts.join("\n");
  const match = fullText.match(CITATIONS_BLOCK_REGEX);
  if (!match?.[1]) return [];

  let parsed: unknown;
  try {
    parsed = JSON.parse(match[1].trim());
  } catch {
    return [];
  }

  if (!Array.isArray(parsed)) return [];

  const citations: Citation[] = [];
  for (const item of parsed) {
    const c = item as Record<string, unknown>;
    const number = String(c?.number ?? "");
    const title = String(c?.title ?? "Source");
    const url = typeof c?.url === "string" ? c.url : undefined;
    const quote = typeof c?.quote === "string" ? c.quote : undefined;

    if (number) {
      citations.push({ number, title, url, quote });
    }
  }

  return citations;
}
