import { useChat } from "@ai-sdk/react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { DefaultChatTransport, generateId } from "ai";
import { useEffect, useEffectEvent } from "react";

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
	// The transport is stable per thread, but each request must carry the
	// *current* model and workspace. useEffectEvent gives the request-time
	// closure access to the latest props without recreating the transport.
	const getRequestContext = useEffectEvent(() => ({ modelId, workspaceId }));
	// No manual memo: the React Compiler memoizes this on its own (its inferred
	// dependencies conflict with any hand-written list here), and both inputs
	// are stable per thread.
	const transport = createAiChatTransport(threadId, getRequestContext);

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
		if (!transcriptData || transcriptData.length === 0) {
			return;
		}

		// Seed only while the live chat is idle and behind the stored transcript —
		// never clobber an in-flight stream, and let live state win after a
		// regenerate (where the stored transcript is intentionally shorter).
		setMessages((current) => (current.length < transcriptData.length ? transcriptData : current));
	}, [setMessages, transcriptData]);

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
		void sendChatMessage(message, options).then(() => {
			// A draft thread's row materializes on its first message; refetch the
			// sidebar so the new thread (and, shortly after, its title) appears.
			if (isFirstMessage) {
				void queryClient.invalidateQueries({ queryKey: aiChatThreadsQueryKey(workspaceId) });
			}
		});
	};
	const regenerate = (options?: AiChatSendMessageOptions) => {
		if (presentation.isBusy) {
			return;
		}

		void regenerateChatMessage(options);
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

function createAiChatTransport(
	threadId: string,
	getRequestContext: () => { modelId: AiChatModelId; workspaceId: string },
) {
	return new DefaultChatTransport<AiChatMessage>({
		api: getAiChatThreadUrl(threadId),
		prepareSendMessagesRequest: (request) => {
			const { modelId, workspaceId } = getRequestContext();

			return {
				body: {
					message: request.messages.at(-1),
					modelId,
					workspaceId,
					timeZone: getClientTimeZone(),
					...(request.trigger === "regenerate-message" ? { trigger: "regenerate-message" } : {}),
					...request.body,
				},
			};
		},
	});
}

function getClientTimeZone() {
	try {
		return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
	} catch {
		return "UTC";
	}
}
