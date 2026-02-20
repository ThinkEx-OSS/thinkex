/**
 * Generic citation type for inline citations.
 * Source-agnostic: can represent web search, URL context, workspace content, etc.
 * Quote is per-instance (in inline element), not per-source.
 */
export type Citation = {
  number: string; // "1", "2", ... (1-based index for display)
  title: string;
  url?: string; // optional — workspace items may not have URLs
  quote?: string; // optional at source level; use instance quote from inline element
};

/** Extractor function: takes a message (and optional thread) and returns citations */
export type CitationExtractor = (
  message: { id?: string; role?: string; content?: unknown[] },
  thread?: { messages?: unknown[] }
) => Citation[];
