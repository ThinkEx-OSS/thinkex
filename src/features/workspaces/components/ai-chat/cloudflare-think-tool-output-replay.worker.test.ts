import { Think } from "@cloudflare/think";
import type { DynamicToolUIPart, ModelMessage, ToolSet, UIMessage } from "ai";
import { describe, expect, it } from "vitest";

interface AssembleModelMessagesHarness {
	_emit: (event: string, payload: unknown) => void;
	_incompleteToolCallIds: (messages: readonly UIMessage[]) => string[];
	_repairTranscriptForProvider: (messages: readonly UIMessage[]) => Promise<UIMessage[]>;
	messages: UIMessage[];
}

interface ThinkModelAssemblyInternals {
	_assembleModelMessages: (
		this: AssembleModelMessagesHarness,
		tools: ToolSet,
	) => Promise<ModelMessage[]>;
}

const thinkInternals = Think.prototype as unknown as ThinkModelAssemblyInternals;

function userMessage(id: string): UIMessage {
	return {
		id,
		parts: [{ type: "text", text: "Continue" }],
		role: "user",
	};
}

describe("Cloudflare Think model-message assembly", () => {
	it("keeps completed tool output intact as later messages are added", async () => {
		const content = "PDF page content. ".repeat(100);
		const toolPart: DynamicToolUIPart = {
			input: { path: "/report.pdf" },
			output: { content },
			state: "output-available",
			toolCallId: "read-1",
			toolName: "workspace_read_items",
			type: "dynamic-tool",
		};
		const messages: UIMessage[] = [
			{
				id: "assistant-1",
				parts: [toolPart],
				role: "assistant",
			},
			...Array.from({ length: 5 }, (_, index) => userMessage(`user-${index + 1}`)),
		];
		const harness: AssembleModelMessagesHarness = {
			_emit: () => undefined,
			_incompleteToolCallIds: () => [],
			_repairTranscriptForProvider: async (history) => [...history],
			messages,
		};

		const assembled = await thinkInternals._assembleModelMessages.call(harness, {});
		const serialized = JSON.stringify(assembled);

		expect(serialized).toContain(content);
	});
});
