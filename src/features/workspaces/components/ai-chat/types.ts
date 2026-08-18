import type { ChatRequestOptions, ChatStatus, DynamicToolUIPart, ToolUIPart, UIMessage } from "ai";

import type { WorkspaceAiChatModelId } from "#/features/workspaces/ai/models";

export type AiChatMessage = UIMessage;
export type AiChatMessagePart = UIMessage["parts"][number];
export type AiChatToolPart = ToolUIPart | DynamicToolUIPart;
export type AiChatModelId = WorkspaceAiChatModelId;

export interface AiChatSendMessage {
	id: string;
	role: "user";
	parts: AiChatMessagePart[];
	/** Persisted verbatim; carries question-answer provenance for the transcript. */
	metadata?: unknown;
}

export type AiChatSendMessageOptions = ChatRequestOptions;

export type AiChatStatus = ChatStatus;
