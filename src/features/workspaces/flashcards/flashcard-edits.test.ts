import { describe, expect, it } from "vitest";

import { createFlashcardSetFromHtml } from "#/features/workspaces/flashcards/flashcard-content";
import { applyFlashcardEdits } from "#/features/workspaces/flashcards/flashcard-edits";

describe("applyFlashcardEdits", () => {
	it("inserts, moves, updates, and deletes by stable card ID", () => {
		const set = createFlashcardSetFromHtml([
			{ front: "<p>A</p>", back: "<p>1</p>" },
			{ front: "<p>B</p>", back: "<p>2</p>" },
		]);
		const [first, second] = set.cards;
		const result = applyFlashcardEdits(set, [
			{ op: "insert_card", beforeCardId: second!.id, front: "<p>C</p>", back: "<p>3</p>" },
			{ op: "move_card", cardId: first!.id, afterCardId: second!.id },
			{ op: "update_card", cardId: second!.id, back: "<p>Two</p>" },
			{ op: "delete_card", cardId: first!.id },
		]);

		expect(result.applied).toBe(4);
		expect(result.failed).toEqual([]);
		expect(result.content.cards).toHaveLength(2);
		expect(result.content.cards[1]?.id).toBe(second!.id);
	});

	it("keeps processing after a missing target", () => {
		const set = createFlashcardSetFromHtml([{ front: "<p>A</p>", back: "<p>1</p>" }]);
		const result = applyFlashcardEdits(set, [
			{ op: "delete_card", cardId: crypto.randomUUID() },
			{ op: "update_card", cardId: set.cards[0]!.id, front: "<p>Updated</p>" },
		]);

		expect(result.applied).toBe(1);
		expect(result.failed).toMatchObject([{ code: "card_not_found", index: 0 }]);
	});

	it("keeps one card and ignores edits that do not change content", () => {
		const set = createFlashcardSetFromHtml([{ front: "<p>A</p>", back: "<p>1</p>" }]);
		const card = set.cards[0]!;
		const result = applyFlashcardEdits(set, [
			{ op: "update_card", cardId: card.id, front: "<p>A</p>" },
			{ op: "move_card", cardId: card.id },
			{ op: "delete_card", cardId: card.id },
		]);

		expect(result.applied).toBe(0);
		expect(result.failed).toMatchObject([{ code: "invalid_card_content", index: 2 }]);
		expect(result.content.cards).toEqual(set.cards);
	});
});
