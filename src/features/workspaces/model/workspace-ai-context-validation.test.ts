import { describe, expect, it } from "vitest";

import { isWorkspaceAiContextSnapshot } from "#/features/workspaces/model/workspace-ai-context-validation";
import { formatWorkspaceAiContextForPrompt } from "#/features/workspaces/model/workspace-ai-context-prompt";

const minimalSnapshot = {
	contentIncluded: false,
	openTabs: [],
	selectedItems: [],
	selectedQuotes: [],
	view: { presentation: { mode: "standard" } },
	workspace: { name: "Course" },
};

describe("workspace AI context validation", () => {
	it("validates nested collection entries before narrowing the snapshot", () => {
		expect(isWorkspaceAiContextSnapshot(minimalSnapshot)).toBe(true);
		expect(
			isWorkspaceAiContextSnapshot({
				...minimalSnapshot,
				selectedItems: [{}],
			}),
		).toBe(false);
		expect(
			isWorkspaceAiContextSnapshot({
				...minimalSnapshot,
				view: { activeItem: {}, presentation: { mode: "standard" } },
			}),
		).toBe(false);
	});

	it("includes lightweight live flashcard state without embedding card content", () => {
		const snapshot = {
			...minimalSnapshot,
			selectedItems: [
				{
					availableToAi: true,
					name: "Biology",
					order: 1,
					path: "/Biology",
					selectedForAiContext: true,
					state: {
						activeVisible: true,
						openInTabs: ["Study"],
						viewState: {
							kind: "flashcard",
							cardId: "f67080f9-0158-4565-86a9-4c90ed6809d2",
							cardNumber: 3,
							mode: "all",
							rating: "good",
							reviewedCount: 5,
							shuffled: true,
							side: "back",
							totalCards: 15,
						},
					},
					type: "Flashcards",
				},
			],
		};

		expect(isWorkspaceAiContextSnapshot(snapshot)).toBe(true);
		expect(formatWorkspaceAiContextForPrompt(snapshot)).toContain(
			"card 3 of 15 (cardId f67080f9-0158-4565-86a9-4c90ed6809d2), back shown, 5 reviewed, session: all cards, shuffled, marked yes",
		);
		expect(formatWorkspaceAiContextForPrompt(snapshot)).not.toContain("front");
		expect(
			isWorkspaceAiContextSnapshot({
				...snapshot,
				selectedItems: [
					{
						...snapshot.selectedItems[0],
						state: {
							...snapshot.selectedItems[0]!.state,
							viewState: {
								...snapshot.selectedItems[0]!.state.viewState,
								reviewedCount: 16,
							},
						},
					},
				],
			}),
		).toBe(false);
	});
});
