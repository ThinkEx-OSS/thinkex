import { isToolUIPart } from "ai";

import type {
	AiChatMessage,
	AiChatMessagePart,
	AiChatStatus,
	AiChatToolPart,
} from "#/features/workspaces/components/ai-chat/types";
import {
	getAiToolPresentation,
	type AiToolPresentation,
} from "#/features/workspaces/ai/ai-tool-registry";
import {
	getCodemodeCallActivities,
	type AiChatToolChildActivity,
} from "#/features/workspaces/components/ai-chat/ai-chat-codemode-activity";
import {
	getFinishedToolReceipt,
	getRunningToolReceipt,
	type AiChatToolReceiptSegment,
} from "#/features/workspaces/components/ai-chat/ai-chat-tool-receipts";

export type AssistantPendingKind = "thinking" | "recovering";

/**
 * Every `orchestrate` call in a message collapses into one row: the header
 * describes the last call — the model's most recent title, so it reads as
 * current activity — and `children` is the whole message's activity trail in
 * execution order, regardless of which call produced each entry.
 */
export interface AiChatToolGroupPart {
	type: "data-tool-group";
	children: AiChatToolChildActivity[];
	part: AiChatToolPart;
}

export type AiChatRenderablePart = AiChatMessagePart | AiChatToolGroupPart;

export function isAiChatToolGroupPart(part: AiChatRenderablePart): part is AiChatToolGroupPart {
	return part.type === "data-tool-group" && "children" in part;
}

export type AssistantRowDisplay =
	| {
			interruptUnfinishedTools: boolean;
			kind: "content";
			parts: AiChatRenderablePart[];
	  }
	| { kind: "empty-terminal"; canRegenerate: boolean }
	| { kind: "hidden" };

export interface AiChatToolActivity {
	detail: AiChatToolPart;
	presentation: AiToolPresentation;
	status: "completed" | "failed" | "interrupted" | "running";
	summary: string;
	segments?: AiChatToolReceiptSegment[];
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
	// Once the reply is actually rendering, the status row goes away — the text
	// arriving is its own progress indicator. Keeping a row up for the length of
	// the reply also means removing it at the end, and that shrink shifts the
	// transcript no matter how promptly the tail spacer compensates.
	const tailPending = hasVisibleAssistantTail
		? null
		: isRecovering
			? "recovering"
			: isBusy || awaitingFirstToken
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
		return {
			kind: "content",
			parts: displayableParts,
			interruptUnfinishedTools: presentation.status === "error" && isLastAssistant,
		};
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
	const codemodeParts = parts.filter(
		(part): part is AiChatToolPart => isToolUIPart(part) && getToolPartName(part) === "orchestrate",
	);
	const codemodePart = codemodeParts.at(-1);

	if (!codemodePart) {
		return parts;
	}

	// Each call logs its own `seq`, so ids repeat across calls. Namespace them by
	// the call that produced them to keep the merged trail's keys unique.
	const codemodeChildren = codemodeParts.flatMap((part) =>
		(getCodemodeCallActivities(part.output) ?? []).map((child) => ({
			...child,
			id: `${part.toolCallId}:${child.id}`,
		})),
	);

	const result: AiChatRenderablePart[] = [];

	for (const part of parts) {
		if (isToolUIPart(part) && getToolPartName(part) === "orchestrate" && part !== codemodePart) {
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

	// Deliberately excludes `data-*` parts: old transcripts can carry data parts
	// from retired features, and counting one as displayable makes a message
	// render as a blank bubble instead of falling through to "no response".
	return part.type === "file" || part.type === "source-url" || part.type === "source-document";
}

export function getToolActivityForPart(
	part: AiChatToolPart,
	{ interrupted = false }: { interrupted?: boolean } = {},
): AiChatToolActivity | null {
	if (!isVisibleToolPart(part)) {
		return null;
	}

	const toolName = getToolPartName(part);
	const presentation = getAiToolPresentation(toolName);
	const receipt = getToolActivityReceipt(part, toolName, interrupted);

	return {
		detail: part,
		presentation,
		status: receipt.status,
		summary: receipt.summary,
		segments: receipt.segments,
		toolName,
	};
}

export function isVisibleToolPart(part: AiChatToolPart) {
	const toolName = getToolPartName(part);
	return getAiToolPresentation(toolName).visibility === "visible";
}

export function getToolPartName(part: AiChatToolPart) {
	return part.type === "dynamic-tool" ? part.toolName : part.type.split("-").slice(1).join("-");
}

function getToolActivityReceipt(
	part: AiChatToolPart,
	toolName: string,
	interrupted: boolean,
): {
	status: AiChatToolActivity["status"];
	summary: string;
	segments?: AiChatToolReceiptSegment[];
} {
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
		default: {
			const running = getRunningToolReceipt({
				toolInput: part.input,
				toolName,
			});
			if (interrupted) {
				const interruptedSummary = lowercaseFirstCharacter(running.summary);
				return {
					status: "interrupted",
					summary: `Interrupted while ${interruptedSummary} — status unknown`,
				};
			}
			return {
				status: "running",
				summary: running.summary,
				segments: running.segments,
			};
		}
	}
}

function lowercaseFirstCharacter(value: string) {
	return value.length === 0 ? value : `${value[0]?.toLocaleLowerCase()}${value.slice(1)}`;
}
