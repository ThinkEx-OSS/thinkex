import { usePromptInputAttachments } from "#/features/workspaces/components/ai-chat/ai-chat-prompt-input";
import { AttachmentGroup } from "#/components/ui/attachment";
import { AiChatAttachmentItem } from "#/features/workspaces/components/ai-chat/AiChatAttachmentItem";

export default function AiChatPromptAttachments() {
	const attachments = usePromptInputAttachments();

	if (attachments.files.length === 0) {
		return null;
	}

	return (
		<AttachmentGroup className="ml-0 w-full min-w-0">
			{attachments.files.map((file) => (
				<AiChatAttachmentItem
					key={file.id}
					data={file}
					onRemove={() => attachments.remove(file.id)}
				/>
			))}
		</AttachmentGroup>
	);
}
