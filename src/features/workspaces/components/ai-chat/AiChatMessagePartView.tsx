import { isToolUIPart } from "ai";
import { LinkIcon } from "lucide-react";

import {
	AiChatAttachmentGroup,
	AiChatAttachmentItem,
} from "#/features/workspaces/components/ai-chat/AiChatAttachmentItem";
import {
	getFileAttachmentData,
	getSourceDocumentAttachmentData,
} from "#/features/workspaces/components/ai-chat/ai-chat-attachments";
import {
	type AiChatToolGroupPart,
	isAiChatToolGroupPart,
} from "#/features/workspaces/components/ai-chat/ai-chat-display-state";
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
	part: AiChatMessagePart | AiChatToolGroupPart;
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

	if (isAiChatToolGroupPart(part)) {
		return (
			<AiChatToolActivityRow
				interrupted={interruptUnfinishedTools}
				nestedChildren={part.children}
				part={part.part}
			/>
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

	if (part.type === "source-url") {
		return (
			<a
				className="inline-flex max-w-full items-center gap-2 text-muted-foreground text-sm underline-offset-4 hover:text-foreground hover:underline"
				href={part.url}
				rel="noreferrer"
				target="_blank"
			>
				<LinkIcon className="size-4 shrink-0" />
				<span className="truncate">{part.title ?? part.url}</span>
			</a>
		);
	}

	if (part.type === "source-document") {
		const attachment = getSourceDocumentAttachmentData(part);

		return (
			<AiChatAttachmentGroup>
				<AiChatAttachmentItem data={attachment} />
			</AiChatAttachmentGroup>
		);
	}

	return null;
}
