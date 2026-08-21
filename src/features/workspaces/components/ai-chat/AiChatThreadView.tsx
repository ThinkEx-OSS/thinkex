import { generateId } from "ai";
import { useEffect, useEffectEvent, useState } from "react";
import { toast } from "sonner";

import { WORKSPACE_AI_CHAT_ATTACHMENT_POLICY } from "#/features/workspaces/ai/chat-attachment-policy";

import type { PromptInputMessage } from "#/features/workspaces/components/ai-chat/ai-chat-prompt-input";
import AiChatMessageList from "#/features/workspaces/components/ai-chat/AiChatMessageList";
import AiChatPromptInput from "#/features/workspaces/components/ai-chat/AiChatPromptInput";
import { deriveAiChatAssistantErrorState } from "#/features/workspaces/components/ai-chat/ai-chat-error-state";
import { aiChatComposerRailClassName } from "#/features/workspaces/components/ai-chat/ai-chat-layout";
import type {
	AiChatMessage,
	AiChatModelId,
	AiChatSendMessage,
} from "#/features/workspaces/components/ai-chat/types";
import { canDrainQueuedMessage } from "#/features/workspaces/components/ai-chat/ai-chat-queue-drain";
import AiChatQuestionCard from "#/features/workspaces/components/ai-chat/AiChatQuestionCard";
import {
	formatQuestionAnswerText,
	getPendingQuestions,
	type AiChatQuestionAnswer,
} from "#/features/workspaces/components/ai-chat/ai-chat-question";
import { AiChatLiveActivityProvider } from "#/features/workspaces/components/ai-chat/ai-chat-live-activity";
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
	const chat = useWorkspaceAiChat({
		modelId,
		threadId,
		workspaceId: context.workspaceId,
		getWorkspaceAiContext: () => buildWorkspaceAiContextSnapshot(context),
	});
	const [sentMessageAnimationId, setSentMessageAnimationId] = useState<string | null>(null);
	const [scrollAnchorMessageId, setScrollAnchorMessageId] = useState<string | null>(null);
	const {
		canSend,
		chatError,
		connectionError,
		editMessage,
		inputStatus,
		liveCodemodeActivity,
		messages,
		presentation,
		regenerate,
		sendMessage: sendChatMessage,
		stop,
	} = chat;
	// Editing the latest user message reuses the main composer (ai-chatbot's
	// pattern): its text is loaded as the draft, a banner marks the mode, and
	// submitting resends the same message id — the server treats that as
	// truncate-and-rerun, replacing the previous response. The message's
	// original attachments are kept; newly staged files are added.
	const [editing, setEditing] = useState<{
		fileParts: AiChatMessage["parts"];
		messageId: string;
		previousDraft: string;
	} | null>(null);
	const setDraftText = useWorkspaceAiComposerDraftStore((state) => state.setText);
	const startEditing = (message: AiChatMessage) => {
		const text = message.parts
			.flatMap((part) => (part.type === "text" ? part.text : []))
			.join("\n\n");

		setEditing({
			fileParts: message.parts.filter((part) => part.type === "file"),
			messageId: message.id,
			previousDraft: useWorkspaceAiComposerDraftStore.getState().textByThreadId[threadId] ?? "",
		});
		setDraftText(threadId, text);
	};
	const cancelEditing = () => setEditing(null);
	// Leaving edit mode — cancel, submit, or the per-thread remount on a thread
	// switch — gives back the draft the edit displaced. Cleanup-only: the state
	// change that triggers it happens in the event handlers.
	useEffect(() => {
		if (!editing) {
			return undefined;
		}
		return () => setDraftText(threadId, editing.previousDraft);
	}, [editing, setDraftText, threadId]);
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
	const pendingQuestions = getPendingQuestions(messages);

	const lastMessage = messages.at(-1);
	const lastMessageMetadata = lastMessage?.metadata as { errorMessage?: string } | undefined;
	const assistantError = deriveAiChatAssistantErrorState({
		chatError,
		chatStatus: presentation.status,
		hasConnectionError: Boolean(connectionError),
		hasMessages: messages.length > 0,
		lastMessageRole: lastMessage?.role,
		lastMessageErrorMessage: lastMessageMetadata?.errorMessage,
	});
	const sendMessage = (message: PromptInputMessage) => {
		const chatMessage = getChatMessageFromPrompt(message, generateId());

		if (!chatMessage) {
			throw new Error("Cannot send an empty chat message");
		}

		setScrollAnchorMessageId(chatMessage.id);
		sendChatMessage(chatMessage);
		setSentMessageAnimationId(chatMessage.id);
		clearDraftArtifacts(context.workspaceId, threadId);
	};
	const submitEditedMessage = (message: PromptInputMessage) => {
		if (!editing) {
			return;
		}

		// The intake limit only counted newly staged files; with the original
		// attachments riding along, the combined message must still fit it.
		if (
			editing.fileParts.length + message.files.length >
			WORKSPACE_AI_CHAT_ATTACHMENT_POLICY.maxFiles
		) {
			toast.error(
				`A message can include at most ${WORKSPACE_AI_CHAT_ATTACHMENT_POLICY.maxFiles} attachments.`,
			);
			return;
		}

		// Same id, new parts: the server treats the resend as truncate-and-rerun.
		// The message's original attachments ride along ahead of newly staged ones.
		const chatMessage = getChatMessageFromPrompt(message, editing.messageId, editing.fileParts);

		if (!chatMessage) {
			return;
		}

		setEditing(null);
		setScrollAnchorMessageId(chatMessage.id);
		editMessage(chatMessage);
		setSentMessageAnimationId(chatMessage.id);
		clearDraftArtifacts(context.workspaceId, threadId);
	};
	// A drained entry fails exactly like a manual send: the message stays in
	// the transcript with the error banner and "Try again" re-runs it (the
	// server treats a resend of the same id as regenerate-from-that-message).
	// The drain gate below already holds the rest of the queue on error — no
	// separate queued-failure machinery.
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
			// A queued entry answers against the context captured when it was
			// written; entries without one (action prompts) get the live snapshot
			// via the hook's default.
			sendChatMessage(
				chatMessage,
				entry.contextSnapshot ? { body: { workspaceAiContext: entry.contextSnapshot } } : undefined,
			);
		} catch {
			// Synchronous refusal: the request never started, so restore.
			restoreQueueHead(threadId, entry);
			return;
		}
		setScrollAnchorMessageId(entry.promoted ? chatMessage.id : null);
		setSentMessageAnimationId(chatMessage.id);
	});
	// An entry that queued while the model allowance was exhausted must not
	// auto-fire whenever the allowance later refreshes — pausing shifts the
	// decision back to the user (the tray's resume). This is the one drain
	// site, so it covers every enqueue path, including generated actions that
	// have no hook access to allowance state.
	useEffect(() => {
		if (queueHead && isBlocked && !queuePaused) {
			pauseQueue(threadId);
		}
	}, [isBlocked, pauseQueue, queueHead, queuePaused, threadId]);
	useEffect(() => {
		if (
			!queueHead ||
			// Held during an edit: a drained turn would land after the message being
			// edited, and the edit's truncate-and-rerun would then destroy it.
			editing !== null ||
			// Held while a question is up: the turn ended cleanly, so canSend is
			// true and the queue would otherwise fire straight past the question
			// the user is still looking at.
			pendingQuestions !== null ||
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
		// The cancelled flag keeps an unmounting view (tab switch) from firing a
		// turn for a thread the user just left.
		let cancelled = false;
		queueMicrotask(() => {
			if (cancelled) {
				return;
			}
			const entry = takeQueueHead(threadId, queueHead.id);
			if (entry) {
				sendQueuedEntry(entry);
			}
		});
		return () => {
			cancelled = true;
		};
	}, [
		canSend,
		assistantError?.kind,
		editing,
		isBlocked,
		pendingQuestions,
		queueHead,
		queuePaused,
		takeQueueHead,
		threadId,
	]);
	const answerQuestion = (answers: AiChatQuestionAnswer[]) => {
		if (!pendingQuestions) {
			return;
		}

		const chatMessage: AiChatSendMessage = {
			id: generateId(),
			role: "user",
			parts: [{ type: "text", text: formatQuestionAnswerText(answers) }],
			metadata: { questionAnswer: answers },
		};

		setScrollAnchorMessageId(chatMessage.id);
		sendChatMessage(chatMessage);
		setSentMessageAnimationId(chatMessage.id);
	};
	const stopGeneration = async () => {
		if (!(await stop())) {
			pauseQueue(threadId);
			toast.error("Couldn’t confirm Stop. Your queued message is paused.", {
				id: "ai-chat-stop-failed",
			});
		}
	};
	const handleUserStop = () => {
		pauseQueue(threadId);
		void stopGeneration();
	};
	const handleSendNow = (entryId: string) => {
		moveQueueEntryToHead(threadId, entryId);
		resumeQueue(threadId);
		if (inputStatus !== "ready") void stopGeneration();
	};

	return (
		<div className="relative flex min-h-0 flex-1 flex-col">
			<AiChatLiveActivityProvider value={liveCodemodeActivity}>
				<AiChatMessageList
					anchorMessageId={scrollAnchorMessageId}
					assistantError={assistantError}
					editingMessageId={editing?.messageId}
					messages={messages}
					presentation={presentation}
					sentMessageAnimationId={sentMessageAnimationId}
					workspaceId={context.workspaceId}
					onEditMessage={canSend && !queueHead && !editing ? startEditing : undefined}
					// Hidden while editing: regenerating the reply the edit is about to
					// delete makes the chat busy and strands the edit with a dead submit.
					onRegenerateLastResponse={editing ? undefined : () => regenerate()}
					onStartNewChat={onStartNewChat}
				/>
			</AiChatLiveActivityProvider>

			<div className="px-3 pb-3">
				<div className={aiChatComposerRailClassName}>
					{pendingQuestions ? (
						<AiChatQuestionCard
							disabled={!canSend}
							questions={pendingQuestions}
							onAnswer={answerQuestion}
						/>
					) : (
						<AiChatPromptInput
							activeThreadId={threadId}
							canSend={canSend}
							context={context}
							isEditing={Boolean(editing)}
							modelId={modelId}
							status={inputStatus}
							onCancelEdit={cancelEditing}
							onModelChange={onModelChange}
							onSubmit={(message) =>
								editing ? submitEditedMessage(message) : sendMessage(message)
							}
							onStop={handleUserStop}
							onInterrupt={() => void stopGeneration()}
							onSendNow={handleSendNow}
						/>
					)}
				</div>
			</div>
		</div>
	);
}

function getChatMessageFromPrompt(
	message: PromptInputMessage,
	id: string,
	extraParts: AiChatMessage["parts"] = [],
): AiChatSendMessage | null {
	const trimmedText = message.text.trim();
	const parts = [
		...(trimmedText ? [{ type: "text" as const, text: trimmedText }] : []),
		...extraParts,
		...message.files,
	];

	if (parts.length === 0) {
		return null;
	}

	return { id, role: "user", parts };
}
