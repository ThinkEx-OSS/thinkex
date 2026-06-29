import { Bug, Plus } from "lucide-react";
import { lazy, Suspense, useRef, useState } from "react";

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
import type { AIInspectorSnapshot } from "#/features/workspaces/ai/ai-inspector";
import { AiChatAttachmentDropBridge } from "#/features/workspaces/components/ai-chat/AiChatAttachmentDrop";
import AiChatModelPicker from "#/features/workspaces/components/ai-chat/AiChatModelPicker";
import AiChatPromptContextBar from "#/features/workspaces/components/ai-chat/AiChatPromptContextBar";
import AiChatPromptSubmit from "#/features/workspaces/components/ai-chat/AiChatPromptSubmit";
import {
	DEFAULT_WORKSPACE_AI_CHAT_MODEL_ID,
	WORKSPACE_AI_CHAT_ATTACHMENT_POLICY,
} from "#/features/workspaces/components/ai-chat/constants";
import type { AiChatModelId, AiChatStatus } from "#/features/workspaces/components/ai-chat/types";
import { useAiChatAttachmentIntake } from "#/features/workspaces/components/ai-chat/useAiChatAttachmentIntake";
import { useTypeToFocusPrompt } from "#/features/workspaces/components/ai-chat/useTypeToFocusPrompt";
import { WorkspaceFileIntakeReviewDialog } from "#/features/workspaces/components/WorkspaceFileIntakeReviewDialog";
import { useWorkspaceFileUpload } from "#/features/workspaces/components/WorkspaceFileUploadProvider";
import {
	WorkspaceToolbarGroup,
	WorkspaceToolbarIconButton,
} from "#/features/workspaces/components/WorkspaceToolbar";
import { workspaceToolbarIconButtonClass } from "#/features/workspaces/components/workspace-toolbar-styles";
import { useWorkspaceMutationAccess } from "#/features/workspaces/components/workspace-mutation-access";
import type { WorkspaceAiContextScope } from "#/features/workspaces/model/workspace-ai-context";
import { workspaceUploadAccept } from "#/features/workspaces/upload/workspace-upload-intake";
import {
	useWorkspaceAiComposerDraftFiles,
	useWorkspaceAiComposerDraftStore,
} from "#/features/workspaces/state/workspace-ai-composer-draft-store";
import { cn } from "#/lib/utils";

// InputGroup defaults to a single horizontal row. Stack vertically so the
// footer toolbar stays visible below the textarea instead of being clipped.
const PROMPT_INPUT_GROUP_CLASSNAME =
	"h-auto flex-col border-border/70 bg-muted/30 shadow-none dark:bg-muted/30";
const PROMPT_INPUT_INLINE_PADDING = "px-3.5";
const PROMPT_INPUT_HEADER_PADDING = "px-3.5 pt-3 pb-1";
const PROMPT_INPUT_FOOTER_PADDING = "pl-2 pr-3.5 pt-1 pb-2";
const CHAT_ATTACHMENT_PICKER_ACCEPT = [
	...new Set([WORKSPACE_AI_CHAT_ATTACHMENT_POLICY.accept, ...workspaceUploadAccept.split(",")]),
].join(",");
const AiChatInspectorDialog = import.meta.env.DEV
	? lazy(async () => {
			const module = await import("#/features/workspaces/components/ai-chat/AiChatInspectorDialog");

			return { default: module.AiChatInspectorDialog };
		})
	: null;

function AiChatAttachmentButton() {
	const attachments = usePromptInputAttachments();

	return (
		<PromptInputButton
			aria-label="Add attachments"
			className={workspaceToolbarIconButtonClass}
			disabled={attachments.composerReady === false}
			onClick={attachments.openFileDialog}
		>
			<Plus />
		</PromptInputButton>
	);
}

interface AiChatPromptInputProps {
	activeThreadId?: string;
	context: WorkspaceAiContextScope;
	getInspectorSnapshot?: (threadId: string) => Promise<AIInspectorSnapshot>;
	modelId?: AiChatModelId;
	onModelChange?: (modelId: AiChatModelId) => void;
	onSubmit?: (message: PromptInputMessage) => boolean | Promise<boolean>;
	onStop?: () => void;
	status?: AiChatStatus;
}

export default function AiChatPromptInput({
	activeThreadId,
	context,
	getInspectorSnapshot,
	modelId = DEFAULT_WORKSPACE_AI_CHAT_MODEL_ID,
	onModelChange,
	onSubmit,
	onStop,
	status = "ready",
}: AiChatPromptInputProps) {
	const [input, setInput] = useState("");
	const [isInspectorOpen, setIsInspectorOpen] = useState(false);
	const textareaRef = useRef<HTMLTextAreaElement>(null);
	const draftFiles = useWorkspaceAiComposerDraftFiles(context.workspaceId);
	const attachmentsReady =
		draftFiles.length === 0 || draftFiles.every((file) => file.status === "ready");
	const canType = true;
	const canSend = status === "ready" && attachmentsReady;
	const { capabilities } = useWorkspaceMutationAccess();
	const { uploadFiles: uploadWorkspaceFiles } = useWorkspaceFileUpload();
	const addDraftFiles = useWorkspaceAiComposerDraftStore((state) => state.addFiles);
	const removeDraftFile = useWorkspaceAiComposerDraftStore((state) => state.removeFile);
	const clearDraftFiles = useWorkspaceAiComposerDraftStore((state) => state.clearFiles);
	const { addFiles, closeReview, confirmWorkspaceFallback, reviewState } =
		useAiChatAttachmentIntake({
			activeItem: context.activeItem,
			addDraftFiles: (files, options) => addDraftFiles(context.workspaceId, files, options),
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
		clear: () => clearDraftFiles(context.workspaceId),
		files: draftFiles,
		remove: (fileId) => removeDraftFile(context.workspaceId, fileId),
	};

	const handleSubmit = async (message: PromptInputMessage) => {
		if (!canSend || (!message.text.trim() && message.files.length === 0)) {
			return false;
		}

		const accepted = onSubmit ? await onSubmit(message) : false;
		if (!accepted) {
			return false;
		}

		setInput("");
		return true;
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
					<AiChatPromptContextBar context={context} />
				</PromptInputHeader>
				<PromptInputBody>
					<PromptInputTextarea
						ref={textareaRef}
						name="message"
						value={input}
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

						{import.meta.env.DEV && getInspectorSnapshot ? (
							<WorkspaceToolbarIconButton
								aria-label="Open AI inspector"
								disabled={!activeThreadId}
								onClick={() => setIsInspectorOpen(true)}
							>
								<Bug />
							</WorkspaceToolbarIconButton>
						) : null}
					</PromptInputTools>

					<WorkspaceToolbarGroup className="ml-auto">
						<AiChatPromptSubmit
							attachmentsReady={attachmentsReady}
							input={input}
							onStop={onStop}
							status={status}
						/>
					</WorkspaceToolbarGroup>
				</PromptInputFooter>
			</PromptInput>

			{AiChatInspectorDialog && getInspectorSnapshot ? (
				<Suspense fallback={null}>
					<AiChatInspectorDialog
						getSnapshot={getInspectorSnapshot}
						open={isInspectorOpen}
						onOpenChange={setIsInspectorOpen}
						threadId={activeThreadId}
					/>
				</Suspense>
			) : null}
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
