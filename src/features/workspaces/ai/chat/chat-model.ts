// Chat-domain types and title normalization shared by the store, the turn
// endpoint, and the chat UI.

// The classification/stage values the UI branches on. The chat does not
// record per-thread error summaries yet, so these mostly type live error
// state; the open unions keep old persisted values readable.
export type AiChatErrorClassification = "context_overflow" | "rate_limit" | (string & {});
export type AiChatErrorStage = "recovery" | (string & {});

// ChatGPT-shaped thread summary: identity, title, recency — nothing else.
// Run-state/unread fields existed because the old directory DO pushed live
// status over a socket; the Postgres directory is fetch-on-demand and error
// state is derived from the live chat status instead.
export interface AiChatThreadSummary {
	id: string;
	workspaceId: string;
	title: string;
	lastActivityAt: string;
}

export const FALLBACK_THREAD_TITLE = "New chat";

export function normalizeGeneratedThreadTitle(value: string | undefined) {
	// Whitespace first: the quote-strip anchors to the string ends, so a title
	// arriving as '\n"Title"\n' would otherwise keep its quotes.
	const title = value
		?.replace(/\s+/g, " ")
		.trim()
		.replace(/^["'`]+|["'`.]+$/g, "")
		.trim();

	if (!title) {
		return null;
	}

	return title.length > 64 ? `${title.slice(0, 61).trimEnd()}...` : title;
}
