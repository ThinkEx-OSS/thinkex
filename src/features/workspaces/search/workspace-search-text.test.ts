import { describe, expect, it } from "vitest";

import {
	createFlashcardSetFromHtml,
	stringifyFlashcardSetContent,
} from "#/features/workspaces/flashcards/flashcard-content";
import {
	createQuizSetFromInputs,
	stringifyQuizSetContent,
} from "#/features/workspaces/quizzes/quiz-content";
import { buildWorkspaceItemSearchText } from "#/features/workspaces/search/workspace-search-text";

describe("buildWorkspaceItemSearchText", () => {
	it("projects a document to prose without its Tiptap structure", () => {
		const content = JSON.stringify({
			type: "doc",
			content: [
				{ type: "paragraph", content: [{ type: "text", text: "Mitosis has four phases." }] },
			],
		});

		const text = buildWorkspaceItemSearchText("document", content);

		expect(text).toBe("Mitosis has four phases.");
		expect(text).not.toContain("paragraph");
	});

	it("projects both sides of every flashcard", () => {
		const content = stringifyFlashcardSetContent(
			createFlashcardSetFromHtml([
				{ front: "<p>What is prophase?</p>", back: "<p>Chromatin condenses.</p>" },
			]),
		);

		const text = buildWorkspaceItemSearchText("flashcard", content);

		expect(text).toContain("What is prophase?");
		expect(text).toContain("Chromatin condenses.");
	});

	it("projects a quiz question, its options, and its explanation", () => {
		const content = stringifyQuizSetContent(
			createQuizSetFromInputs([
				{
					question: "<p>Which phase splits the chromatids?</p>",
					correctAnswer: "<p>Anaphase</p>",
					distractors: ["<p>Telophase</p>"],
					explanation: "<p>Spindle fibres pull them apart.</p>",
				},
			]),
		);

		const text = buildWorkspaceItemSearchText("quiz", content);

		expect(text).toContain("Which phase splits the chromatids?");
		expect(text).toContain("Anaphase");
		expect(text).toContain("Telophase");
		expect(text).toContain("Spindle fibres pull them apart.");
	});

	// Files keep their prose in workspace_item_pages, so this table holds none.
	it("returns nothing for items without stored content", () => {
		expect(buildWorkspaceItemSearchText("file", "")).toBe("");
		expect(buildWorkspaceItemSearchText("folder", "")).toBe("");
	});
});
