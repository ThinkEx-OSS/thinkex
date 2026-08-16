import { ArrowUp, Square } from "lucide-react";

import {
	PromptInputButton,
	PromptInputSubmit,
	usePromptInputAttachments,
} from "#/features/workspaces/components/ai-chat/ai-chat-prompt-input";
import { Spinner } from "#/components/ui/spinner";
import { isAiChatStreamActive } from "#/features/workspaces/components/ai-chat/ai-chat-display-state";
import type { AiChatStatus } from "#/features/workspaces/components/ai-chat/types";
import { workspaceToolbarButtonSizeClass } from "#/features/workspaces/components/workspace-toolbar-styles";
import { cn } from "#/lib/utils";

export default function AiChatPromptSubmit({
	attachmentsReady,
	canQueue = false,
	canSend,
	input,
	onStop,
	status,
}: {
	attachmentsReady: boolean;
	canQueue?: boolean;
	canSend: boolean;
	input: string;
	onStop?: () => void;
	status: AiChatStatus;
}) {
	const attachments = usePromptInputAttachments();
	const isGenerating = isAiChatStreamActive(status);
	const hasContent = Boolean(input.trim() || attachments.files.length > 0);
	const canStop = isGenerating && Boolean(onStop);
	const canSubmit = canSend && hasContent;
	const isWaitingForAttachments = !attachmentsReady && hasContent;
	const isWaitingForConnection = status === "ready" && attachmentsReady && hasContent && !canSend;
	const waitingLabel = isWaitingForAttachments
		? "Uploading attachments"
		: isWaitingForConnection
			? "Waiting for connection"
			: null;
	const label = isGenerating ? "Stop" : (waitingLabel ?? "Submit");

	return (
		<>
			{/* While the AI is answering, an enabled submit button keeps Enter
			    working and gives touch users a visible way to add a message that
			    sends once the current answer finishes. */}
			{isGenerating && canQueue && hasContent ? (
				<PromptInputButton
					aria-label="Will send when the AI finishes"
					className={cn(workspaceToolbarButtonSizeClass, "rounded-full")}
					tooltip="Will send when the AI finishes"
					type="submit"
					variant="secondary"
				>
					<ArrowUp />
				</PromptInputButton>
			) : null}
			<PromptInputSubmit
				aria-label={label}
				className={cn(workspaceToolbarButtonSizeClass, "rounded-full")}
				disabled={isGenerating ? !canStop : !canSubmit}
				status={status}
				title={label}
				onStop={onStop}
				type={isGenerating ? "button" : "submit"}
			>
				{isGenerating ? <Square /> : waitingLabel ? <Spinner /> : <ArrowUp />}
			</PromptInputSubmit>
		</>
	);
}
