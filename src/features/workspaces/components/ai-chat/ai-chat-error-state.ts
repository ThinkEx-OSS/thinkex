import type { AiChatAssistantErrorState } from "#/features/workspaces/components/ai-chat/AiChatMessageList";
import type { AiChatMessage, AiChatStatus } from "#/features/workspaces/components/ai-chat/types";

// Error rows are derived purely from live chat state. The DO-era version also
// consulted persisted per-thread run summaries; the Postgres implementation
// keeps no run-state ledger — after a reload, an interrupted reply speaks for
// itself via its persisted partial content.
export function deriveAiChatAssistantErrorState(input: {
	// useChat's live error for the current turn: the refusal that never made it
	// into the transcript, so it has no stub row to speak for it.
	chatError?: Error;
	chatStatus: AiChatStatus;
	hasConnectionError: boolean;
	hasMessages: boolean;
	lastMessageRole?: AiChatMessage["role"];
	// A persisted turn-error stub row's message (see chat-endpoint onError):
	// makes failed turns reload-visible instead of inferred.
	lastMessageErrorMessage?: string;
}): AiChatAssistantErrorState | null {
	if (input.hasConnectionError) {
		return {
			kind: "connection",
		};
	}

	if (input.chatStatus === "submitted" || input.chatStatus === "streaming") {
		return null;
	}

	if (input.chatStatus === "error") {
		// The server already wrote a sentence naming what failed and, for a limit,
		// when it comes back. Dropping it here is what made a refused turn read as
		// a crash.
		return {
			classification: isAiChatUsageLimitResponse(input.chatError) ? "usage_limit" : null,
			kind: "assistant",
			message: parseAiChatRequestError(input.chatError)?.message ?? null,
		};
	}

	if (input.lastMessageRole === "assistant" && input.lastMessageErrorMessage) {
		return {
			kind: "assistant",
			message: input.lastMessageErrorMessage,
		};
	}

	// A turn that ended without any assistant output leaves the user message as
	// the tail — without this row there is no sign the send ended. A mid-stream
	// stop keeps its partial assistant tail, so no row is needed there.
	if (input.hasMessages && input.lastMessageRole === "user") {
		return {
			kind: "aborted",
		};
	}

	return null;
}

/**
 * The transport turns a non-2xx into `new Error(await response.text())`, so the
 * status and the user-facing sentence are only recoverable by parsing the body
 * back out (see chatErrorResponse). Anything that isn't ours — a proxy error
 * page, a dropped socket — parses to null and stays a plain failure.
 */
export function parseAiChatRequestError(error: Error | undefined) {
	if (!error) {
		return null;
	}

	try {
		const body: unknown = JSON.parse(error.message);
		const { error: message, status } = body as { error?: unknown; status?: unknown };

		return typeof message === "string" && typeof status === "number" ? { message, status } : null;
	} catch {
		return null;
	}
}

/**
 * The chat endpoint's only 429 is the Autumn usage gate; a provider rate limit
 * surfaces mid-stream instead, and never as a refused request.
 */
export function isAiChatUsageLimitResponse(error: Error | undefined) {
	return parseAiChatRequestError(error)?.status === 429;
}

/** Retrying a turn the plan refuses just fails the same way. */
export function isAiChatUsageLimitErrorState(state: AiChatAssistantErrorState | null) {
	return state?.kind === "assistant" && state.classification === "usage_limit";
}
