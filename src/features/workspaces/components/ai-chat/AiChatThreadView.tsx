import { generateId } from "ai";
import { useEffect, useEffectEvent, useLayoutEffect, useRef, useState } from "react";

import type { PromptInputMessage } from "#/features/workspaces/components/ai-chat/ai-chat-prompt-input";
import type { AIThreadSummary } from "#/features/workspaces/ai/user-ai-agents";
import AiChatMessageList from "#/features/workspaces/components/ai-chat/AiChatMessageList";
import AiChatPromptInput from "#/features/workspaces/components/ai-chat/AiChatPromptInput";
import { deriveAiChatAssistantErrorState } from "#/features/workspaces/components/ai-chat/ai-chat-error-state";
import { aiChatComposerRailClassName } from "#/features/workspaces/components/ai-chat/ai-chat-layout";
import type {
	AiChatModelId,
	AiChatSendMessage,
} from "#/features/workspaces/components/ai-chat/types";
import { canDrainQueuedMessage } from "#/features/workspaces/components/ai-chat/ai-chat-queue-drain";
import { useWorkspaceAiChat } from "#/features/workspaces/components/ai-chat/useWorkspaceAiChat";
import { useWorkspaceAiAllowance } from "#/features/workspaces/ai/use-workspace-ai-allowance";
import type { WorkspaceAiContextScope } from "#/features/workspaces/model/workspace-ai-context-types";
import { buildWorkspaceAiContextSnapshot } from "#/features/workspaces/model/workspace-ai-context-snapshot";
import { useWorkspaceAiComposerDraftStore } from "#/features/workspaces/state/workspace-ai-composer-draft-store";
import {
	useWorkspaceAiQueueHead,
	useWorkspaceAiQueuePaused,
	useWorkspaceAiQueueStore,
	type WorkspaceAiQueuedMessage,
} from "#/features/workspaces/state/workspace-ai-queue-store";

export default function AiChatThreadView({
	context,
	modelId,
	onModelChange,
	onRecoveringChange,
	onStartNewChat,
	threadSummary,
	threadId,
}: {
	context: WorkspaceAiContextScope;
	modelId: AiChatModelId;
	onModelChange: (modelId: AiChatModelId) => void;
	onRecoveringChange?: (isRecovering: boolean) => void;
	onStartNewChat?: () => void;
	threadSummary?: AIThreadSummary;
	threadId: string;
}) {
	const chat = useWorkspaceAiChat({ modelId, threadId });
	const [sentMessageAnimationId, setSentMessageAnimationId] = useState<string | null>(null);
	const {
		canSend,
		connectionError,
		inputStatus,
		messages,
		presentation,
		regenerate,
		sendMessage: sendChatMessage,
		setMessages,
		stop,
	} = chat;
	const clearDraftArtifacts = useWorkspaceAiComposerDraftStore(
		(state) => state.clearDraftArtifacts,
	);
	const queueHead = useWorkspaceAiQueueHead(threadId);
	const queuePaused = useWorkspaceAiQueuePaused(threadId);
	const takeQueueHead = useWorkspaceAiQueueStore((state) => state.takeHead);
	const restoreQueueHead = useWorkspaceAiQueueStore((state) => state.restoreAtHead);
	const moveQueueEntryToHead = useWorkspaceAiQueueStore((state) => state.moveToHead);
	const pauseQueue = useWorkspaceAiQueueStore((state) => state.pause);
	const resumeQueue = useWorkspaceAiQueueStore((state) => state.resume);
	const { isBlocked } = useWorkspaceAiAllowance(modelId);

	useEffect(() => {
		onRecoveringChange?.(presentation.isRecovering);
		if (!presentation.isRecovering) {
			return;
		}

		return () => {
			onRecoveringChange?.(false);
		};
	}, [onRecoveringChange, presentation.isRecovering]);

	const assistantError = deriveAiChatAssistantErrorState({
		chatStatus: presentation.status,
		hasConnectionError: Boolean(connectionError),
		lastMessageRole: messages.at(-1)?.role,
		threadSummary,
	});
	// The server rebroadcasts a full transcript snapshot after each turn, with
	// saves debounced up to 750ms — a message sent in the gap between the stream
	// closing and that snapshot arriving gets its optimistic copy wiped, because
	// the snapshot predates it (the assistant tail survives via the transport's
	// streaming protection; user messages get none). Track the in-flight send
	// and re-insert it locally, right after the message it originally followed,
	// until the turn's final snapshot includes it.
	const pendingSendRef = useRef<{ message: AiChatSendMessage; anchorId: string | null } | null>(
		null,
	);
	const healPendingSend = useEffectEvent(() => {
		const pending = pendingSendRef.current;
		if (!pending) return;
		if (inputStatus === "ready" || inputStatus === "error") {
			pendingSendRef.current = null;
			return;
		}
		if (messages.some((message) => message.id === pending.message.id)) return;
		setMessages((current) => {
			if (current.some((message) => message.id === pending.message.id)) return current;
			const next = [...current];
			const anchorIndex = pending.anchorId
				? next.findIndex((message) => message.id === pending.anchorId)
				: -1;
			next.splice(anchorIndex >= 0 ? anchorIndex + 1 : next.length, 0, pending.message);
			return next;
		});
	});
	// Runs before paint so a wiped message is restored in the same frame — the
	// user never sees it vanish, and the list stays a clean single append that
	// the scroller treats like any natural send.
	useLayoutEffect(() => {
		healPendingSend();
	}, [inputStatus, messages]);
	const trackPendingSend = useEffectEvent((message: AiChatSendMessage) => {
		pendingSendRef.current = { anchorId: messages.at(-1)?.id ?? null, message };
	});

	const sendMessage = (message: PromptInputMessage, clearDraft = true) => {
		const chatMessage = getChatMessageFromPrompt(message, generateId());

		if (!chatMessage) {
			throw new Error("Cannot send an empty chat message");
		}

		sendChatMessage(chatMessage, {
			body: {
				workspaceAiContext: buildWorkspaceAiContextSnapshot(context),
			},
		});
		trackPendingSend(chatMessage);
		setSentMessageAnimationId(chatMessage.id);
		if (clearDraft) clearDraftArtifacts(context.workspaceId, threadId);
	};
	// takeHead's id guard makes duplicate effect runs (strict mode) send-once,
	// and the microtask send below cannot be interrupted by an unmount, so a
	// taken entry is never stranded.
	const sendQueuedEntry = useEffectEvent((entry: WorkspaceAiQueuedMessage) => {
		const chatMessage = getChatMessageFromPrompt(
			{ files: entry.files, text: entry.text },
			entry.id,
		);
		if (!chatMessage) return;
		try {
			sendChatMessage(chatMessage, {
				body: {
					workspaceAiContext: entry.contextSnapshot ?? buildWorkspaceAiContextSnapshot(context),
				},
			});
		} catch {
			restoreQueueHead(threadId, entry);
			return;
		}
		trackPendingSend(chatMessage);
		setSentMessageAnimationId(chatMessage.id);
	});
	const hasAssistantError = assistantError !== null;
	useEffect(() => {
		if (
			!queueHead ||
			!canDrainQueuedMessage({
				canSend,
				hasAssistantError,
				hasConnectionError: Boolean(connectionError),
				hasHead: true,
				inputStatus,
				isBlocked,
				paused: queuePaused,
			})
		) {
			return;
		}

		const entry = takeQueueHead(threadId, queueHead.id);
		if (entry) queueMicrotask(() => sendQueuedEntry(entry));
	}, [
		canSend,
		connectionError,
		hasAssistantError,
		inputStatus,
		isBlocked,
		queueHead,
		queuePaused,
		takeQueueHead,
		threadId,
	]);
	const stopGeneration = () => {
		void stop();
	};
	const handleUserStop = () => {
		pauseQueue(threadId);
		stopGeneration();
	};
	const handleSendNow = (entryId: string) => {
		moveQueueEntryToHead(threadId, entryId);
		resumeQueue(threadId);
		if (inputStatus !== "ready") stopGeneration();
	};

	return (
		<div className="relative flex min-h-0 flex-1 flex-col">
			<AiChatMessageList
				assistantError={assistantError}
				messages={messages}
				presentation={presentation}
				sentMessageAnimationId={sentMessageAnimationId}
				workspaceId={context.workspaceId}
				onRegenerateLastResponse={regenerate}
				onStartNewChat={onStartNewChat}
			/>

			<div className="px-3 pb-3">
				<div className={aiChatComposerRailClassName}>
					<AiChatPromptInput
						activeThreadId={threadId}
						canSend={canSend}
						context={context}
						modelId={modelId}
						status={inputStatus}
						onModelChange={onModelChange}
						onSubmit={(message) => sendMessage(message)}
						onStop={handleUserStop}
						onInterrupt={stopGeneration}
						onSendNow={handleSendNow}
					/>
				</div>
			</div>
		</div>
	);
}

function getChatMessageFromPrompt(
	message: PromptInputMessage,
	id: string,
): AiChatSendMessage | null {
	const trimmedText = message.text.trim();
	const parts = [
		...(trimmedText ? [{ type: "text" as const, text: trimmedText }] : []),
		...message.files,
	];

	if (parts.length === 0) {
		return null;
	}

	return { id, role: "user", parts };
}
