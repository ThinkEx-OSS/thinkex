import { useAgentChat } from "@cloudflare/think/react";
import { useAgent } from "agents/react";
import { useEffect } from "react";

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

// Last settled transcript per thread, so switching back renders instantly
// instead of suspending on the /get-messages fetch. The server's connect-time
// broadcast replaces the seed with authoritative state one round trip later.
// Bounded: transcripts are heavy, and only recently visited threads are
// likely to be revisited. Map iteration order gives us LRU for free.
const TRANSCRIPT_CACHE_MAX_THREADS = 8;
const transcriptCache = new Map<string, AiChatMessage[]>();

function cacheTranscript(threadId: string, messages: AiChatMessage[]) {
	transcriptCache.delete(threadId);
	transcriptCache.set(threadId, messages);
	for (const staleId of transcriptCache.keys()) {
		if (transcriptCache.size <= TRANSCRIPT_CACHE_MAX_THREADS) {
			break;
		}
		transcriptCache.delete(staleId);
	}
}

export function evictWorkspaceAiTranscript(threadId: string) {
	transcriptCache.delete(threadId);
}

// React 19's use() unwraps a thenable synchronously when it carries
// status/value (the tracked-thenable convention), so a cached transcript
// renders without a Suspense fallback frame.
function fulfilledThenable<T>(value: T): Promise<T> {
	return Object.assign(Promise.resolve(value), { status: "fulfilled", value });
}

export function useWorkspaceAiChat({ modelId, threadId }: UseWorkspaceAiChatOptions) {
	const agent = useAgent({
		agent: userAIAgentName,
		basePath: userAIBasePath,
		sub: [{ agent: aiThreadAgentName, name: threadId }],
	});
	const cachedTranscript = transcriptCache.get(threadId);
	const chat = useAgentChat<unknown, AiChatMessage>({
		agent,
		body: () => ({
			modelId,
			timeZone: getClientTimeZone(),
			// The DO can't read the browser consent cookie, so both choices ride in the turn body.
			analyticsConsent: hasAnalyticsConsent(),
			sessionReplayConsent: hasExplicitSessionReplayConsent(),
		}),
		// No cache → the default /get-messages fetch, which also covers
		// mid-stream reconnects (the socket deliberately sends no transcript
		// while a stream is active).
		getInitialMessages: cachedTranscript ? () => fulfilledThenable(cachedTranscript) : undefined,
		// Think assembles the prompt from the stored path, so the server needs
		// to know a regeneration when it sees one. See beforeTurn in ai-thread.
		prepareSendMessagesRequest: ({ trigger }) =>
			trigger === "regenerate-message" ? { body: { regenerate: true } } : {},
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

	// Cache only settled transcripts: seeding a mid-stream partial risks a
	// duplicate assistant bubble if the server's message id drifts while away.
	useEffect(() => {
		if (presentation.isBusy || status !== "ready") {
			return;
		}
		if (messages.length === 0) {
			transcriptCache.delete(threadId);
			return;
		}
		cacheTranscript(threadId, messages);
	}, [messages, presentation.isBusy, status, threadId]);
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
