import { generateId } from "ai";
import { useEffect, useEffectEvent, useState } from "react";

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
import { useWorkspaceAiChat } from "#/features/workspaces/components/ai-chat/useWorkspaceAiChat";
import { useWorkspaceAiAllowance } from "#/features/workspaces/ai/use-workspace-ai-allowance";
import type { WorkspaceAiContextScope } from "#/features/workspaces/model/workspace-ai-context-types";
import { buildWorkspaceAiContextSnapshot } from "#/features/workspaces/model/workspace-ai-context-snapshot";
import {
	useWorkspaceAiComposerDraftStore,
	useWorkspaceAiDirectPrompt,
} from "#/features/workspaces/state/workspace-ai-composer-draft-store";

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
		stop,
	} = chat;
	const clearDraftArtifacts = useWorkspaceAiComposerDraftStore(
		(state) => state.clearDraftArtifacts,
	);
	const directPrompt = useWorkspaceAiDirectPrompt(threadId);
	const setDraftText = useWorkspaceAiComposerDraftStore((state) => state.setText);
	const takeDirectPrompt = useWorkspaceAiComposerDraftStore((state) => state.takeDirectPrompt);
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
		setSentMessageAnimationId(chatMessage.id);
		if (clearDraft) clearDraftArtifacts(context.workspaceId, threadId);
	};
	const sendDirectPrompt = useEffectEvent((text: string) => {
		sendMessage({ files: [], text }, false);
	});
	useEffect(() => {
		if (!directPrompt) return;
		if (isBlocked || connectionError || presentation.isBusy) {
			const text = takeDirectPrompt(threadId, directPrompt.id);
			if (text) {
				queueMicrotask(() =>
					setDraftText(threadId, (current) => (current.trim() ? `${current}\n\n${text}` : text)),
				);
			}
			return;
		}
		if (!canSend || inputStatus !== "ready") return;
		const text = takeDirectPrompt(threadId, directPrompt.id);
		if (text) queueMicrotask(() => sendDirectPrompt(text));
	}, [
		canSend,
		connectionError,
		directPrompt,
		inputStatus,
		isBlocked,
		presentation.isBusy,
		setDraftText,
		takeDirectPrompt,
		threadId,
	]);

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
						onStop={() => {
							void stop();
						}}
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
