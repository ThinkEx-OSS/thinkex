import type { AIThreadSummary } from "#/features/workspaces/ai/user-ai-agents";
import type { AiChatAssistantErrorState } from "#/features/workspaces/components/ai-chat/AiChatMessageList";
import type { AiChatStatus } from "#/features/workspaces/components/ai-chat/types";

export function deriveAiChatAssistantErrorState(input: {
	hasConnectionError: boolean;
	inputStatus: AiChatStatus;
	threadSummary?: AIThreadSummary;
}): AiChatAssistantErrorState | null {
	if (input.inputStatus !== "ready") {
		return null;
	}

	if (input.hasConnectionError) {
		return {
			kind: "connection",
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
