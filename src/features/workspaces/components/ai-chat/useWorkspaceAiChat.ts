import { useChat } from "@ai-sdk/react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { DefaultChatTransport, generateId } from "ai";
import { useEffect, useEffectEvent, useRef, useState } from "react";

import { BILLING_STATE_QUERY_KEY } from "#/features/account/use-billing-state";
import { getAiChatThreadUrl } from "#/features/workspaces/agent-routes";
import {
	aiChatThreadTranscriptQueryKey,
	aiChatThreadTranscriptQueryOptions,
	aiChatThreadsQueryKey,
} from "#/features/workspaces/ai/chat/chat-queries";
import type { SerializedAiChatThreadTranscript } from "#/features/workspaces/ai/chat/functions";
import { deriveAiChatPresentation } from "#/features/workspaces/components/ai-chat/ai-chat-display-state";
import { isAiChatUsageLimitResponse } from "#/features/workspaces/components/ai-chat/ai-chat-error-state";
import { serverTranscriptAdvanced } from "#/features/workspaces/components/ai-chat/ai-chat-transcript-recovery";
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
	const [requestAccepted, setRequestAccepted] = useState(false);
	const [pendingStop, setPendingStop] = useState(false);
	const stopRequestRef = useRef<Promise<boolean> | null>(null);
	const deferredStopRef = useRef<{
		promise: Promise<boolean>;
		resolve: (stopped: boolean) => void;
	} | null>(null);
	// The transport is static per thread. The *current* model and workspace
	// ride each send's request body instead of living in the transport — the
	// send/regenerate closures re-form every render, so they always carry the
	// latest props without refs or effect events.
	const queryClient = useQueryClient();
	const markTranscriptActive = () => {
		queryClient.setQueryData<SerializedAiChatThreadTranscript>(
			aiChatThreadTranscriptQueryKey(threadId),
			(current) => ({
				isTurnActive: true,
				messages: current?.messages ?? [],
			}),
		);
	};
	const transport = createAiChatTransport(threadId, {
		onRequestStarted: () => {
			setRequestAccepted(false);
			markTranscriptActive();
		},
		onResponseAccepted: () => setRequestAccepted(true),
	});
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
			deferredStopRef.current?.resolve(false);
			deferredStopRef.current = null;
			setRequestAccepted(false);
			setPendingStop(false);
			// A refused request and a severed live stream look identical locally.
			// Block sends until Postgres says whether the Worker still owns the turn.
			markTranscriptActive();
			void queryClient.invalidateQueries({
				queryKey: aiChatThreadTranscriptQueryKey(threadId),
			});
			if (isAiChatUsageLimitResponse(chatError)) {
				void queryClient.invalidateQueries({ queryKey: BILLING_STATE_QUERY_KEY });
			}
		},
		onFinish: () => {
			// Natural completion or the local abort after an acknowledged Stop both
			// make it safe for the convenience queue to continue.
			deferredStopRef.current?.resolve(true);
			deferredStopRef.current = null;
			setRequestAccepted(false);
			setPendingStop(false);
			void queryClient.invalidateQueries({
				queryKey: aiChatThreadTranscriptQueryKey(threadId),
			});
		},
	});
	const {
		clearError,
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
	const transcriptQuery = useQuery(aiChatThreadTranscriptQueryOptions(threadId));
	// A failed transcript load must NOT present as an empty, sendable thread —
	// sending into unseen history would fork the conversation. It surfaces as a
	// connection error (react-query keeps retrying) and blocks the composer.
	const historyReady = transcriptQuery.isSuccess;
	const transcriptLoadError = transcriptQuery.isError
		? (transcriptQuery.error ?? new Error("Could not load this chat"))
		: undefined;
	// The wire type is plain JSON (see SerializedUiMessage); these rows were
	// UIMessages when persisted, so the cast back is faithful.
	const transcript = transcriptQuery.data;
	const transcriptData = transcript?.messages as AiChatMessage[] | undefined;
	const serverTurnActive = transcript?.isTurnActive ?? false;

	useEffect(() => {
		const recoveredAfterError =
			status === "error" &&
			Boolean(transcriptData && serverTranscriptAdvanced(messages, transcriptData));
		if (!transcriptData || serverTurnActive || (status !== "ready" && !recoveredAfterError)) {
			return;
		}

		// Once Postgres says the turn is settled, its complete snapshot wins. IDs
		// and lengths are insufficient: the SDK's local row can share an id with
		// the durable row while lacking its interrupted/error metadata.
		setMessages(transcriptData);
		if (recoveredAfterError) {
			clearError();
		}
	}, [clearError, messages, serverTurnActive, setMessages, status, transcriptData]);

	// True from the stop click until the server confirms the stopped turn
	// settled (its interrupted partial persisted, claim cleared). Gating sends
	// on it means a stop-then-send-now never races the dying turn.
	// Reloading severs only the browser stream; the Worker keeps generating.
	// The server claim remains authoritative until its durable outcome lands.
	const recoveredStatus: AiChatStatus = serverTurnActive ? "streaming" : status;
	const presentation = deriveAiChatPresentation(messages, recoveredStatus);
	const connectionError = transcriptLoadError ?? (!historyReady && error ? error : undefined);
	const inputStatus: AiChatStatus = connectionError
		? "error"
		: recoveredStatus === "error"
			? "ready"
			: recoveredStatus;
	const canSend = historyReady && inputStatus === "ready" && !presentation.isBusy;

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
	// durably tombstones the claim; transcript polling observes settlement.
	const sendStopRequest = (): Promise<boolean> => {
		if (stopRequestRef.current) {
			return stopRequestRef.current;
		}

		// The stop endpoint acknowledges durable intent, not terminal settlement.
		// Mark the cached snapshot active before closing the browser stream so the
		// local queue cannot drain until polling observes the released claim.
		markTranscriptActive();
		const request = fetch(`${getAiChatThreadUrl(threadId)}/stop`, { method: "POST" })
			.then((response) => {
				deferredStopRef.current?.resolve(response.ok);
				deferredStopRef.current = null;
				if (!response.ok) {
					return false;
				}
				// Only close the local stream after the server has persisted the
				// stop tombstone. Postgres polling owns terminal settlement.
				void stop();
				void queryClient.invalidateQueries({
					queryKey: aiChatThreadTranscriptQueryKey(threadId),
				});
				return true;
			})
			.catch(() => {
				deferredStopRef.current?.resolve(false);
				deferredStopRef.current = null;
				return false;
			})
			.finally(() => {
				stopRequestRef.current = null;
				setPendingStop(false);
			});
		stopRequestRef.current = request;
		return request;
	};
	const stopTurn = (): Promise<boolean> => {
		// useChat exposes Stop before the transport has a response. At that point
		// the streaming request may not have acquired its database claim yet, so a
		// concurrent stop request could arrive first and stop nothing. Remember the
		// click locally and send it as soon as the successful response proves the
		// turn has been accepted. The queue itself remains local and disposable.
		if (status !== "ready" && !requestAccepted) {
			setPendingStop(true);
			if (!deferredStopRef.current) {
				let resolve!: (stopped: boolean) => void;
				const promise = new Promise<boolean>((resolvePromise) => {
					resolve = resolvePromise;
				});
				deferredStopRef.current = { promise, resolve };
			}
			return deferredStopRef.current.promise;
		}

		setPendingStop(false);
		return sendStopRequest();
	};
	const sendAcceptedStop = useEffectEvent(sendStopRequest);
	useEffect(() => {
		if (requestAccepted && pendingStop) {
			void sendAcceptedStop().then((stopped) => {
				deferredStopRef.current?.resolve(stopped);
				deferredStopRef.current = null;
			});
		}
	}, [pendingStop, requestAccepted]);

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

function createAiChatTransport(
	threadId: string,
	lifecycle: { onRequestStarted: () => void; onResponseAccepted: () => void },
) {
	return new DefaultChatTransport<AiChatMessage>({
		api: getAiChatThreadUrl(threadId),
		fetch: async (input, init) => {
			lifecycle.onRequestStarted();
			const response = await fetch(input, init);
			if (response.ok) {
				lifecycle.onResponseAccepted();
			}
			return response;
		},
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
