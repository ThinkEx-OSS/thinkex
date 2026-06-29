import type { ChatRequestOptions, ChatStatus, DynamicToolUIPart, ToolUIPart, UIMessage } from "ai";

import type { WorkspaceAiChatModelId } from "#/features/workspaces/ai/models";

export type AiChatMessage = UIMessage;
export type AiChatMessagePart = UIMessage["parts"][number];
export type AiChatToolPart = ToolUIPart | DynamicToolUIPart;
export type AiChatModelId = WorkspaceAiChatModelId;

export interface AiChatSendMessage {
	role: "user";
	parts: AiChatMessagePart[];
}

export type AiChatSendMessageOptions = ChatRequestOptions;

export type AiChatStatus = ChatStatus;
