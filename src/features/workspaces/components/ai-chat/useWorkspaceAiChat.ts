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
import {
	hasAnalyticsConsent,
	hasExplicitSessionReplayConsent,
} from "#/integrations/posthog/consent";

interface UseWorkspaceAiChatOptions {
	modelId: AiChatModelId;
	threadId: string;
}

const AI_CHAT_RENDER_THROTTLE_MS = 100;

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
			// The DO can't read the browser consent cookie, so both choices ride in the turn body.
			analyticsConsent: hasAnalyticsConsent(),
			sessionReplayConsent: hasExplicitSessionReplayConsent(),
		}),
		throttle: AI_CHAT_RENDER_THROTTLE_MS,
	});
	const {
		clearError,
		connectionError,
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
	const isConnected = agent.identified && agent.readyState === agent.OPEN;
	const inputStatus: AiChatStatus = connectionError
		? "error"
		: presentation.tailPending || presentation.isRecovering
			? "submitted"
			: presentation.isBusy
				? "streaming"
				: status === "error"
					? "ready"
					: status;
	const canSend =
		isConnected && inputStatus === "ready" && !presentation.isBusy && !connectionError;

	const sendMessage = (message: AiChatSendMessage, options?: AiChatSendMessageOptions) => {
		if (message.parts.length === 0 || !canSend) {
			throw new Error("Cannot send a chat message while the chat is unavailable");
		}

		clearError();
		void sendAgentMessage(message, options);
	};
	const regenerate = () => {
		if (canStop) {
			return;
		}

		clearError();
		void regenerateAgentMessage();
	};

	return {
		canSend,
		connectionError,
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
