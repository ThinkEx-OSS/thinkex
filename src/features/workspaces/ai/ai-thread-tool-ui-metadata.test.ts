import { describe, expect, it } from "vitest";

import { attachDocumentEditReceiptMetadata } from "#/features/workspaces/ai/ai-thread-tool-ui-metadata";

describe("AI thread edit metadata", () => {
	it("adds review metadata only to document edits", () => {
		const document = attachDocumentEditReceiptMetadata(
			{ applied: 1, itemType: "document" },
			"receipt-1",
		);
		const flashcards = attachDocumentEditReceiptMetadata(
			{ applied: 1, itemType: "flashcard" },
			"receipt-2",
		);

		expect(document).toMatchObject({
			__thinkexUi: { documentEditReceiptId: "receipt-1" },
		});
		expect(flashcards).not.toHaveProperty("__thinkexUi");
	});
});
