import { describe, expect, it } from "vitest";

import { canDrainQueuedMessage } from "#/features/workspaces/components/ai-chat/ai-chat-queue-drain";

const ready = {
	canSend: true,
	hasAssistantError: false,
	hasConnectionError: false,
	hasHead: true,
	inputStatus: "ready",
	isBlocked: false,
	paused: false,
} as const;

describe("canDrainQueuedMessage", () => {
	it("drains when the chat is idle and healthy", () => {
		expect(canDrainQueuedMessage(ready)).toBe(true);
	});

	it.each([
		["no head", { hasHead: false }],
		["paused", { paused: true }],
		["blocked", { isBlocked: true }],
		["connection error", { hasConnectionError: true }],
		["assistant error", { hasAssistantError: true }],
		["cannot send", { canSend: false }],
		["streaming", { inputStatus: "streaming" }],
		["submitted", { inputStatus: "submitted" }],
		["error status", { inputStatus: "error" }],
	] as const)("waits while %s", (_label, override) => {
		expect(canDrainQueuedMessage({ ...ready, ...override })).toBe(false);
	});
});
