import { usePromptInputAttachments } from "#/features/workspaces/components/ai-chat/ai-chat-prompt-input";
import AiChatComposerReveal from "#/features/workspaces/components/ai-chat/AiChatComposerReveal";
import AiChatPromptAttachments from "#/features/workspaces/components/ai-chat/AiChatPromptAttachments";
import WorkspaceAiChatContextChips from "#/features/workspaces/components/ai-chat/WorkspaceAiChatContextChips";
import { getWorkspaceAiContextChips } from "#/features/workspaces/model/workspace-ai-context-chips";
import type { WorkspaceAiContextScope } from "#/features/workspaces/model/workspace-ai-context-types";

export default function AiChatPromptContextBar({ context }: { context: WorkspaceAiContextScope }) {
	const attachments = usePromptInputAttachments();
	const hasAttachments = attachments.files.length > 0;
	const hasWorkspaceContext =
		getWorkspaceAiContextChips(context).length > 0 || context.selectedQuotes.length > 0;
	const visible = hasAttachments || hasWorkspaceContext;

	return (
		<AiChatComposerReveal>
			{visible ? (
				<div className="flex w-full min-w-0 flex-col gap-3 pt-3">
					<AiChatPromptAttachments />
					<WorkspaceAiChatContextChips context={context} />
				</div>
			) : null}
		</AiChatComposerReveal>
	);
}
