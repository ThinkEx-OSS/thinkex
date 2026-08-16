import type { UIMessage } from "ai";
import { describe, expect, it } from "vitest";

import {
	buildCompactionPrompt,
	COMPACTION_KEEP_RECENT_TOKENS,
	prepareCompactedContext,
	serializeMessagesForSummary,
	splitForCompaction,
	type CompactionContextRow,
} from "#/features/workspaces/ai/chat/chat-compaction";

function textMessage(role: "user" | "assistant", id: string, chars: number): UIMessage {
	return { id, role, parts: [{ type: "text", text: "x".repeat(chars) }] };
}

function toRows(messages: UIMessage[]): CompactionContextRow[] {
	return messages.map((message, index) => ({ seq: index + 1, message, compaction: null }));
}

describe("splitForCompaction", () => {
	it("keeps the recent tail within budget and cuts at a user boundary", () => {
		// Each pair ≈ 2.5k tokens (10k chars); budget 12k keeps ~2 pairs.
		const messages = [
			textMessage("user", "u1", 20_000),
			textMessage("assistant", "a1", 20_000),
			textMessage("user", "u2", 20_000),
			textMessage("assistant", "a2", 20_000),
			textMessage("user", "u3", 20_000),
			textMessage("assistant", "a3", 20_000),
		];
		const { head, tail } = splitForCompaction(messages);

		expect(tail[0]?.role).toBe("user");
		expect(head.length + tail.length).toBe(messages.length);
		expect(tail.length).toBeGreaterThan(0);
	});

	it("always keeps the final message even when it alone exceeds the budget", () => {
		const messages = [
			textMessage("user", "u1", 1_000),
			textMessage("assistant", "a1", 1_000),
			textMessage("user", "huge", COMPACTION_KEEP_RECENT_TOKENS * 8),
		];
		const { tail } = splitForCompaction(messages);

		expect(tail.map((message) => message.id)).toEqual(["huge"]);
	});
});

describe("prepareCompactedContext", () => {
	const systemPrompt = "system";

	it("returns messages unchanged when under the window", async () => {
		const rows = toRows([textMessage("user", "u1", 100)]);
		const result = await prepareCompactedContext({
			rows,
			systemPrompt,
			contextWindow: 200_000,
			summarize: async () => {
				throw new Error("should not summarize");
			},
		});

		expect(result.newCompaction).toBeUndefined();
		expect(result.messages.map((message) => message.id)).toEqual(["u1"]);
	});

	it("compacts an over-budget thread into summary + tail and reports the marker", async () => {
		// ~200k chars each ≈ 50k tokens; four of them ≈ 200k tokens, well past a
		// 200k window minus the buffer.
		const messages = [
			textMessage("user", "u1", 200_000),
			textMessage("assistant", "a1", 200_000),
			textMessage("user", "u2", 200_000),
			textMessage("assistant", "a2", 200_000),
			textMessage("user", "u3", 8_000),
		];
		const prompts: string[] = [];
		const result = await prepareCompactedContext({
			rows: toRows(messages),
			systemPrompt,
			contextWindow: 200_000,
			summarize: async (prompt) => {
				prompts.push(prompt);
				return "## Objective\n- test summary";
			},
		});

		expect(result.newCompaction).toBeDefined();
		expect(result.messages[0]?.id).toBe("compaction-summary");
		expect(result.messages.at(-1)?.id).toBe("u3");
		// firstKeptSeq points at the first surviving row.
		const keptIds = result.messages.slice(1).map((message) => message.id);
		expect(result.newCompaction?.firstKeptSeq).toBe(
			messages.findIndex((message) => message.id === keptIds[0]) + 1,
		);
		expect(prompts[0]).toContain("<conversation>");
	});

	it("resumes from a stored compaction marker and merges the prior summary", async () => {
		const rows: CompactionContextRow[] = [
			{ seq: 1, message: textMessage("user", "old", 10), compaction: null },
			{
				seq: 5,
				message: { id: "c1", role: "system", parts: [] },
				compaction: { summary: "prior summary", firstKeptSeq: 3 },
			},
			{ seq: 3, message: textMessage("user", "kept-user", 400_000), compaction: null },
			{ seq: 4, message: textMessage("assistant", "kept-assistant", 400_000), compaction: null },
			{ seq: 6, message: textMessage("user", "next", 400_000), compaction: null },
		];
		let sawPrior = false;
		const result = await prepareCompactedContext({
			rows,
			systemPrompt,
			contextWindow: 200_000,
			summarize: async (prompt) => {
				sawPrior = prompt.includes("prior summary");
				return "merged summary";
			},
		});

		// The pre-marker row never re-enters context.
		expect(result.messages.some((message) => message.id === "old")).toBe(false);
		expect(sawPrior).toBe(true);
		expect(result.messages[0]?.parts[0]).toMatchObject({ type: "text" });
	});

	it("fails open when the summarizer throws", async () => {
		const messages = [
			textMessage("user", "u1", 900_000),
			textMessage("assistant", "a1", 900_000),
			textMessage("user", "u2", 1_000),
		];
		const result = await prepareCompactedContext({
			rows: toRows(messages),
			systemPrompt,
			contextWindow: 200_000,
			summarize: async () => {
				throw new Error("provider down");
			},
		});

		expect(result.newCompaction).toBeUndefined();
		expect(result.messages).toHaveLength(3);
	});
});

describe("prompt building", () => {
	it("serializes tool parts with truncated output", () => {
		const message: UIMessage = {
			id: "a1",
			role: "assistant",
			parts: [
				{
					type: "dynamic-tool",
					toolName: "workspace_list_items",
					toolCallId: "t1",
					state: "output-available",
					input: { path: "/" },
					output: { items: "y".repeat(10_000) },
				} as UIMessage["parts"][number],
			],
		};
		const serialized = serializeMessagesForSummary([message]);

		expect(serialized).toContain("workspace_list_items");
		expect(serialized).toContain("[truncated]");
	});

	it("includes the iterative-merge block only with a prior summary", () => {
		expect(buildCompactionPrompt({ conversation: "c" })).not.toContain("<prior-summary>");
		expect(buildCompactionPrompt({ conversation: "c", previousSummary: "p" })).toContain(
			"<prior-summary>",
		);
	});
});
