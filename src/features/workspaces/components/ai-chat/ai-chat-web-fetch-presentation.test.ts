import { describe, expect, it } from "vitest";

import type { AiChatToolActivity } from "#/features/workspaces/components/ai-chat/ai-chat-display-state";
import { getFinishedToolSummary } from "#/features/workspaces/components/ai-chat/ai-chat-tool-summaries";
import { getToolSourcePreviews } from "#/features/workspaces/components/ai-chat/ai-chat-tool-source-previews";

describe("web_fetch presentation", () => {
	it.each([
		["page", undefined, "Read example.com/article", "Page"],
		["unsupported", "pdf", "Couldn’t read example.com/article", "PDF"],
		["unsupported", "media_type", "Couldn’t read example.com/article", "Unsupported"],
	])("presents %s output honestly", (kind, reason, summary, sourceKind) => {
		const output = { kind, reason };
		const toolInput = { url: "https://example.com/article" };

		expect(
			getFinishedToolSummary({
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

describe("view_image presentation", () => {
	it("presents a viewed web image with its source link", () => {
		const output = { kind: "image", source: "https://example.com/cell.png" };
		const toolInput = { url: "https://example.com/cell.png" };

		expect(
			getFinishedToolSummary({
				baseStatus: "completed",
				output,
				toolInput,
				toolName: "view_image",
			}),
		).toMatchObject({ status: "completed", summary: "Viewed example.com/cell.png" });
		expect(
			getToolSourcePreviews({
				detail: { input: toolInput, output } as AiChatToolActivity["detail"],
				presentation: {} as AiChatToolActivity["presentation"],
				status: "completed",
				summary: "",
				toolName: "view_image",
			}),
		).toEqual([{ kind: "Image", title: "example.com", url: "https://example.com/cell.png" }]);
	});

	it("presents a viewed workspace image by its file name", () => {
		const output = { kind: "image", source: "/Biology/Krebs cycle.png" };
		const toolInput = { path: "/Biology/Krebs cycle.png" };

		expect(
			getFinishedToolSummary({
				baseStatus: "completed",
				output,
				toolInput,
				toolName: "view_image",
			}),
		).toMatchObject({ status: "completed", summary: "Viewed Krebs cycle.png" });
		expect(
			getToolSourcePreviews({
				detail: { input: toolInput, output } as AiChatToolActivity["detail"],
				presentation: {} as AiChatToolActivity["presentation"],
				status: "completed",
				summary: "",
				toolName: "view_image",
			}),
		).toEqual([{ kind: "Image", title: "Krebs cycle.png" }]);
	});

	it("says when the target was not a usable image", () => {
		const output = { kind: "unsupported", reason: "media_type" };
		const toolInput = { url: "https://example.com/data.zip" };

		expect(
			getFinishedToolSummary({
				baseStatus: "completed",
				output,
				toolInput,
				toolName: "view_image",
			}),
		).toMatchObject({ status: "completed", summary: "Couldn’t view example.com/data.zip" });
	});
});
