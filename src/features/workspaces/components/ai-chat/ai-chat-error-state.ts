import type { AiChatAssistantErrorState } from "#/features/workspaces/components/ai-chat/AiChatMessageList";
import type { AiChatMessage, AiChatStatus } from "#/features/workspaces/components/ai-chat/types";

// Error rows are derived purely from live chat state. The DO-era version also
// consulted persisted per-thread run summaries; the Postgres implementation
// keeps no run-state ledger — after a reload, an interrupted reply speaks for
// itself via its persisted partial content.
export function deriveAiChatAssistantErrorState(input: {
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
		return {
			kind: "assistant",
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
