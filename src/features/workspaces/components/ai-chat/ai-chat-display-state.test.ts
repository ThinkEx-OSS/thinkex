import { describe, expect, it } from "vitest";

import {
	deriveAiChatPresentation,
	getAssistantRowDisplay,
	getToolActivityForPart,
} from "#/features/workspaces/components/ai-chat/ai-chat-display-state";
import type { AiChatMessage, AiChatToolPart } from "#/features/workspaces/components/ai-chat/types";

describe("interrupted tool receipts", () => {
	it("marks unfinished tools in the latest failed assistant turn as interrupted", () => {
		const part = {
			type: "dynamic-tool",
			toolName: "workspace_edit_item",
			toolCallId: "edit-1",
			state: "input-available",
			input: { path: "/Practice Final Exam 1" },
		} as AiChatToolPart;
		const message = createMessage([part]);
		const presentation = deriveAiChatPresentation([message], "error", {
			isRecovering: false,
			isServerStreaming: false,
			isStreaming: false,
			isToolContinuation: false,
		});

		expect(getAssistantRowDisplay(message, presentation)).toMatchObject({
			kind: "content",
			interruptUnfinishedTools: true,
		});
		expect(getToolActivityForPart(part, { interrupted: true })).toMatchObject({
			status: "interrupted",
			summary: "Interrupted while editing “Practice Final Exam 1” — status unknown",
		});
	});
});

describe("tail status row", () => {
	// A status row that outlives the first token has to be removed when the reply
	// lands, and that shrink drags the pinned transcript. Nothing may hold a row
	// once there is text to read.
	it("drops the status row as soon as the reply renders", () => {
		const message = createMessage([{ type: "text", text: "Hello", state: "streaming" }]);
		const presentation = deriveAiChatPresentation([message], "streaming", {
			isRecovering: false,
			isServerStreaming: false,
			isStreaming: true,
			isToolContinuation: false,
		});

		expect(presentation.tailPending).toBeNull();
	});

	it("keeps the status row while the reply is still empty", () => {
		const message = createMessage([{ type: "text", text: "", state: "streaming" }]);
		const presentation = deriveAiChatPresentation([message], "streaming", {
			isRecovering: false,
			isServerStreaming: true,
			isStreaming: true,
			isToolContinuation: false,
		});

		expect(presentation.tailPending).toBe("thinking");
	});
});

function createMessage(parts: unknown[]) {
	return {
		id: "assistant-1",
		role: "assistant",
		parts,
	} as AiChatMessage;
}
