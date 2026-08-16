import { useChat } from "@ai-sdk/react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { DefaultChatTransport, generateId } from "ai";
import { useEffect } from "react";

import { getAiChatThreadUrl } from "#/features/workspaces/agent-routes";
import {
	aiChatThreadMessagesQueryKey,
	aiChatThreadMessagesQueryOptions,
	aiChatThreadsQueryKey,
} from "#/features/workspaces/ai/chat/chat-queries";
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
	workspaceId: string;
}

// The workspace chat hook, backed by Postgres through the AI SDK's useChat.
//
// The transport sends only the new user message; the server owns the
// transcript (loaded from Postgres per turn), so there is no client/server
// reconciliation. modelId, timeZone, and workspace context ride in the
// request body — a plain HTTP endpoint we own.
export function useWorkspaceAiChat({ modelId, threadId, workspaceId }: UseWorkspaceAiChatOptions) {
	// The transport is static per thread. The *current* model and workspace
	// ride each send's request body instead of living in the transport — the
	// send/regenerate closures re-form every render, so they always carry the
	// latest props without refs or effect events.
	const transport = createAiChatTransport(threadId);

	const chat = useChat<AiChatMessage>({
		id: threadId,
		generateId,
		transport,
		// Batch streaming renders; token-frequency updates otherwise re-render the
		// whole transcript per chunk (the Think client throttled at 100ms too).
		experimental_throttle: 100,
	});
	const {
		error,
		messages,
		regenerate: regenerateChatMessage,
		sendMessage: sendChatMessage,
		setMessages,
		status,
		stop,
	} = chat;

	// Transcript seed via react-query: an instant paint from cache on remount,
	// with a background refetch. The server is the source of truth; an empty
	// result is a valid (new/draft) thread.
	const queryClient = useQueryClient();
	const transcriptQuery = useQuery(aiChatThreadMessagesQueryOptions(threadId));
	// A failed transcript load must NOT present as an empty, sendable thread —
	// sending into unseen history would fork the conversation. It surfaces as a
	// connection error (react-query keeps retrying) and blocks the composer.
	const historyReady = transcriptQuery.isSuccess;
	const transcriptLoadError = transcriptQuery.isError
		? (transcriptQuery.error ?? new Error("Could not load this chat"))
		: undefined;
	// The wire type is plain JSON (see SerializedUiMessage); these rows were
	// UIMessages when persisted, so the cast back is faithful.
	const transcriptData = transcriptQuery.data as AiChatMessage[] | undefined;

	useEffect(() => {
		if (!transcriptData || transcriptData.length === 0 || status !== "ready") {
			return;
		}

		// Seed only while the live chat is idle: adopt the stored transcript when
		// it is longer (cold mount) or same-length-but-different (a remount seeded
		// a stale cache entry that a background refetch then corrected — length
		// alone can't see that). A shorter store never wins: mid-regenerate the
		// server transcript is intentionally behind the live stream.
		setMessages((current) =>
			current.length < transcriptData.length ||
			(current.length === transcriptData.length && current.at(-1)?.id !== transcriptData.at(-1)?.id)
				? transcriptData
				: current,
		);
	}, [setMessages, status, transcriptData]);

	// Write settled transcripts back to the query cache so a remount paints the
	// latest state instantly (the successor of the old client-side LRU cache).
	// Early in a thread, also refetch the sidebar shortly after settling: the
	// generated title lands via waitUntil after the stream closes, and the
	// send-time invalidation always loses that race.
	useEffect(() => {
		if (status !== "ready" || messages.length === 0) {
			return;
		}

		queryClient.setQueryData(aiChatThreadMessagesQueryKey(threadId), messages);

		if (messages.length <= 3) {
			const timer = setTimeout(() => {
				void queryClient.invalidateQueries({ queryKey: aiChatThreadsQueryKey(workspaceId) });
			}, 2500);

			return () => clearTimeout(timer);
		}
	}, [messages, queryClient, status, threadId, workspaceId]);

	const presentation = deriveAiChatPresentation(messages, status, {
		isRecovering: false,
		isServerStreaming: status === "streaming",
		isStreaming: status === "streaming",
		isToolContinuation: false,
	});
	const connectionError = transcriptLoadError ?? (!historyReady && error ? error : undefined);
	const inputStatus: AiChatStatus = connectionError
		? "error"
		: status === "error"
			? "ready"
			: status;
	const canSend = historyReady && inputStatus === "ready" && !presentation.isBusy;

	const sendMessage = (message: AiChatSendMessage, options?: AiChatSendMessageOptions) => {
		if (message.parts.length === 0 || !canSend) {
			throw new Error("Cannot send a chat message while the chat is unavailable");
		}

		const isFirstMessage = messages.length === 0;
		const invalidateThreads = () =>
			void queryClient.invalidateQueries({ queryKey: aiChatThreadsQueryKey(workspaceId) });

		if (isFirstMessage) {
			// The thread row materializes early in the turn (right after the user
			// message persists), not at stream end — refetch the sidebar promptly so
			// the thread appears and "new chat" works while the reply still streams.
			setTimeout(invalidateThreads, 1000);
		}

		void sendChatMessage(message, withRequestContext(options)).then(() => {
			if (isFirstMessage) {
				invalidateThreads();
			}
		});
	};
	const regenerate = (options?: AiChatSendMessageOptions) => {
		if (presentation.isBusy) {
			return;
		}

		void regenerateChatMessage(withRequestContext(options));
	};
	const withRequestContext = (options?: AiChatSendMessageOptions): AiChatSendMessageOptions => ({
		...options,
		body: { modelId, workspaceId, ...options?.body },
	});

	// Stop is explicit and server-side: closing the SSE branch alone never
	// aborts generation (Workers don't fire request.signal), so tell the server
	// to clear the stream claim — the generator notices and aborts, persisting
	// the partial as "interrupted".
	const stopTurn = () => {
		void fetch(`${getAiChatThreadUrl(threadId)}/stop`, { method: "POST" }).catch(() => {});
		void stop();
	};

	// Remove an optimistic message that never reached the server (the queue
	// restores its entry instead, so a failed drain stays retryable).
	const discardMessage = (messageId: string) => {
		setMessages((current) => current.filter((message) => message.id !== messageId));
	};

	return {
		canSend,
		connectionError,
		discardMessage,
		inputStatus,
		messages,
		presentation,
		regenerate,
		sendMessage,
		stop: stopTurn,
	};
}

function createAiChatTransport(threadId: string) {
	return new DefaultChatTransport<AiChatMessage>({
		api: getAiChatThreadUrl(threadId),
		// modelId and workspaceId arrive via request.body (merged in by
		// withRequestContext at send time).
		prepareSendMessagesRequest: (request) => ({
			body: {
				message: request.messages.at(-1),
				timeZone: getClientTimeZone(),
				...(request.trigger === "regenerate-message" ? { trigger: "regenerate-message" } : {}),
				...request.body,
			},
		}),
	});
}

function getClientTimeZone() {
	try {
		return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
	} catch {
		return "UTC";
	}
}
