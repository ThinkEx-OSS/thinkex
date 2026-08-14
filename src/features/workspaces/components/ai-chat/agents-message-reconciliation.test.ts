import { reconcileMessages } from "agents/chat";
import type { DynamicToolUIPart, UIMessage } from "ai";
import { describe, expect, it } from "vitest";

function toolMessage(
	id: string,
	toolCallId: string,
	state: "input-available" | "output-available",
): UIMessage {
	const part: DynamicToolUIPart =
		state === "output-available"
			? {
					input: { query: id },
					output: { answer: id },
					state,
					toolCallId,
					toolName: "search",
					type: "dynamic-tool",
				}
			: {
					input: { query: id },
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

		const [reconciled] = reconcileMessages([second], [structuredClone(first)]);
		const secondPart = reconciled.parts[0];

		expect(reconciled.id).toBe("assistant-second");
		expect(secondPart).toMatchObject({
			state: "input-available",
			toolCallId: "call-reused",
		});
		expect(secondPart).not.toHaveProperty("output");
	});
});
