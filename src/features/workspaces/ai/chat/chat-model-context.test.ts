import type { UIMessage } from "ai";
import { describe, expect, it } from "vitest";

import { prepareCompactedContext } from "#/features/workspaces/ai/chat/chat-compaction";
import { convertPersistedMessagesToModelMessages } from "#/features/workspaces/ai/chat/chat-model-context";

describe("convertPersistedMessagesToModelMessages", () => {
	it("replays provider-bound reasoning and tool history as portable inline content", async () => {
		const messages: UIMessage[] = [
			{
				id: "assistant-1",
				role: "assistant",
				parts: [
					{
						type: "reasoning",
						text: "private reasoning",
						providerMetadata: {
							openai: { itemId: "rs_old", reasoningEncryptedContent: "encrypted" },
						},
					},
					{
						type: "text",
						text: "The answer is 42.",
						providerMetadata: { openai: { itemId: "msg_old" } },
					},
					{
						type: "dynamic-tool",
						toolName: "lookup",
						toolCallId: "call_1",
						state: "output-available",
						input: { query: "meaning" },
						output: { value: 42 },
						callProviderMetadata: { openai: { itemId: "fc_old" } },
						resultProviderMetadata: { openai: { itemId: "fco_old" } },
					},
					{
						type: "dynamic-tool",
						toolName: "second_lookup",
						toolCallId: "call_2",
						state: "output-available",
						input: {},
						output: { done: true },
						resultProviderMetadata: { openai: { itemId: "result_only_old" } },
					},
				],
			},
			{ id: "user-2", role: "user", parts: [{ type: "text", text: "Continue." }] },
		];

		const converted = await convertPersistedMessagesToModelMessages(messages);
		const serialized = JSON.stringify(converted);

		expect(serialized).not.toContain("private reasoning");
		expect(serialized).not.toContain("itemId");
		expect(serialized).not.toContain("providerOptions");
		expect(serialized).toContain("The answer is 42.");
		expect(serialized).toContain('"toolCallId":"call_1"');
		expect(serialized).toContain('"value":42');
	});

	it("drops provider file references but keeps their durable URLs", async () => {
		const messages: UIMessage[] = [
			{
				id: "user-1",
				role: "user",
				parts: [
					{
						type: "file",
						mediaType: "image/png",
						url: "https://example.com/durable.png",
						providerReference: { openai: "file_old" },
						providerMetadata: { openai: { itemId: "file_item_old" } },
					},
				],
			},
		];

		const converted = await convertPersistedMessagesToModelMessages(messages);
		const serialized = JSON.stringify(converted);

		expect(serialized).toContain("https://example.com/durable.png");
		expect(serialized).not.toContain("file_old");
		expect(serialized).not.toContain("file_item_old");
	});

	it("keeps a compacted tail portable when it contains stale provider references", async () => {
		const messages: UIMessage[] = [
			{ id: "old-user", role: "user", parts: [{ type: "text", text: "x".repeat(300_000) }] },
			{
				id: "old-assistant",
				role: "assistant",
				parts: [{ type: "text", text: "y".repeat(300_000) }],
			},
			{
				id: "recent-user",
				role: "user",
				parts: [{ type: "text", text: "What was the recent answer?" }],
			},
			{
				id: "recent-assistant",
				role: "assistant",
				parts: [
					{
						type: "text",
						text: "A recent answer.",
						providerMetadata: { openai: { itemId: "msg_expired_reference" } },
					},
				],
			},
			{ id: "current-user", role: "user", parts: [{ type: "text", text: "Continue." }] },
		];
		const context = await prepareCompactedContext({
			rows: messages.map((message, index) => ({
				seq: index + 1,
				message,
				compaction: null,
			})),
			systemPrompt: "system",
			contextWindow: 100_000,
			summarize: async () => "Earlier conversation summary.",
		});
		const converted = await convertPersistedMessagesToModelMessages(context.messages);
		const serialized = JSON.stringify(converted);

		expect(context.newCompaction).toBeDefined();
		expect(serialized).toContain("Earlier conversation summary.");
		expect(serialized).toContain("A recent answer.");
		expect(serialized).not.toContain("msg_expired_reference");
	});
});
