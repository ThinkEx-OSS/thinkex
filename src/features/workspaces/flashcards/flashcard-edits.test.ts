import { describe, expect, it } from "vitest";

import {
	createFlashcardRevision,
	createFlashcardSetFromHtml,
	type Flashcard,
} from "#/features/workspaces/flashcards/flashcard-content";
import {
	applyFlashcardEdits,
	flashcardEditSchema,
} from "#/features/workspaces/flashcards/flashcard-edits";

describe("applyFlashcardEdits", () => {
	it("supports the shared edit verbs while preserving card identity", async () => {
		const set = createFlashcardSetFromHtml([
			{ front: "<p>A</p>", back: "<p>1</p>" },
			{ front: "<p>B</p>", back: "<p>2</p>" },
		]);
		const [first, second] = set.cards;
		const { refs, targets } = await createTargets(first!, second!);
		const [firstRef, secondRef] = refs;
		const result = await applyFlashcardEdits(
			set,
			[
				{
					op: "insert_before",
					ref: secondRef,
					front: "<p>C</p>",
					back: "<p>3</p>",
				},
				{ op: "move", ref: firstRef, afterRef: secondRef },
				{ op: "update", ref: secondRef, back: "<p>Two</p>" },
				{ op: "replace_text", ref: secondRef, side: "front", find: "B", replace: "Bee" },
				{ op: "replace", ref: firstRef, front: "<p>Alpha</p>", back: "<p>One</p>" },
				{
					op: "insert_after",
					ref: firstRef,
					front: "<p>D</p>",
					back: "<p>4</p>",
				},
				{ op: "delete", ref: firstRef },
			],
			targets,
		);

		expect(result.applied).toBe(7);
		expect(result.failed).toEqual([]);
		expect(result.content.cards).toHaveLength(3);
		expect(result.content.cards[1]?.id).toBe(second!.id);
		expect(result.content.cards[1]?.front).toMatchObject({
			content: [{ content: [{ text: "Bee" }] }],
		});
	});

	it("keeps processing after a missing target", async () => {
		const set = createFlashcardSetFromHtml([{ front: "<p>A</p>", back: "<p>1</p>" }]);
		const {
			refs: [ref],
			targets,
		} = await createTargets(set.cards[0]!);
		const result = await applyFlashcardEdits(
			set,
			[
				{ op: "delete", ref: "wr_ZZZZZZZZ" },
				{ op: "update", ref, front: "<p>Updated</p>" },
			],
			targets,
		);

		expect(result.applied).toBe(1);
		expect(result.failed).toMatchObject([{ code: "ref_not_found", index: 0 }]);
	});

	it("reports no-op and last-card failures", async () => {
		const set = createFlashcardSetFromHtml([{ front: "<p>A</p>", back: "<p>1</p>" }]);
		const card = set.cards[0]!;
		const {
			refs: [ref],
			targets,
		} = await createTargets(card);
		const result = await applyFlashcardEdits(
			set,
			[
				{ op: "update", ref, front: "<p>A</p>" },
				{ op: "move", ref, beforeRef: ref },
				{ op: "delete", ref },
			],
			targets,
		);

		expect(result.applied).toBe(0);
		expect(result.failed).toMatchObject([
			{ code: "no_change", index: 0 },
			{ code: "no_change", index: 1 },
			{ code: "cannot_delete_last_entry", index: 2 },
		]);
		expect(result.content.cards).toEqual(set.cards);
	});

	it("rejects ambiguous exact-text replacements", async () => {
		const set = createFlashcardSetFromHtml([
			{ front: "<p>Repeat. Repeat.</p>", back: "<p>Answer</p>" },
		]);
		const {
			refs: [ref],
			targets,
		} = await createTargets(set.cards[0]!);
		const result = await applyFlashcardEdits(
			set,
			[
				{
					op: "replace_text",
					ref,
					side: "front",
					find: "Repeat",
					replace: "Stop",
				},
			],
			targets,
		);

		expect(result.failed).toMatchObject([{ code: "edit_not_unique", index: 0 }]);
	});

	it("rejects a ref after the card content changes", async () => {
		const set = createFlashcardSetFromHtml([{ front: "<p>A</p>", back: "<p>1</p>" }]);
		const {
			refs: [staleRef],
			targets,
		} = await createTargets(set.cards[0]!);
		const changed = createFlashcardSetFromHtml([{ front: "<p>Changed</p>", back: "<p>1</p>" }]);
		changed.cards[0]!.id = set.cards[0]!.id;

		const result = await applyFlashcardEdits(
			changed,
			[{ op: "update", ref: staleRef, back: "<p>One</p>" }],
			targets,
		);

		expect(result.failed).toMatchObject([{ code: "ref_stale", index: 0 }]);
	});

	it("requires an explicit destination for moves", () => {
		const ref = "wr_AAAAAAAA";
		expect(flashcardEditSchema.safeParse({ op: "move", ref }).success).toBe(false);
		expect(
			flashcardEditSchema.safeParse({
				op: "move",
				ref,
				beforeRef: "wr_BBBBBBBB",
				afterRef: "wr_CCCCCCCC",
			}).success,
		).toBe(false);
	});
});

async function createTargets(...cards: Flashcard[]) {
	const refs = cards.map((_, index) => `wr_${String(index).padStart(8, "A")}`);
	const targets = new Map(
		await Promise.all(
			cards.map(
				async (card, index) =>
					[
						refs[index]!,
						{ entryId: card.id, revision: await createFlashcardRevision(card) },
					] as const,
			),
		),
	);
	return { refs, targets };
}
