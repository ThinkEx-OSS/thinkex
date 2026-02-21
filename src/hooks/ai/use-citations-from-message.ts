"use client";

import { useMessage, useAuiState } from "@assistant-ui/react";
import { useMemo } from "react";
import type { Citation } from "@/lib/ai/citations/types";
import { extractCitationsFromInlineData } from "@/lib/ai/citations/extract-from-inline";

/** Extracts citations from the model-generated <citations>...</citations> block in message text. */
const CITATION_EXTRACTORS = [extractCitationsFromInlineData];

/**
 * Extracts citations from the current message.
 * Citations come from the optional model-generated <citations> block appended to the message.
 * Returns a stable array; citations are 1-indexed by number.
 */
export function useCitationsFromMessage(): Citation[] {
  const message = useMessage();
  const messages = useAuiState(
    (s) => (s.thread as unknown as { messages?: unknown[] } | undefined)?.messages ?? []
  );
  const thread = useMemo(() => ({ messages }), [messages]);

  return useMemo(() => {
    const msg = {
      id: (message as unknown as { id?: string }).id,
      role: (message as unknown as { role?: string }).role,
      content: (message as unknown as { content?: unknown[] }).content,
    };

    // Extract from model-generated <citations> block
    for (const extract of CITATION_EXTRACTORS) {
      const citations = extract(msg, thread);
      if (citations.length > 0) {
        return citations.map((c, i) => ({
          ...c,
          number: String(i + 1),
        }));
      }
    }

    return [];
  }, [message, thread]);
}
