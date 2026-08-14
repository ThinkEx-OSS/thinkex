import { reconcileMessages } from "agents/chat";
import type { DynamicToolUIPart, UIMessage } from "ai";
import { describe, expect, it } from "vitest";

function toolMessage(
	id: string,
	toolCallId: string,
	state: "input-available" | "output-available",
	input: Record<string, string> = { query: id },
): UIMessage {
	const part: DynamicToolUIPart =
		state === "output-available"
			? {
					input,
					output: { answer: id },
					state,
					toolCallId,
					toolName: "search",
					type: "dynamic-tool",
				}
			: {
					input,
					state,
					toolCallId,
					toolName: "search",
					type: "dynamic-tool",
				};

	return {
		id,
		parts: [part],
		role: "assistant",
	};
}

describe("agents message reconciliation", () => {
	it("does not merge an older tool result into a later turn that reused its tool-call ID", () => {
		const first = toolMessage("assistant-first", "call-reused", "output-available");
		const second = toolMessage("assistant-second", "call-reused", "input-available");

		const reconciled = reconcileMessages([first, second], [structuredClone(first)]);
		const secondPart = reconciled[1].parts[0];

		expect(reconciled[0].id).toBe("assistant-first");
		expect(reconciled[1].id).toBe("assistant-second");
		expect(secondPart).toMatchObject({
			state: "input-available",
			toolCallId: "call-reused",
		});
		expect(secondPart).not.toHaveProperty("output");
	});

	it("does not relabel a later turn when the earlier assistant is absent", () => {
		const first = toolMessage("assistant-first", "call-reused", "output-available");
		const second = toolMessage("assistant-second", "call-reused", "input-available");

		const reconciled = reconcileMessages([second], [first]);

		expect(reconciled[0].id).toBe("assistant-second");
		expect(reconciled[0].parts[0]).toMatchObject({
			state: "input-available",
			toolCallId: "call-reused",
		});
		expect(reconciled[0].parts[0]).not.toHaveProperty("output");
	});

	it("preserves a resolved result on a stale duplicate of the same tool call", () => {
		const input = { query: "same" };
		const first = toolMessage("assistant-first", "call-1", "output-available", input);
		const duplicate = toolMessage("assistant-duplicate", "call-1", "input-available", input);

		const reconciled = reconcileMessages([first, duplicate], [structuredClone(first)]);

		expect(reconciled[1].parts[0]).toMatchObject({
			output: { answer: "assistant-first" },
			state: "output-available",
			toolCallId: "call-1",
		});
	});
});
