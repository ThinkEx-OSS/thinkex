import { describe, expect, it } from "vitest";

import {
	createFlashcardSetFromHtml,
	parseFlashcardSetContent,
	serializeFlashcardSetToHtml,
	stringifyFlashcardSetContent,
} from "#/features/workspaces/flashcards/flashcard-content";

describe("flashcard content", () => {
	it("stores stable IDs and Tiptap JSON while exposing HTML", () => {
		const set = createFlashcardSetFromHtml([
			{ front: "<p>What is <strong>ATP</strong>?</p>", back: "<p>Cellular energy.</p>" },
		]);
		const parsed = parseFlashcardSetContent(stringifyFlashcardSetContent(set));

		expect(parsed.cards[0]?.id).toBe(set.cards[0]?.id);
		expect(parsed.cards[0]?.front.type).toBe("doc");
		expect(serializeFlashcardSetToHtml(parsed)[0]).toMatchObject({
			front: "<p>What is <strong>ATP</strong>?</p>",
			back: "<p>Cellular energy.</p>",
		});
	});

	it("rejects document-only nodes", () => {
		expect(() =>
			createFlashcardSetFromHtml([{ front: "<h2>Heading</h2>", back: "<p>A</p>" }]),
		).toThrow("Flashcards do not support heading content yet.");
	});
});
