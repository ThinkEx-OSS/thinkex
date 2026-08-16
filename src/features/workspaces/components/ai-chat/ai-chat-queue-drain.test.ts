import { describe, expect, it } from "vitest";

import { canDrainQueuedMessage } from "#/features/workspaces/components/ai-chat/ai-chat-queue-drain";

const ready = {
	canSend: true,
	errorKind: undefined,
	isBlocked: false,
	paused: false,
} as const;

describe("canDrainQueuedMessage", () => {
	it("drains when the chat is idle and healthy", () => {
		expect(canDrainQueuedMessage(ready)).toBe(true);
	});

	it("drains an explicitly promoted message after the active run is aborted", () => {
		expect(
			canDrainQueuedMessage({
				...ready,
				errorKind: "aborted",
			}),
		).toBe(true);
	});

	it.each([
		["paused", { paused: true }],
		["blocked", { isBlocked: true }],
		["connection error", { errorKind: "connection" }],
		["assistant error", { errorKind: "assistant" }],
		["cannot send", { canSend: false }],
	] as const)("waits while %s", (_label, override) => {
		expect(canDrainQueuedMessage({ ...ready, ...override })).toBe(false);
	});
});
