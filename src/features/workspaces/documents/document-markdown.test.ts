import { describe, expect, it } from "vitest";

import { serializeTiptapDocumentToMarkdown } from "#/features/workspaces/documents/document-markdown";

describe("document markdown", () => {
	it("renders a workspace image as an item-id link with sanitized alt", () => {
		const markdown = serializeTiptapDocumentToMarkdown({
			type: "doc",
			content: [
				{ type: "paragraph", content: [{ type: "text", text: "Before" }] },
				{ type: "image", attrs: { itemId: "item-1", alt: "A ]cell[\ndiagram" } },
			],
		});

		expect(markdown).toContain("Before");
		expect(markdown).toContain("![A  cell[ diagram](item-1)");
	});
});
