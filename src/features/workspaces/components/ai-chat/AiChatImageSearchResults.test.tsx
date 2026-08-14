import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { AiChatImageSearchResults } from "#/features/workspaces/components/ai-chat/AiChatImageSearchResults";

describe("AI chat image search results", () => {
	it("renders image results as linked gallery cards", () => {
		const html = renderToStaticMarkup(
			<AiChatImageSearchResults
				output={{
					results: [
						{
							type: "image",
							title: "Mitochondrion diagram",
							url: "https://example.com/biology",
							imageUrl: "https://cdn.example/mitochondrion.png",
							imageWidth: 1600,
							imageHeight: 900,
						},
						{
							type: "page",
							title: "Ignored webpage",
							url: "https://example.com/page",
						},
					],
				}}
			/>,
		);

		expect(html).toContain('href="https://example.com/biology"');
		expect(html).toContain('src="https://cdn.example/mitochondrion.png"');
		expect(html).toContain('aria-label="Mitochondrion diagram"');
		expect(html).toContain('alt=""');
		expect(html).not.toContain("line-clamp-1");
		expect(html).not.toContain("1600 × 900");
		expect(html).not.toContain("Ignored webpage");
	});

	it("does not render unsafe image or source URLs", () => {
		const html = renderToStaticMarkup(
			<AiChatImageSearchResults
				output={{
					results: [
						{
							type: "image",
							url: "https://example.com/source",
							imageUrl: "data:image/png;base64,abc",
						},
						{
							type: "image",
							url: "http://127.0.0.1/private",
							imageUrl: "https://cdn.example/image.png",
						},
					],
				}}
			/>,
		);

		expect(html).toBe("");
	});
});
