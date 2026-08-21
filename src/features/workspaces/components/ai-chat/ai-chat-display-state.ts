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
	getFinishedToolSummary,
	getRunningToolSummary,
	type AiChatToolSummarySegment,
} from "#/features/workspaces/components/ai-chat/ai-chat-tool-summaries";

export type AssistantRowDisplay =
	| {
			interruptUnfinishedTools: boolean;
			kind: "content";
			parts: AiChatMessagePart[];
	  }
	| { kind: "empty-terminal"; canRegenerate: boolean }
	| { kind: "hidden" };

export interface AiChatToolActivity {
	detail: AiChatToolPart;
	presentation: AiToolPresentation;
	status: "completed" | "failed" | "interrupted" | "running";
	summary: string;
	segments?: AiChatToolSummarySegment[];
	toolName: string;
}

export interface AiChatPresentation {
	isBusy: boolean;
	lastAssistantMessageId: string | undefined;
	status: AiChatStatus;
	/** Show the "thinking" status row until visible reply content exists. */
	tailPending: boolean;
}

export function isAiChatStreamActive(status: AiChatStatus) {
	return status === "submitted" || status === "streaming";
}

// Derived purely from useChat's status and the messages — the DO-era inputs
// (socket recovery, server-vs-client streaming, tool continuation) retired
// with the websocket transport.
export function deriveAiChatPresentation(
	messages: AiChatMessage[],
	status: AiChatStatus,
): AiChatPresentation {
	const lastMessage = messages.at(-1);
	const lastAssistantMessageId = lastMessage?.role === "assistant" ? lastMessage.id : undefined;
	const isBusy = isAiChatStreamActive(status);
	const hasVisibleAssistantTail =
		lastMessage?.role === "assistant" && getDisplayableParts(lastMessage).length > 0;

	return {
		isBusy,
		lastAssistantMessageId,
		status,
		// Once the reply is actually rendering, the status row goes away — the
		// text arriving is its own progress indicator. Keeping a row up for the
		// length of the reply also means removing it at the end, and that shrink
		// shifts the transcript no matter how promptly the tail spacer
		// compensates.
		tailPending: isBusy && !hasVisibleAssistantTail,
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

	// A stop before the first visible token still has a durable assistant row.
	// Render its empty content shell so AiChatMessageRow can show the explicit
	// interruption footer instead of the generic "didn't return" fallback.
	if ((message.metadata as { turnStatus?: string } | undefined)?.turnStatus === "interrupted") {
		return { kind: "content", parts: [], interruptUnfinishedTools: true };
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

export function getDisplayableParts(message: AiChatMessage): AiChatMessagePart[] {
	return message.parts.filter(isDisplayableMessagePart);
}

export function isDisplayableMessagePart(part: AiChatMessagePart): boolean {
	if (part.type === "text") {
		return part.text.length > 0;
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
	return part.type === "file";
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
	const toolSummary = getToolActivitySummary(part, toolName, interrupted);

	return {
		detail: part,
		presentation,
		status: toolSummary.status,
		summary: toolSummary.summary,
		segments: toolSummary.segments,
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

function getToolActivitySummary(
	part: AiChatToolPart,
	toolName: string,
	interrupted: boolean,
): {
	status: AiChatToolActivity["status"];
	summary: string;
	segments?: AiChatToolSummarySegment[];
} {
	switch (part.state) {
		case "output-available":
			return getFinishedToolSummary({
				baseStatus: "completed",
				output: part.output,
				toolInput: part.input,
				toolName,
			});
		case "output-denied":
		case "output-error":
			return getFinishedToolSummary({
				baseStatus: "failed",
				output: part.output,
				toolInput: part.input,
				toolName,
			});
		default: {
			const running = getRunningToolSummary({
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
