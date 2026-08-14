import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import AiChatMessageRow from "#/features/workspaces/components/ai-chat/AiChatMessageRow";
import type { AssistantRowDisplay } from "#/features/workspaces/components/ai-chat/ai-chat-display-state";
import type { AiChatMessage } from "#/features/workspaces/components/ai-chat/types";

describe("AI chat assistant part spacing", () => {
	it("separates a completed tool result from the following response", () => {
		const parts = [
			{
				type: "tool-web_search",
				toolCallId: "search-1",
				state: "output-available",
				input: { query: "mountain landscape", source: "images" },
				output: {
					results: [
						{
							type: "image",
							title: "Mountain landscape",
							url: "https://example.com/mountain",
							imageUrl: "https://cdn.example.com/mountain.jpg",
						},
					],
				},
			},
			{ type: "text", text: "The image search tool works.", state: "done" },
		] as AiChatMessage["parts"];
		const message = { id: "assistant-1", role: "assistant", parts } as AiChatMessage;
		const display: AssistantRowDisplay = {
			kind: "content",
			parts,
			interruptUnfinishedTools: false,
		};

		const html = renderToStaticMarkup(
			createElement(AiChatMessageRow, {
				display,
				isLatestAssistant: true,
				isRegenerable: false,
				isStreaming: false,
				message,
			}),
		);

		expect(html).toContain('data-slot="assistant-parts"');
		expect(html).toContain('class="flex flex-col gap-3"');
	});
});
