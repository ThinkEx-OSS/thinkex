import type { AIThreadSummary } from "#/features/workspaces/ai/user-ai-agents";
import type { AiChatAssistantErrorState } from "#/features/workspaces/components/ai-chat/AiChatMessageList";
import type { AiChatStatus } from "#/features/workspaces/components/ai-chat/types";

type AIThreadErrorSummary = Pick<
	AIThreadSummary,
	"lastErrorClassification" | "lastErrorStage" | "lastRunResult"
>;

export function deriveAiChatAssistantErrorState(input: {
	chatStatus: AiChatStatus;
	hasConnectionError: boolean;
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
						stage: threadError.lastErrorStage,
					}
				: {}),
			kind: "assistant",
		};
	}

	return null;
}
