import { useEffect } from "react";

import type { PromptInputMessage } from "#/features/workspaces/components/ai-chat/ai-chat-prompt-input";
import type { AIInspectorSnapshot } from "#/features/workspaces/ai/ai-inspector";
import type { AIThreadSummary } from "#/features/workspaces/ai/user-ai-agents";
import AiChatMessageList, {
	type AiChatAssistantErrorState,
} from "#/features/workspaces/components/ai-chat/AiChatMessageList";
import AiChatPromptInput from "#/features/workspaces/components/ai-chat/AiChatPromptInput";
import { aiChatComposerRailClassName } from "#/features/workspaces/components/ai-chat/ai-chat-layout";
import type {
	AiChatModelId,
	AiChatSendMessage,
	AiChatStatus,
} from "#/features/workspaces/components/ai-chat/types";
import { useWorkspaceAiChat } from "#/features/workspaces/components/ai-chat/useWorkspaceAiChat";
import type { WorkspaceAiContextScope } from "#/features/workspaces/model/workspace-ai-context";
import { buildWorkspaceAiContextSnapshot } from "#/features/workspaces/model/workspace-ai-context";
import { useWorkspaceAiComposerDraftStore } from "#/features/workspaces/state/workspace-ai-composer-draft-store";

export default function AiChatThreadView({
	context,
	getInspectorSnapshot,
	modelId,
	onModelChange,
	onRecoveringChange,
	threadSummary,
	threadId,
}: {
	context: WorkspaceAiContextScope;
	getInspectorSnapshot?: (threadId: string) => Promise<AIInspectorSnapshot>;
	modelId: AiChatModelId;
	onModelChange: (modelId: AiChatModelId) => void;
	onRecoveringChange?: (isRecovering: boolean) => void;
	threadSummary?: AIThreadSummary;
	threadId: string;
}) {
	const chat = useWorkspaceAiChat({ modelId, threadId });
	const {
		error,
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

	const assistantError = getAssistantErrorState({
		hasLiveError: Boolean(error),
		inputStatus,
		threadSummary,
	});

	const sendMessage = (message: PromptInputMessage) => {
		const chatMessage = getChatMessageFromPrompt(message);

		if (!chatMessage) {
			return false;
		}

		const didSend = sendChatMessage(chatMessage, {
			body: {
				workspaceAiContext: buildWorkspaceAiContextSnapshot(context),
			},
		});

		if (didSend) {
			clearDraftArtifacts(context.workspaceId);
		}

		return didSend;
	};

	return (
		<div className="relative flex min-h-0 flex-1 flex-col">
			<AiChatMessageList
				assistantError={assistantError}
				messages={messages}
				presentation={presentation}
				workspaceId={context.workspaceId}
				onRegenerateLastResponse={regenerate}
			/>

			<div className="px-3 pb-3">
				<div className={aiChatComposerRailClassName}>
					<AiChatPromptInput
						activeThreadId={threadId}
						context={context}
						getInspectorSnapshot={getInspectorSnapshot}
						modelId={modelId}
						status={inputStatus}
						onModelChange={onModelChange}
						onSubmit={sendMessage}
						onStop={() => {
							void stop();
						}}
					/>
				</div>
			</div>
		</div>
	);
}

function getChatMessageFromPrompt(message: PromptInputMessage): AiChatSendMessage | null {
	const trimmedText = message.text.trim();
	const parts = [
		...(trimmedText ? [{ type: "text" as const, text: trimmedText }] : []),
		...message.files,
	];

	if (parts.length === 0) {
		return null;
	}

	return { role: "user", parts };
}

function getAssistantErrorState(input: {
	hasLiveError: boolean;
	inputStatus: AiChatStatus;
	threadSummary?: AIThreadSummary;
}): AiChatAssistantErrorState | null {
	if (input.inputStatus !== "ready") {
		return null;
	}

	if (input.hasLiveError) {
		return {
			classification: input.threadSummary?.lastErrorClassification,
			stage: input.threadSummary?.lastErrorStage,
		};
	}

	if (input.threadSummary?.lastRunResult === "error") {
		return {
			classification: input.threadSummary.lastErrorClassification,
			stage: input.threadSummary.lastErrorStage,
		};
	}

	return null;
}
