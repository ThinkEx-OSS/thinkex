import { describe, expect, it } from "vitest";

import type { AiChatToolActivity } from "#/features/workspaces/components/ai-chat/ai-chat-display-state";
import { getFinishedToolReceipt } from "#/features/workspaces/components/ai-chat/ai-chat-tool-receipts";
import { getToolSourcePreviews } from "#/features/workspaces/components/ai-chat/ai-chat-tool-source-previews";

describe("web_fetch presentation", () => {
	it.each([
		["page", undefined, "Read example.com/article", "Page"],
		["image", undefined, "Inspected example.com/article", "Image"],
		["unsupported", "pdf", "Couldn’t read example.com/article", "PDF"],
		["unsupported", "media_type", "Couldn’t read example.com/article", "Unsupported"],
	])("presents %s output honestly", (kind, reason, summary, sourceKind) => {
		const output = { kind, reason };
		const toolInput = { url: "https://example.com/article" };

		expect(
			getFinishedToolReceipt({
				baseStatus: "completed",
				output,
				toolInput,
				toolName: "web_fetch",
			}),
		).toMatchObject({ status: "completed", summary });
		expect(
			getToolSourcePreviews({
				detail: { input: toolInput, output } as AiChatToolActivity["detail"],
				presentation: {} as AiChatToolActivity["presentation"],
				status: "completed",
				summary,
				toolName: "web_fetch",
			}),
		).toEqual([
			{
				kind: sourceKind,
				title: "example.com",
				url: "https://example.com/article",
			},
		]);
	});
});
