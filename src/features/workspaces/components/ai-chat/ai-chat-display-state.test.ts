import { describe, expect, it } from "vitest";

import {
	deriveAiChatPresentation,
	getAssistantRowDisplay,
	getDisplayableParts,
	getToolActivityForPart,
	type AiChatToolGroupPart,
} from "#/features/workspaces/components/ai-chat/ai-chat-display-state";
import type { AiChatMessage, AiChatToolPart } from "#/features/workspaces/components/ai-chat/types";

describe("Code Mode tool groups", () => {
	it("renders the durable call log as the canonical child activity trail", () => {
		const output = {
			status: "completed",
			executionId: "execution-1",
			result: null,
			calls: [
				{
					seq: 1,
					connector: "tools",
					method: "web_search",
					args: { query: "notes" },
					result: { results: [] },
					requiresApproval: false,
					state: "applied",
				},
			],
		};
		const siblingTool = {
			type: "tool-web_search",
			toolCallId: "direct-tool-1",
			state: "output-available",
			input: { query: "durable objects" },
			output: { results: [] },
		};
		const parts = getDisplayableParts(createMessage([createOrchestratePart(output), siblingTool]));
		const group = parts[0] as AiChatToolGroupPart;

		expect(group.children).toEqual([
			{
				id: "orchestrate-1:1:tools:web_search",
				presentation: {
					icon: "search",
					title: "Search web",
					visibility: "visible",
				},
				status: "completed",
				summary: "Found 0 sources for “notes”",
				segments: [
					{ kind: "text", value: "Found 0 sources for “" },
					{ kind: "name", value: "notes" },
					{ kind: "text", value: "”" },
				],
				toolName: "web_search",
			},
		]);
		expect(parts[1]).toMatchObject({ toolCallId: "direct-tool-1" });
	});

	it("applies registry visibility to nested Code Mode calls", () => {
		const output = {
			status: "completed",
			calls: [
				{
					seq: 1,
					connector: "tools",
					method: "time_get_current",
					args: {},
					result: { isoUtc: "2026-01-01T00:00:00Z" },
					requiresApproval: false,
					state: "applied",
				},
			],
		};
		const [group] = getDisplayableParts(
			createMessage([createOrchestratePart(output)]),
		) as AiChatToolGroupPart[];

		expect(group.children).toEqual([]);
	});

	it("merges every orchestration call in the message into one ordered trail", () => {
		const callLog = (seq: number, query: string) => ({
			status: "completed",
			executionId: `execution-${seq}`,
			result: null,
			calls: [
				{
					seq,
					connector: "tools",
					method: "web_search",
					args: { query },
					result: { results: [] },
					requiresApproval: false,
					state: "applied",
				},
			],
		});
		const parts = getDisplayableParts(
			createMessage([
				createOrchestratePart(callLog(1, "first"), "orchestrate-1"),
				createOrchestratePart(callLog(1, "second"), "orchestrate-2"),
			]),
		);

		expect(parts).toHaveLength(1);
		const group = parts[0] as AiChatToolGroupPart;
		// Both calls log `seq: 1`, so ids must stay distinct for React keys.
		expect(group.children.map((child) => child.id)).toEqual([
			"orchestrate-1:1:tools:web_search",
			"orchestrate-2:1:tools:web_search",
		]);
		expect(group.children.map((child) => child.summary)).toEqual([
			"Found 0 sources for “first”",
			"Found 0 sources for “second”",
		]);
		// The header describes the latest call, so the row reads as current work.
		expect(group.part.toolCallId).toBe("orchestrate-2");
	});

	it("does not absorb sibling tools when a durable call log is malformed", () => {
		const siblingTool = {
			type: "tool-web_search",
			toolCallId: "direct-tool-1",
			state: "output-available",
			input: { query: "durable objects" },
			output: { results: [] },
		};
		const parts = getDisplayableParts(
			createMessage([createOrchestratePart({ calls: null }), siblingTool]),
		);
		const group = parts[0] as AiChatToolGroupPart;

		expect(group.children).toEqual([]);
		expect(parts[1]).toMatchObject({ toolCallId: "direct-tool-1" });
	});
});

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
		const message = createMessage([]);
		const presentation = deriveAiChatPresentation([message], "submitted", {
			isRecovering: false,
			isServerStreaming: false,
			isStreaming: false,
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

function createOrchestratePart(output: unknown, toolCallId = "orchestrate-1") {
	return {
		type: "tool-orchestrate",
		toolCallId,
		state: "output-available",
		input: { code: "async () => null" },
		output,
	};
}
