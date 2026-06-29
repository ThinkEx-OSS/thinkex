import { useAgentChat } from "@cloudflare/think/react";
import { useAgent } from "agents/react";

import {
	aiThreadAgentName,
	userAIAgentName,
	userAIBasePath,
} from "#/features/workspaces/agent-routes";
import { deriveAiChatPresentation } from "#/features/workspaces/components/ai-chat/ai-chat-display-state";
import type {
	AiChatMessage,
	AiChatModelId,
	AiChatSendMessage,
	AiChatSendMessageOptions,
	AiChatStatus,
} from "#/features/workspaces/components/ai-chat/types";

interface UseWorkspaceAiChatOptions {
	modelId: AiChatModelId;
	threadId: string;
}

export function useWorkspaceAiChat({ modelId, threadId }: UseWorkspaceAiChatOptions) {
	const agent = useAgent({
		agent: userAIAgentName,
		basePath: userAIBasePath,
		sub: [{ agent: aiThreadAgentName, name: threadId }],
	});
	const chat = useAgentChat<unknown, AiChatMessage>({
		agent,
		body: () => ({
			modelId,
			timeZone: getClientTimeZone(),
		}),
	});
	const {
		clearError,
		error,
		isRecovering,
		isServerStreaming,
		isStreaming,
		isToolContinuation,
		messages,
		regenerate: regenerateAgentMessage,
		sendMessage: sendAgentMessage,
		status,
		stop,
	} = chat;
	const presentation = deriveAiChatPresentation(messages, status, {
		isRecovering,
		isServerStreaming,
		isStreaming,
		isToolContinuation,
	});
	const canStop = status === "submitted" || presentation.isBusy;
	const inputStatus: AiChatStatus =
		presentation.tailPending || presentation.isRecovering
			? "submitted"
			: presentation.isBusy
				? "streaming"
				: status === "error"
					? "ready"
					: status;
	const canSend = inputStatus === "ready" && !presentation.isBusy;

	const sendMessage = (message: AiChatSendMessage, options?: AiChatSendMessageOptions) => {
		if (message.parts.length === 0 || !canSend) {
			return false;
		}

		clearError();
		void sendAgentMessage(message, options);
		return true;
	};
	const regenerate = () => {
		if (canStop) {
			return;
		}

		clearError();
		void regenerateAgentMessage();
	};

	return {
		error,
		inputStatus,
		messages,
		presentation,
		regenerate,
		sendMessage,
		stop,
	};
}

function getClientTimeZone() {
	try {
		return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
	} catch {
		return "UTC";
	}
}
