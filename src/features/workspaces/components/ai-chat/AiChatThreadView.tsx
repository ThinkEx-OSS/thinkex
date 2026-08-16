import { generateId } from "ai";
import { useEffect, useEffectEvent, useState } from "react";

import type { PromptInputMessage } from "#/features/workspaces/components/ai-chat/ai-chat-prompt-input";
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
	onStartNewChat,
	threadId,
}: {
	context: WorkspaceAiContextScope;
	modelId: AiChatModelId;
	onModelChange: (modelId: AiChatModelId) => void;
	onStartNewChat?: () => void;
	threadId: string;
}) {
	// Option-zero spike: the chat runs on the Postgres/AI SDK endpoint instead
	// of Think's AIThread. See AI-CHAT-RUNTIME-EVAL.md on the flue-spike branch.
	const chat = useWorkspaceAiChat({ modelId, threadId, workspaceId: context.workspaceId });
	const [sentMessageAnimationId, setSentMessageAnimationId] = useState<string | null>(null);
	const [scrollAnchorMessageId, setScrollAnchorMessageId] = useState<string | null>(null);
	const {
		canSend,
		connectionError,
		inputStatus,
		messages,
		presentation,
		regenerate,
		sendMessage: sendChatMessage,
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

	const lastMessage = messages.at(-1);
	const lastMessageMetadata = lastMessage?.metadata as { errorMessage?: string } | undefined;
	const assistantError = deriveAiChatAssistantErrorState({
		chatStatus: presentation.status,
		hasConnectionError: Boolean(connectionError),
		hasMessages: messages.length > 0,
		lastMessageRole: lastMessage?.role,
		lastMessageErrorMessage: lastMessageMetadata?.errorMessage,
	});
	const sendMessage = (message: PromptInputMessage, clearDraft = true) => {
		const chatMessage = getChatMessageFromPrompt(message, generateId());

		if (!chatMessage) {
			throw new Error("Cannot send an empty chat message");
		}

		setScrollAnchorMessageId(chatMessage.id);
		sendChatMessage(chatMessage, {
			body: {
				workspaceAiContext: buildWorkspaceAiContextSnapshot(context),
			},
		});
		setSentMessageAnimationId(chatMessage.id);
		if (clearDraft) clearDraftArtifacts(context.workspaceId, threadId);
	};
	const sendQueuedEntry = useEffectEvent((entry: WorkspaceAiQueuedMessage) => {
		const chatMessage = getChatMessageFromPrompt(
			{ files: entry.files, text: entry.text },
			entry.id,
		);
		if (!chatMessage) {
			restoreQueueHead(threadId, entry);
			return;
		}
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
		setScrollAnchorMessageId(entry.promoted ? chatMessage.id : null);
		setSentMessageAnimationId(chatMessage.id);
	});
	useEffect(() => {
		if (
			!queueHead ||
			!canDrainQueuedMessage({
				canSend,
				errorKind: assistantError?.kind,
				isBlocked,
				paused: queuePaused,
				promoted: queueHead.promoted,
			})
		) {
			return;
		}

		// Take and send in the same microtask: the id guard makes duplicate effect
		// schedules harmless, while no render can drain the next head in between.
		queueMicrotask(() => {
			const entry = takeQueueHead(threadId, queueHead.id);
			if (entry) {
				sendQueuedEntry(entry);
			}
		});
	}, [canSend, assistantError?.kind, isBlocked, queueHead, queuePaused, takeQueueHead, threadId]);
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
				anchorMessageId={scrollAnchorMessageId}
				assistantError={assistantError}
				messages={messages}
				presentation={presentation}
				sentMessageAnimationId={sentMessageAnimationId}
				workspaceId={context.workspaceId}
				onRegenerateLastResponse={() =>
					// Regenerated turns re-run against the *current* workspace context,
					// same as a fresh send — omitting it silently degraded the reply.
					regenerate({
						body: { workspaceAiContext: buildWorkspaceAiContextSnapshot(context) },
					})
				}
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
