import { isToolUIPart } from "ai";

import {
	AiChatAttachmentGroup,
	AiChatAttachmentItem,
} from "#/features/workspaces/components/ai-chat/AiChatAttachmentItem";
import { getFileAttachmentData } from "#/features/workspaces/components/ai-chat/ai-chat-attachments";
import { AiChatMessageResponse } from "#/features/workspaces/components/ai-chat/AiChatMessageResponse";
import { AiChatToolActivityRow } from "#/features/workspaces/components/ai-chat/AiChatToolActivityRow";
import type { AiChatMessagePart } from "#/features/workspaces/components/ai-chat/types";

export function AiChatMessagePartView({
	interruptUnfinishedTools = false,
	isStreaming = false,
	part,
	preserveWhitespace = false,
}: {
	interruptUnfinishedTools?: boolean;
	isStreaming?: boolean;
	part: AiChatMessagePart;
	preserveWhitespace?: boolean;
}) {
	if (part.type === "text") {
		return (
			<AiChatMessageResponse
				className={preserveWhitespace ? "whitespace-pre-wrap" : undefined}
				isStreaming={isStreaming}
			>
				{part.text}
			</AiChatMessageResponse>
		);
	}

	if (isToolUIPart(part)) {
		return <AiChatToolActivityRow interrupted={interruptUnfinishedTools} part={part} />;
	}

	if (part.type === "file") {
		const attachment = getFileAttachmentData(part);

		return (
			<AiChatAttachmentGroup>
				<AiChatAttachmentItem data={attachment} />
			</AiChatAttachmentGroup>
		);
	}

	// source-url / source-document parts cannot occur here: toUIMessageStream
	// runs with sendSources off and no provider-native search is mounted.
	return null;
}
