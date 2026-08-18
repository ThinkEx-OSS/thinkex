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
		).toThrow("Flashcard content cannot contain heading nodes.");
	});

	it("accepts an embedded workspace image and round-trips its item id", () => {
		const set = createFlashcardSetFromHtml([
			{ front: '<p>Label this</p><img data-item-id="item-1">', back: "<p>A cell</p>" },
		]);
		const parsed = parseFlashcardSetContent(stringifyFlashcardSetContent(set));

		expect(serializeFlashcardSetToHtml(parsed)[0]?.front).toBe(
			'<p>Label this</p><img data-item-id="item-1">',
		);
	});

	it("rejects empty sets and malformed stored rich text", () => {
		expect(() => parseFlashcardSetContent('{"version":1,"cards":[]}')).toThrow(
			"A flashcard set needs at least one card.",
		);

		const set = createFlashcardSetFromHtml([{ front: "<p>A</p>", back: "<p>1</p>" }]);
		set.cards[0]!.front = { type: "doc", content: [{ type: "unknown" }] };
		expect(() => parseFlashcardSetContent(stringifyFlashcardSetContent(set))).toThrow(
			"Flashcard content contains invalid rich text.",
		);
	});
});
