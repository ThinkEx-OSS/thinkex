import { describe, expect, it } from "vitest";

import {
	getDisplayableParts,
	type AiChatToolGroupPart,
} from "#/features/workspaces/components/ai-chat/ai-chat-display-state";
import type { AiChatMessage } from "#/features/workspaces/components/ai-chat/types";

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
					method: "workspace_list_items",
					args: { path: "/" },
					result: { items: [{ path: "/Notes" }] },
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
				id: "1:tools:workspace_list_items",
				status: "completed",
				summary: "Listed 1 item",
				toolName: "workspace_list_items",
			},
		]);
		expect(parts[1]).toMatchObject({ toolCallId: "direct-tool-1" });
	});

	it("falls back to sibling tool parts for messages created before call logs", () => {
		const message = createMessage([
			createOrchestratePart({ status: "completed", executionId: "execution-1", result: null }),
			{
				type: "tool-workspace_list_items",
				toolCallId: "tool-1",
				state: "output-available",
				input: { path: "/" },
				output: { items: [] },
			},
		]);

		const [group] = getDisplayableParts(message) as AiChatToolGroupPart[];

		expect(group.children).toEqual([
			{
				id: "tool-1",
				status: "completed",
				summary: "Listed 0 items",
				toolName: "workspace_list_items",
			},
		]);
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

function createMessage(parts: unknown[]) {
	return {
		id: "assistant-1",
		role: "assistant",
		parts,
	} as AiChatMessage;
}

function createOrchestratePart(output: unknown) {
	return {
		type: "tool-orchestrate",
		toolCallId: "orchestrate-1",
		state: "output-available",
		input: { code: "async () => null" },
		output,
	};
}
