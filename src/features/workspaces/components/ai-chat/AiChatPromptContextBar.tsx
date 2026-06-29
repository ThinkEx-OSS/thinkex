import { usePromptInputAttachments } from "#/features/workspaces/components/ai-chat/ai-chat-prompt-input";
import AiChatPromptAttachments from "#/features/workspaces/components/ai-chat/AiChatPromptAttachments";
import WorkspaceAiChatContextChips from "#/features/workspaces/components/ai-chat/WorkspaceAiChatContextChips";
import {
	getWorkspaceAiContextChips,
	type WorkspaceAiContextScope,
} from "#/features/workspaces/model/workspace-ai-context";

export default function AiChatPromptContextBar({ context }: { context: WorkspaceAiContextScope }) {
	const attachments = usePromptInputAttachments();
	const hasAttachments = attachments.files.length > 0;
	const hasWorkspaceContext =
		getWorkspaceAiContextChips(context).length > 0 || context.selectedQuotes.length > 0;

	if (!hasAttachments && !hasWorkspaceContext) {
		return null;
	}

	return (
		<div className="flex w-full min-w-0 flex-col gap-3">
			<AiChatPromptAttachments />
			<WorkspaceAiChatContextChips context={context} />
		</div>
	);
}
