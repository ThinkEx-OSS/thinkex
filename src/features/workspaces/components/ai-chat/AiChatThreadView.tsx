import { generateId } from "ai";
import { useEffect, useState } from "react";

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
import type { WorkspaceAiContextScope } from "#/features/workspaces/model/workspace-ai-context-types";
import { buildWorkspaceAiContextSnapshot } from "#/features/workspaces/model/workspace-ai-context-snapshot";
import { useWorkspaceAiComposerDraftStore } from "#/features/workspaces/state/workspace-ai-composer-draft-store";

export default function AiChatThreadView({
	context,
	modelId,
	onModelChange,
	onRecoveringChange,
	threadSummary,
	threadId,
}: {
	context: WorkspaceAiContextScope;
	modelId: AiChatModelId;
	onModelChange: (modelId: AiChatModelId) => void;
	onRecoveringChange?: (isRecovering: boolean) => void;
	threadSummary?: AIThreadSummary;
	threadId: string;
}) {
	const chat = useWorkspaceAiChat({ modelId, threadId });
	const [sentMessageAnimationId, setSentMessageAnimationId] = useState<string | null>(null);
	const {
		browser,
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
		threadSummary,
	});
	const stopChatAndBrowser = () => {
		void stop();
		if (browser.hasSession || browser.handoff) {
			void browser.stopBrowser().catch(() => undefined);
		}
	};

	const sendMessage = (message: PromptInputMessage) => {
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
		clearDraftArtifacts(context.workspaceId, threadId);
	};

	return (
		<div className="relative flex min-h-0 flex-1 flex-col">
			<AiChatMessageList
				assistantError={assistantError}
				browser={browser}
				messages={messages}
				presentation={presentation}
				sentMessageAnimationId={sentMessageAnimationId}
				workspaceId={context.workspaceId}
				onRegenerateLastResponse={regenerate}
				onStopBrowser={stopChatAndBrowser}
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
						onSubmit={sendMessage}
						onStop={() => {
							stopChatAndBrowser();
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
