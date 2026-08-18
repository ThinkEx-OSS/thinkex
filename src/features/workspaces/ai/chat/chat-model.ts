// Chat-domain types, title normalization, and pure turn-outcome logic
// shared by the store, the turn endpoint, and the chat UI.

import type { UIMessage } from "ai";

// The classification/stage values the UI branches on. The chat does not
// record per-thread error summaries yet, so these mostly type live error
// state; the open unions keep old persisted values readable.
export type AiChatErrorClassification =
	| "context_overflow"
	| "rate_limit"
	| "usage_limit"
	| (string & {});
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

// Settle an interrupted/failed turn's parts. Partial text/reasoning is kept —
// an aborted stream leaves text parts at state "streaming", and dropping them
// would erase the reply the user watched. Tool calls split by how far they
// got: mid-argument calls (input-streaming) never executed, so they drop;
// calls with complete input may have EXECUTED without their result being
// recorded, so they become an explicit error result — erasing them would tell
// future turns the call never happened, inviting the model to repeat a
// mutation that may already have committed.
export function settledParts(parts: UIMessage["parts"]): UIMessage["parts"] {
	const settled: UIMessage["parts"] = [];

	for (const part of parts) {
		if (!("toolCallId" in part) || !("state" in part) || typeof part.state !== "string") {
			settled.push(part);
			continue;
		}

		if (part.state.startsWith("output-")) {
			settled.push(part);
			continue;
		}

		if (part.state === "input-streaming") {
			continue;
		}

		// Build the error variant without carrying approval-state fields along —
		// a stale approval request would otherwise re-enter the model context as
		// a question nobody can answer.
		const { approval: _approval, ...rest } = part as { approval?: unknown } & typeof part;
		settled.push({
			...rest,
			state: "output-error" as const,
			errorText:
				"This call was interrupted before its outcome was recorded. It may or may not have taken effect — verify what actually happened before repeating any action with side effects.",
		} as UIMessage["parts"][number]);
	}

	return settled;
}

// PostHog rejects events past ~1MB, and a near-compaction transcript (or the
// compaction prompt, which embeds one) can exceed that. Keep the newest
// messages whole, drop the oldest with a marker, and slice a lone entry that
// is itself over budget (the compaction prompt case). Lives here, not in
// chat-telemetry, so tests import it without the posthog/cloudflare chain.
const TELEMETRY_CONTENT_CHAR_BUDGET = 400_000;

export function fitTelemetryContent(entries: unknown[]): unknown[] {
	const sizes = entries.map((entry) => JSON.stringify(entry)?.length ?? 0);
	let total = sizes.reduce((sum, size) => sum + size, 0);
	let omitted = 0;

	while (entries.length - omitted > 1 && total > TELEMETRY_CONTENT_CHAR_BUDGET) {
		total -= sizes[omitted] ?? 0;
		omitted += 1;
	}

	let kept = entries.slice(omitted);
	const only = kept[0] as { role?: unknown; content?: unknown } | undefined;

	if (
		total > TELEMETRY_CONTENT_CHAR_BUDGET &&
		kept.length === 1 &&
		typeof only?.content === "string"
	) {
		kept = [
			{ ...only, content: `${only.content.slice(0, TELEMETRY_CONTENT_CHAR_BUDGET)}…(truncated)` },
		];
	}

	return omitted > 0
		? [
				{
					role: "system",
					content: `(${omitted} earlier ${omitted === 1 ? "message" : "messages"} omitted from telemetry)`,
				},
				...kept,
			]
		: kept;
}
