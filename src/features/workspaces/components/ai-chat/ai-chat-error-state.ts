import type { AIThreadSummary } from "#/features/workspaces/ai/user-ai-agents";
import type { AiChatAssistantErrorState } from "#/features/workspaces/components/ai-chat/AiChatMessageList";
import type { AiChatMessage, AiChatStatus } from "#/features/workspaces/components/ai-chat/types";

type AIThreadErrorSummary = Pick<
	AIThreadSummary,
	"lastErrorClassification" | "lastErrorMessage" | "lastErrorStage" | "lastRunResult"
>;

export function deriveAiChatAssistantErrorState(input: {
	chatStatus: AiChatStatus;
	hasConnectionError: boolean;
	lastMessageRole?: AiChatMessage["role"];
	threadSummary?: AIThreadErrorSummary;
}): AiChatAssistantErrorState | null {
	if (input.hasConnectionError) {
		return {
			kind: "connection",
		};
	}

	if (input.chatStatus === "submitted" || input.chatStatus === "streaming") {
		return null;
	}

	const threadError =
		input.threadSummary?.lastRunResult === "error" ? input.threadSummary : undefined;

	if (input.chatStatus === "error" || threadError) {
		return {
			...(threadError
				? {
						classification: threadError.lastErrorClassification,
						message: threadError.lastErrorMessage,
						stage: threadError.lastErrorStage,
					}
				: {}),
			kind: "assistant",
		};
	}

	// A run stopped before the first token leaves the user message as the tail
	// with nothing after it — without this row there is no sign the send ended.
	// A mid-stream stop keeps its partial assistant tail, so no row is needed.
	if (input.threadSummary?.lastRunResult === "aborted" && input.lastMessageRole === "user") {
		return {
			kind: "aborted",
		};
	}

	return null;
}
