import type { AIThreadSummary } from "#/features/workspaces/ai/user-ai-agents";
import type { AiChatAssistantErrorState } from "#/features/workspaces/components/ai-chat/AiChatMessageList";
import type { AiChatStatus } from "#/features/workspaces/components/ai-chat/types";

export function deriveAiChatAssistantErrorState(input: {
	chatStatus: AiChatStatus;
	hasConnectionError: boolean;
	threadSummary?: AIThreadSummary;
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

	if (input.threadSummary?.lastRunResult === "error") {
		return {
			classification: input.threadSummary.lastErrorClassification,
			kind: "assistant",
			stage: input.threadSummary.lastErrorStage,
		};
	}

	return null;
}
