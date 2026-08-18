import { useChat } from "@ai-sdk/react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { DefaultChatTransport, generateId } from "ai";
import { useEffect, useState } from "react";

import { BILLING_STATE_QUERY_KEY } from "#/features/account/use-billing-state";
import { getAiChatThreadUrl } from "#/features/workspaces/agent-routes";
import {
	aiChatThreadMessagesQueryKey,
	aiChatThreadMessagesQueryOptions,
	aiChatThreadsQueryKey,
} from "#/features/workspaces/ai/chat/chat-queries";
import { deriveAiChatPresentation } from "#/features/workspaces/components/ai-chat/ai-chat-display-state";
import { isAiChatUsageLimitResponse } from "#/features/workspaces/components/ai-chat/ai-chat-error-state";
import {
	parseCodemodeActivityEvent,
	type AiChatLiveCodemodeActivity,
} from "#/features/workspaces/components/ai-chat/ai-chat-live-activity";
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
	// Captured fresh for EVERY outgoing request (send, queued drain, and
	// regenerate alike) so no call site can forget to attach it — omitting the
	// workspace context silently degrades replies, which already bit once.
	getWorkspaceAiContext?: () => unknown;
}

// The workspace chat hook, backed by Postgres through the AI SDK's useChat.
//
// The transport sends only the new user message; the server owns the
// transcript (loaded from Postgres per turn), so there is no client/server
// reconciliation. modelId, timeZone, and workspace context ride in the
// request body — a plain HTTP endpoint we own.
export function useWorkspaceAiChat({
	modelId,
	threadId,
	workspaceId,
	getWorkspaceAiContext,
}: UseWorkspaceAiChatOptions) {
	// The transport is static per thread. The *current* model and workspace
	// ride each send's request body instead of living in the transport — the
	// send/regenerate closures re-form every render, so they always carry the
	// latest props without refs or effect events.
	const transport = createAiChatTransport(threadId);
	const queryClient = useQueryClient();
	// Live progress for orchestrate (Code Mode) runs: transient stream parts,
	// latest event per call id. Never persisted — settled tool parts carry a
	// durable record — so the map only matters while its turn streams.
	const [liveCodemodeActivity, setLiveCodemodeActivity] = useState<AiChatLiveCodemodeActivity>({});

	const chat = useChat<AiChatMessage>({
		id: threadId,
		generateId,
		transport,
		// Batch streaming renders; token-frequency updates otherwise re-render the
		// whole transcript per chunk (the Think client throttled at 100ms too).
		experimental_throttle: 100,
		// The generated title arrives through the stream (a data part written
		// mid-generation) instead of being polled for — refetch the sidebar the
		// moment it exists.
		onData: (part) => {
			if (part.type === "data-thread-title") {
				void queryClient.invalidateQueries({ queryKey: aiChatThreadsQueryKey(workspaceId) });
			}

			if (part.type === "data-codemode-activity") {
				const event = parseCodemodeActivityEvent(part.data);
				if (event) {
					setLiveCodemodeActivity((current) => ({ ...current, [event.invocationId]: event }));
				}
			}
		},
		// A refused turn is the one moment the advisory balance cache is provably
		// wrong, so it is the only moment worth refetching: the composer's
		// allowance notice then appears at the wall instead of up to a minute
		// after it, carrying the reset date and the upgrade path with it.
		// Deliberately not on every turn end — that would spend an Autumn
		// round-trip per message to close a window the server gate already covers.
		onError: (chatError) => {
			if (isAiChatUsageLimitResponse(chatError)) {
				void queryClient.invalidateQueries({ queryKey: BILLING_STATE_QUERY_KEY });
			}
		},
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
	useEffect(() => {
		if (status !== "ready" || messages.length === 0) {
			return;
		}

		queryClient.setQueryData(aiChatThreadMessagesQueryKey(threadId), messages);
	}, [messages, queryClient, status, threadId]);

	// True from the stop click until the server confirms the stopped turn
	// settled (its interrupted partial persisted, claim cleared). Gating sends
	// on it means a stop-then-send-now never races the dying turn.
	const [isStopping, setIsStopping] = useState(false);
	const presentation = deriveAiChatPresentation(messages, status);
	const connectionError = transcriptLoadError ?? (!historyReady && error ? error : undefined);
	const inputStatus: AiChatStatus = connectionError
		? "error"
		: status === "error"
			? "ready"
			: status;
	const canSend = historyReady && inputStatus === "ready" && !presentation.isBusy && !isStopping;

	const sendMessage = (message: AiChatSendMessage, options?: AiChatSendMessageOptions) => {
		if (message.parts.length === 0 || !canSend) {
			throw new Error("Cannot send a chat message while the chat is unavailable");
		}

		const isFirstMessage = messages.length === 0;

		void sendChatMessage(message, withRequestContext(options)).then(() => {
			// A draft thread's row materializes on its first message. The generated
			// title arrives mid-stream via onData; this covers the row itself for
			// turns too short for the title to land in time.
			if (isFirstMessage) {
				void queryClient.invalidateQueries({ queryKey: aiChatThreadsQueryKey(workspaceId) });
			}
		});
	};
	// Edit-and-resend: the server treats a resent user-message id as
	// truncate-and-rerun, so editing is sending the same id with new parts.
	// Drop the old copy and everything after it locally first — the SDK's send
	// pushes the new copy, and the old reply is gone server-side anyway.
	const editMessage = (message: AiChatSendMessage) => {
		if (message.parts.length === 0 || !canSend) {
			throw new Error("Cannot edit a chat message while the chat is unavailable");
		}

		setMessages((current) => {
			const index = current.findIndex((entry) => entry.id === message.id);
			return index === -1 ? current : current.slice(0, index);
		});
		void sendChatMessage(message, withRequestContext());
	};
	const regenerate = (options?: AiChatSendMessageOptions) => {
		if (presentation.isBusy) {
			return;
		}

		const last = messages.at(-1);

		if (last?.role === "user") {
			// The failed turn never produced a reply row (409/429/network before
			// persistence): a regenerate trigger would ignore this message — or
			// worse, delete a newer reply. Re-SEND the tail instead; the server
			// treats a resent id as truncate-and-rerun. Pop first so the SDK's
			// push doesn't duplicate it locally.
			setMessages((current) => current.slice(0, -1));
			void sendChatMessage(last, withRequestContext(options));
			return;
		}

		void regenerateChatMessage(withRequestContext(options));
	};
	const withRequestContext = (options?: AiChatSendMessageOptions): AiChatSendMessageOptions => ({
		...options,
		body: {
			modelId,
			workspaceId,
			workspaceAiContext: getWorkspaceAiContext?.(),
			...options?.body,
		},
	});

	// Stop is explicit and server-side: closing the SSE branch alone never
	// aborts generation (Workers don't fire request.signal). The stop endpoint
	// tombstones the claim and responds only after the stopped turn settles.
	const stopTurn = () => {
		setIsStopping(true);
		void fetch(`${getAiChatThreadUrl(threadId)}/stop`, { method: "POST" })
			.catch(() => {})
			.finally(() => setIsStopping(false));
		void stop();
	};

	return {
		canSend,
		// The live turn error, for the row that has to explain it. `connectionError`
		// only ever carries the history-load failure.
		chatError: error,
		connectionError,
		editMessage,
		inputStatus,
		liveCodemodeActivity,
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
