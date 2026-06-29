import { isToolUIPart } from "ai";

import type {
	AiChatMessage,
	AiChatMessagePart,
	AiChatStatus,
	AiChatToolPart,
} from "#/features/workspaces/components/ai-chat/types";
import { getFinishedToolReceipt } from "#/features/workspaces/components/ai-chat/ai-chat-tool-receipts";

export type AssistantPendingKind = "thinking" | "recovering";
export interface AiChatToolChildActivity {
	summary: string;
	toolName: string;
}

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
	children: AiChatToolChildActivity[];
	detail: AiChatToolPart;
	status: "completed" | "failed" | "running";
	summary: string;
	title: string;
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
	const isBusy = isRecovering || isStreaming || isServerStreaming;
	const awaitingFirstToken = status === "submitted" && !isToolContinuation;
	const hasAssistantTail = lastMessage?.role === "assistant";
	const assistantTailIsEmpty =
		lastMessage?.role === "assistant" && getDisplayableParts(lastMessage).length === 0;
	const tailPending = isRecovering
		? hasAssistantTail && !assistantTailIsEmpty
			? null
			: "recovering"
		: !isToolContinuation &&
			  (awaitingFirstToken || (isBusy && (!hasAssistantTail || assistantTailIsEmpty)))
			? "thinking"
			: null;

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

	const codemodeIndex = parts.indexOf(codemodePart);
	const codemodeChildren = parts
		.filter(
			(part): part is AiChatToolPart =>
				isToolUIPart(part) && part !== codemodePart && isVisibleToolPart(part),
		)
		.map((part) => {
			const activity = getToolActivityForPart(part);
			return activity
				? {
						summary: activity.summary,
						toolName: activity.toolName,
					}
				: null;
		})
		.filter((child): child is AiChatToolChildActivity => child !== null);

	const result: AiChatRenderablePart[] = [];

	for (const [index, part] of parts.entries()) {
		if (isToolUIPart(part) && part !== codemodePart && isVisibleToolPart(part)) {
			continue;
		}

		if (part === codemodePart) {
			result.push({
				type: "data-tool-group",
				part,
				children: index === codemodeIndex ? codemodeChildren : [],
			});
			continue;
		}

		result.push(part);
	}

	return result;
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
	const title = getToolActivityTitle(part, toolName);
	const receipt = getToolActivityReceipt(part, toolName, title);

	return {
		children: [],
		detail: part,
		status: receipt.status,
		summary: receipt.summary,
		title,
		toolName,
	};
}

export function isVisibleToolPart(part: AiChatToolPart) {
	const toolName = getToolPartName(part);
	return toolName !== "sandbox_bash" && !toolName.startsWith("time_");
}

function getToolPartName(part: AiChatToolPart) {
	return part.type === "dynamic-tool" ? part.toolName : part.type.split("-").slice(1).join("-");
}

function getToolActivityTitle(part: AiChatToolPart, toolName: string) {
	const title = part.title?.trim();

	if (title) {
		return title;
	}

	switch (toolName) {
		case "orchestrate":
			return "Working";
		case "compute":
			return "Computing";
		case "workspace_create_items":
		case "workspace_delete_items":
		case "workspace_edit_item":
		case "workspace_move_items":
		case "workspace_rename_item":
			return "Updating workspace";
		case "workspace_list_items":
		case "workspace_read_items":
			return "Reading workspace";
		case "web_search":
		case "web_markdown":
		case "web_links":
			return "Reading the web";
		case "research_discover":
		case "research_deepen":
			return "Researching sources";
		default:
			return humanizeToolName(toolName);
	}
}

function getToolActivityReceipt(
	part: AiChatToolPart,
	toolName: string,
	title: string,
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
				summary: title,
			};
	}
}

function humanizeToolName(value: string) {
	return value
		.split("_")
		.filter(Boolean)
		.map((segment, index) =>
			index === 0 ? segment.charAt(0).toUpperCase() + segment.slice(1) : segment,
		)
		.join(" ");
}
