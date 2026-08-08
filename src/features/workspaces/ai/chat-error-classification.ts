import { defaultContextOverflowClassifier, type ChatErrorClassification } from "@cloudflare/think";

/**
 * OpenAI `rate_limit_exceeded`, Vertex `RESOURCE_EXHAUSTED` / "overloaded",
 * Anthropic 529 — one thing to a user: wait, then retry. Matched by name rather
 * than status code, because a bare "429" turns up in unrelated error text.
 */
const RATE_LIMIT_PATTERN = /rate.?limit|too many requests|resource.?exhausted|overloaded|quota/i;

export function classifyAIThreadChatError(error: unknown): ChatErrorClassification | void {
	// Overflow wins ties — it is the only classification Think acts on.
	return (
		defaultContextOverflowClassifier(error) ??
		(RATE_LIMIT_PATTERN.test(error instanceof Error ? error.message : String(error))
			? "rate_limit"
			: undefined)
	);
}
