import { Mic, Paperclip } from "lucide-react";
import { type KeyboardEventHandler, type SetStateAction, useCallback, useRef } from "react";

import {
	type AttachmentsContext,
	PromptInput,
	PromptInputBody,
	PromptInputButton,
	PromptInputFooter,
	PromptInputHeader,
	type PromptInputMessage,
	PromptInputTextarea,
	PromptInputTools,
	usePromptInputAttachments,
} from "#/features/workspaces/components/ai-chat/ai-chat-prompt-input";
import { useWorkspaceAiAllowance } from "#/features/workspaces/ai/use-workspace-ai-allowance";
import { AiChatAttachmentDropBridge } from "#/features/workspaces/components/ai-chat/AiChatAttachmentDrop";
import AiChatModelPicker from "#/features/workspaces/components/ai-chat/AiChatModelPicker";
import { AiChatAllowanceNotice } from "#/features/workspaces/components/ai-chat/AiChatAllowanceNotice";
import AiChatPromptContextBar from "#/features/workspaces/components/ai-chat/AiChatPromptContextBar";
import AiChatPromptSubmit from "#/features/workspaces/components/ai-chat/AiChatPromptSubmit";
import AiChatQueueTray from "#/features/workspaces/components/ai-chat/AiChatQueueTray";
import {
	DEFAULT_WORKSPACE_AI_CHAT_MODEL_ID,
	WORKSPACE_AI_CHAT_ATTACHMENT_POLICY,
} from "#/features/workspaces/components/ai-chat/constants";
import type { AiChatModelId, AiChatStatus } from "#/features/workspaces/components/ai-chat/types";
import { useAiChatAttachmentIntake } from "#/features/workspaces/components/ai-chat/useAiChatAttachmentIntake";
import { useAiChatDictation } from "#/features/workspaces/components/ai-chat/useAiChatDictation";
import { useTypeToFocusPrompt } from "#/features/workspaces/components/ai-chat/useTypeToFocusPrompt";
import { WorkspaceFileIntakeReviewDialog } from "#/features/workspaces/components/WorkspaceFileIntakeReviewDialog";
import { useWorkspaceFileUpload } from "#/features/workspaces/components/WorkspaceFileUploadProvider";
import {
	WorkspaceToolbarGroup,
	WorkspaceToolbarIconButton,
} from "#/features/workspaces/components/WorkspaceToolbar";
import { workspaceToolbarIconButtonClass } from "#/features/workspaces/components/workspace-toolbar-styles";
import { useWorkspaceMutationAccess } from "#/features/workspaces/components/workspace-mutation-access";
import type { WorkspaceAiContextScope } from "#/features/workspaces/model/workspace-ai-context-types";
import { buildWorkspaceAiContextSnapshot } from "#/features/workspaces/model/workspace-ai-context-snapshot";
import { workspaceUploadAccept } from "#/features/workspaces/upload/workspace-upload-intake";
import {
	useWorkspaceAiComposerDraftFiles,
	useWorkspaceAiComposerDraftStore,
	useWorkspaceAiComposerDraftText,
} from "#/features/workspaces/state/workspace-ai-composer-draft-store";
import { useWorkspaceAiQueueStore } from "#/features/workspaces/state/workspace-ai-queue-store";
import { cn } from "#/lib/utils";

// InputGroup defaults to a single horizontal row. Stack vertically so the
// footer toolbar stays visible below the textarea instead of being clipped.
const PROMPT_INPUT_GROUP_CLASSNAME =
	"h-auto flex-col border-border/70 bg-muted/30 shadow-none dark:bg-muted/30";
const PROMPT_INPUT_INLINE_PADDING = "px-3.5";
const PROMPT_INPUT_HEADER_PADDING = "px-3.5 pb-1";
const PROMPT_INPUT_FOOTER_PADDING = "pl-2 pr-3.5 pt-1 pb-2";
const CHAT_ATTACHMENT_PICKER_ACCEPT = [
	...new Set([WORKSPACE_AI_CHAT_ATTACHMENT_POLICY.accept, ...workspaceUploadAccept.split(",")]),
].join(",");
function AiChatAttachmentButton() {
	const attachments = usePromptInputAttachments();

	return (
		<PromptInputButton
			aria-label="Add attachments"
			className={workspaceToolbarIconButtonClass}
			disabled={!attachments.composerReady}
			onClick={attachments.openFileDialog}
		>
			<Paperclip />
		</PromptInputButton>
	);
}

interface AiChatPromptInputProps {
	activeThreadId: string;
	canSend: boolean;
	context: WorkspaceAiContextScope;
	modelId?: AiChatModelId;
	onModelChange?: (modelId: AiChatModelId) => void;
	onSubmit: (message: PromptInputMessage) => void;
	onStop?: () => void;
	/** Aborts the current response without pausing the message queue. */
	onInterrupt?: () => void;
	onSendNow?: (entryId: string) => void;
	status?: AiChatStatus;
}

export default function AiChatPromptInput({
	activeThreadId,
	canSend: canSendWhileConnected,
	context,
	modelId = DEFAULT_WORKSPACE_AI_CHAT_MODEL_ID,
	onModelChange,
	onSubmit,
	onStop,
	onInterrupt,
	onSendNow,
	status = "ready",
}: AiChatPromptInputProps) {
	const textareaRef = useRef<HTMLTextAreaElement>(null);
	const input = useWorkspaceAiComposerDraftText(activeThreadId);
	const setDraftText = useWorkspaceAiComposerDraftStore((state) => state.setText);
	const setInput = useCallback(
		(value: SetStateAction<string>) => setDraftText(activeThreadId, value),
		[activeThreadId, setDraftText],
	);
	const dictation = useAiChatDictation({ input, setInput });
	const draftFiles = useWorkspaceAiComposerDraftFiles(activeThreadId);
	const attachmentsReady =
		draftFiles.length === 0 || draftFiles.every((file) => file.status === "ready");
	const canType = status !== "error";
	// The server gate is still the real enforcement, but letting a known-dead
	// send through only to have it come back as an error reads as a broken
	// product rather than a spent allowance. The notice above the composer says
	// what happened; the button just stops offering to do it.
	const { isBlocked } = useWorkspaceAiAllowance(modelId);
	const canSend = canSendWhileConnected && status === "ready" && attachmentsReady && !isBlocked;
	const { capabilities } = useWorkspaceMutationAccess();
	const { uploadFiles: uploadWorkspaceFiles } = useWorkspaceFileUpload();
	const addDraftFiles = useWorkspaceAiComposerDraftStore((state) => state.addFiles);
	const removeDraftFile = useWorkspaceAiComposerDraftStore((state) => state.removeFile);
	const clearDraftFiles = useWorkspaceAiComposerDraftStore((state) => state.clearFiles);
	const { addFiles, closeReview, confirmWorkspaceFallback, reviewState } =
		useAiChatAttachmentIntake({
			activeItem: context.activeItem,
			addDraftFiles: (files, options) =>
				addDraftFiles(context.workspaceId, activeThreadId, files, options),
			canUploadToWorkspace: capabilities.canMutateContent,
			currentChatFileCount: draftFiles.length,
			uploadWorkspaceFiles,
		});
	useTypeToFocusPrompt({
		enabled: canType,
		setInput,
		textareaRef,
	});
	const attachments: Omit<AttachmentsContext, "openFileDialog"> = {
		add: addFiles,
		composerReady: canType,
		clear: () => clearDraftFiles(activeThreadId),
		files: draftFiles,
		remove: (fileId) => removeDraftFile(activeThreadId, fileId),
	};

	const isBusyStatus = status === "submitted" || status === "streaming";
	const canQueue = isBusyStatus && attachmentsReady && !isBlocked;
	const clearDraftArtifacts = useWorkspaceAiComposerDraftStore(
		(state) => state.clearDraftArtifacts,
	);
	const addReadyDraftFiles = useWorkspaceAiComposerDraftStore((state) => state.addReadyFiles);
	const enqueueMessage = useWorkspaceAiQueueStore((state) => state.enqueue);
	const removeQueuedMessage = useWorkspaceAiQueueStore((state) => state.remove);
	const resumeQueue = useWorkspaceAiQueueStore((state) => state.resume);
	const steerOnSubmitRef = useRef(false);

	const handleSubmit = (message: PromptInputMessage) => {
		const steer = steerOnSubmitRef.current;
		steerOnSubmitRef.current = false;

		if (!message.text.trim() && message.files.length === 0) {
			return false;
		}

		if (canSend) {
			resumeQueue(activeThreadId);
			onSubmit(message);
		} else if (canQueue) {
			// The snapshot is captured now so the message is answered against
			// what the user is looking at, even if it sends much later.
			enqueueMessage(activeThreadId, {
				atHead: steer,
				contextSnapshot: buildWorkspaceAiContextSnapshot(context),
				files: message.files,
				text: message.text,
			});
			clearDraftArtifacts(context.workspaceId, activeThreadId);
			if (steer) {
				resumeQueue(activeThreadId);
				onInterrupt?.();
			}
		} else {
			return false;
		}

		dictation.cancel();
		setInput("");
		return true;
	};

	const handleTextareaKeyDown: KeyboardEventHandler<HTMLTextAreaElement> = (event) => {
		if (event.key !== "Enter" || !(event.metaKey || event.ctrlKey) || !isBusyStatus) {
			return;
		}

		event.preventDefault();
		steerOnSubmitRef.current = true;
		event.currentTarget.form?.requestSubmit();
	};

	const handleEditQueued = (entryId: string) => {
		// Removal doubles as the race guard: if the entry already started
		// sending it is gone from the queue and there is nothing to edit.
		const entry = removeQueuedMessage(activeThreadId, entryId);
		if (!entry) {
			return;
		}

		if (entry.text) {
			setInput((current) => (current.trim() ? `${current}\n\n${entry.text}` : entry.text));
		}
		addReadyDraftFiles(activeThreadId, entry.files);
		textareaRef.current?.focus();
	};

	const handleModelChange = (value: string) => {
		onModelChange?.(value as AiChatModelId);
	};

	return (
		<>
			<PromptInput
				accept={CHAT_ATTACHMENT_PICKER_ACCEPT}
				attachments={attachments}
				inputGroupClassName={PROMPT_INPUT_GROUP_CLASSNAME}
				multiple
				onSubmit={handleSubmit}
			>
				<AiChatAttachmentDropBridge />
				<PromptInputHeader className={PROMPT_INPUT_HEADER_PADDING}>
					<AiChatQueueTray
						threadId={activeThreadId}
						onEdit={handleEditQueued}
						onSendNow={onSendNow}
					/>
					<AiChatPromptContextBar context={context} />
					<AiChatAllowanceNotice modelId={modelId} />
				</PromptInputHeader>
				<PromptInputBody>
					<PromptInputTextarea
						ref={textareaRef}
						name="message"
						readOnly={dictation.isActive}
						value={input}
						onKeyDown={handleTextareaKeyDown}
						placeholder="Ask anything"
						onChange={(event) => setInput(event.currentTarget.value)}
						className={cn(
							"min-h-10 pt-2 pb-1 text-base placeholder:text-foreground/45 md:text-base",
							PROMPT_INPUT_INLINE_PADDING,
						)}
					/>
				</PromptInputBody>

				<PromptInputFooter className={PROMPT_INPUT_FOOTER_PADDING}>
					<PromptInputTools>
						<AiChatAttachmentButton />

						<AiChatModelPicker modelId={modelId} onModelChange={handleModelChange} />
					</PromptInputTools>

					{/* Keep sm at gap-1 to match paperclip↔model picker (group default is sm:gap-0.5). */}
					<WorkspaceToolbarGroup className="ml-auto sm:gap-1">
						{dictation.isSupported ? (
							<WorkspaceToolbarIconButton
								aria-label={dictation.isActive ? "Stop dictation" : "Start dictation"}
								aria-pressed={dictation.isActive}
								className={cn(
									dictation.isActive &&
										"bg-destructive/10 text-destructive hover:bg-destructive/20 hover:text-destructive",
								)}
								disabled={!canType && !dictation.isActive}
								onClick={dictation.toggle}
							>
								<Mic className={dictation.isListening ? "ai-dictation-mic-pulse" : undefined} />
							</WorkspaceToolbarIconButton>
						) : null}
						<AiChatPromptSubmit
							attachmentsReady={attachmentsReady}
							canQueue={canQueue}
							canSend={canSend}
							input={input}
							onStop={onStop}
							status={status}
						/>
					</WorkspaceToolbarGroup>
				</PromptInputFooter>
			</PromptInput>
			<WorkspaceFileIntakeReviewDialog
				open={Boolean(reviewState)}
				mode="chat_fallback"
				workspaceFallbackFiles={reviewState?.workspaceFallbackFiles ?? []}
				rejectedFiles={reviewState?.rejectedFiles ?? []}
				onConfirmWorkspaceFallback={confirmWorkspaceFallback}
				onOpenChange={(open) => {
					if (!open) {
						closeReview();
					}
				}}
			/>
		</>
	);
}
