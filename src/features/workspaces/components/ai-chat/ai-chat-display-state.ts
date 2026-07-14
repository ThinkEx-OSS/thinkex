import { isToolUIPart } from "ai";

import type {
	AiChatMessage,
	AiChatMessagePart,
	AiChatStatus,
	AiChatToolPart,
} from "#/features/workspaces/components/ai-chat/types";
import { getAiToolPresentation } from "#/features/workspaces/ai/ai-tool-presentation";
import {
	getCodemodeCallActivities,
	type AiChatToolChildActivity,
} from "#/features/workspaces/components/ai-chat/ai-chat-codemode-activity";
import {
	getFinishedToolReceipt,
	getRunningToolReceipt,
} from "#/features/workspaces/components/ai-chat/ai-chat-tool-receipts";

export type AssistantPendingKind = "thinking" | "working" | "recovering";

export interface AiChatToolGroupPart {
	type: "data-tool-group";
	children: AiChatToolChildActivity[];
	part: AiChatToolPart;
}

export type AiChatRenderablePart = AiChatMessagePart | AiChatToolGroupPart;

export type AssistantRowDisplay =
	| { kind: "content"; parts: AiChatRenderablePart[] }
	| { kind: "empty-terminal"; canRegenerate: boolean }
	| { kind: "hidden" };

export interface AiChatToolActivity {
	detail: AiChatToolPart;
	status: "completed" | "failed" | "running";
	summary: string;
	toolName: string;
}

export interface AiChatPresentation {
	isBusy: boolean;
	isRecovering: boolean;
	isToolContinuation: boolean;
	lastAssistantMessageId: string | undefined;
	status: AiChatStatus;
	tailPending: AssistantPendingKind | null;
}

export function isAiChatStreamActive(status: AiChatStatus) {
	return status === "submitted" || status === "streaming";
}

export function deriveAiChatPresentation(
	messages: AiChatMessage[],
	status: AiChatStatus,
	{
		isRecovering,
		isServerStreaming,
		isStreaming,
		isToolContinuation,
	}: {
		isRecovering: boolean;
		isServerStreaming: boolean;
		isStreaming: boolean;
		isToolContinuation: boolean;
	},
): AiChatPresentation {
	const lastMessage = messages.at(-1);
	const lastAssistantMessageId = lastMessage?.role === "assistant" ? lastMessage.id : undefined;
	const awaitingFirstToken = status === "submitted" && !isToolContinuation;
	const isBusy = isRecovering || isStreaming || isServerStreaming || status === "submitted";
	const hasAssistantTail = lastMessage?.role === "assistant";
	const assistantTailIsEmpty =
		lastMessage?.role === "assistant" && getDisplayableParts(lastMessage).length === 0;
	const hasVisibleAssistantTail = hasAssistantTail && !assistantTailIsEmpty;
	const tailPending = isRecovering
		? hasVisibleAssistantTail
			? "working"
			: "recovering"
		: awaitingFirstToken
			? "thinking"
			: !isBusy
				? null
				: !hasVisibleAssistantTail
					? "thinking"
					: "working";

	return {
		isBusy,
		isRecovering,
		isToolContinuation,
		lastAssistantMessageId,
		status,
		tailPending,
	};
}

export function getAssistantRowDisplay(
	message: AiChatMessage,
	presentation: AiChatPresentation,
): AssistantRowDisplay | null {
	if (message.role !== "assistant") {
		return null;
	}

	const displayableParts = getDisplayableParts(message);
	const isLastAssistant = message.id === presentation.lastAssistantMessageId;

	if (presentation.status === "error" && isLastAssistant && displayableParts.length === 0) {
		return { kind: "hidden" };
	}

	if (displayableParts.length > 0) {
		return { kind: "content", parts: displayableParts };
	}

	if (message.parts.some((part) => isToolUIPart(part))) {
		return { kind: "hidden" };
	}

	if (isLastAssistant && presentation.status === "ready" && !presentation.isBusy) {
		return {
			kind: "empty-terminal",
			canRegenerate: true,
		};
	}

	if (!presentation.isBusy) {
		return {
			kind: "empty-terminal",
			canRegenerate: false,
		};
	}

	return { kind: "hidden" };
}

export function getDisplayableParts(message: AiChatMessage): AiChatRenderablePart[] {
	const parts = message.parts.filter(isDisplayableMessagePart);
	const codemodePart = parts.find(
		(part): part is AiChatToolPart => isToolUIPart(part) && getToolPartName(part) === "orchestrate",
	);

	if (!codemodePart) {
		return parts;
	}

	const loggedChildren = getCodemodeCallActivities(codemodePart.output);
	const groupsSiblingTools = loggedChildren === undefined;
	const codemodeChildren = loggedChildren ?? getLegacyCodemodeChildren(parts, codemodePart);

	const result: AiChatRenderablePart[] = [];

	for (const part of parts) {
		if (
			groupsSiblingTools &&
			isToolUIPart(part) &&
			part !== codemodePart &&
			isVisibleToolPart(part)
		) {
			continue;
		}

		if (part === codemodePart) {
			result.push({
				type: "data-tool-group",
				part,
				children: codemodeChildren,
			});
			continue;
		}

		result.push(part);
	}

	return result;
}

function getLegacyCodemodeChildren(
	parts: AiChatMessagePart[],
	codemodePart: AiChatToolPart,
): AiChatToolChildActivity[] {
	return parts.flatMap((part) => {
		if (!isToolUIPart(part) || part === codemodePart || !isVisibleToolPart(part)) {
			return [];
		}

		const activity = getToolActivityForPart(part);
		return activity
			? [
					{
						id: part.toolCallId,
						status: activity.status,
						summary: activity.summary,
						toolName: activity.toolName,
					},
				]
			: [];
	});
}

export function isDisplayableMessagePart(part: AiChatMessagePart): boolean {
	if (part.type === "text") {
		return part.text.length > 0 || part.state === "streaming";
	}

	if (part.type === "reasoning" || part.type === "step-start") {
		return false;
	}

	if (isToolUIPart(part)) {
		return isVisibleToolPart(part);
	}

	if (
		part.type === "file" ||
		part.type === "source-url" ||
		part.type === "source-document" ||
		part.type.startsWith("data-")
	) {
		return true;
	}

	return false;
}

export function getToolActivityForPart(part: AiChatToolPart): AiChatToolActivity | null {
	if (!isVisibleToolPart(part)) {
		return null;
	}

	const toolName = getToolPartName(part);
	const receipt = getToolActivityReceipt(part, toolName);

	return {
		detail: part,
		status: receipt.status,
		summary: receipt.summary,
		toolName,
	};
}

export function isVisibleToolPart(part: AiChatToolPart) {
	const toolName = getToolPartName(part);
	return getAiToolPresentation(toolName).visibility === "visible";
}

function getToolPartName(part: AiChatToolPart) {
	return part.type === "dynamic-tool" ? part.toolName : part.type.split("-").slice(1).join("-");
}

function getToolActivityReceipt(
	part: AiChatToolPart,
	toolName: string,
): { status: AiChatToolActivity["status"]; summary: string } {
	switch (part.state) {
		case "output-available":
			return getFinishedToolReceipt({
				baseStatus: "completed",
				output: part.output,
				toolInput: part.input,
				toolName,
			});
		case "output-denied":
		case "output-error":
			return getFinishedToolReceipt({
				baseStatus: "failed",
				output: part.output,
				toolInput: part.input,
				toolName,
			});
		default:
			return {
				status: "running",
				summary: getRunningToolReceipt({
					toolInput: part.input,
					toolName,
				}).summary,
			};
	}
}
