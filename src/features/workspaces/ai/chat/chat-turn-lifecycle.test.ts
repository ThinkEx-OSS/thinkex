import { describe, expect, it } from "vitest";

import { settledParts } from "#/features/workspaces/ai/chat/chat-model";
import {
	AI_CHAT_STREAM_CLAIM_STALE_MS,
	isStreamClaimFresh,
} from "#/features/workspaces/ai/chat/chat-claim";

describe("stream claim freshness", () => {
	const now = Date.parse("2026-08-21T22:00:00Z");

	it("keeps a recently pinged claim active", () => {
		expect(
			isStreamClaimFresh({ activeStreamId: "stream-1", updatedAt: new Date(now - 1_000) }, now),
		).toBe(true);
	});

	it("lets the UI recover from an orphaned claim", () => {
		expect(
			isStreamClaimFresh(
				{
					activeStreamId: "stream-1",
					updatedAt: new Date(now - AI_CHAT_STREAM_CLAIM_STALE_MS - 1),
				},
				now,
			),
		).toBe(false);
	});
});

describe("settledParts", () => {
	it("keeps text and terminal tool parts", () => {
		const parts = [
			{ type: "text" as const, text: "partial reply", state: "streaming" as const },
			{
				type: "tool-web_search",
				toolCallId: "t1",
				state: "output-available",
				input: { query: "q" },
				output: { results: [] },
			},
		] as Parameters<typeof settledParts>[0];

		expect(settledParts(parts)).toEqual(parts);
	});

	it("drops mid-argument tool calls — they never executed", () => {
		const parts = [
			{ type: "tool-web_search", toolCallId: "t1", state: "input-streaming", input: undefined },
		] as Parameters<typeof settledParts>[0];

		expect(settledParts(parts)).toEqual([]);
	});

	it("turns possibly-executed tool calls into explicit unknown-outcome errors", () => {
		const parts = [
			{
				type: "tool-workspace_edit_item",
				toolCallId: "t1",
				state: "input-available",
				input: { path: "/Doc" },
				approval: { id: "a1" },
			},
		] as unknown as Parameters<typeof settledParts>[0];
		const [settled] = settledParts(parts);

		expect(settled).toMatchObject({
			toolCallId: "t1",
			state: "output-error",
			input: { path: "/Doc" },
		});
		expect((settled as { errorText?: string }).errorText).toContain("outcome");
		// A stale approval request must not re-enter the model context.
		expect(settled).not.toHaveProperty("approval");
	});
});
