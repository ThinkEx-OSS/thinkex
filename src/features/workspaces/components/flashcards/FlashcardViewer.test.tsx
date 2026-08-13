// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { FlashcardViewer } from "#/features/workspaces/components/flashcards/FlashcardViewer";
import type { WorkspaceItem } from "#/features/workspaces/contracts";

const testState = vi.hoisted(() => ({
	studyState: {
		kind: "flashcard" as const,
		cards: {} as Record<
			string,
			{
				lastRating: "again" | "hard" | "good" | "easy";
				lastReviewedAt: string;
				reviewCount: number;
			}
		>,
	},
}));

vi.mock("@tanstack/react-query", () => ({
	useQuery: () => ({
		data: {
			cards: [
				{
					id: "f67080f9-0158-4565-86a9-4c90ed6809d2",
					front: { type: "doc", content: [] },
					back: { type: "doc", content: [] },
				},
			],
			studyState: testState.studyState,
		},
		error: null,
		isPending: false,
	}),
}));

vi.mock("@tiptap/react", () => ({
	EditorContent: () => <div />,
	useEditor: () => null,
}));

vi.mock("#/features/workspaces/components/WorkspaceItemToolbarSlot", () => ({
	useFlashcardItemToolbar: () => undefined,
}));

vi.mock("#/features/workspaces/documents/tiptap-extensions", () => ({
	getTiptapDocumentBaseExtensions: () => [],
}));

vi.mock("#/features/workspaces/flashcards/flashcard-queries", () => ({
	flashcardViewerQueryOptions: () => ({}),
	useRecordFlashcardStudyRating: () => ({
		mutate: ({ cardId, rating }: { cardId: string; rating: "again" | "good" }) => {
			testState.studyState = {
				kind: "flashcard",
				cards: {
					...testState.studyState.cards,
					[cardId]: {
						lastRating: rating,
						lastReviewedAt: "2026-08-13T00:00:00.000Z",
						reviewCount: (testState.studyState.cards[cardId]?.reviewCount ?? 0) + 1,
					},
				},
			};
		},
	}),
	useResetFlashcardStudyProgress: () => ({ isPending: false, mutate: vi.fn() }),
}));

vi.mock("#/features/workspaces/locations/workspace-location-context", () => ({
	useWorkspaceFlashcardSideRevealRequest: () => ({ consume: vi.fn(), request: undefined }),
}));

vi.mock("#/features/workspaces/state/workspace-ui-store", () => ({
	useWorkspaceUiStore: (selector: (state: object) => unknown) =>
		selector({ clearItemViewState: vi.fn(), setItemViewState: vi.fn() }),
}));

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

const item: WorkspaceItem = {
	id: "flashcard-set-1",
	workspaceId: "workspace-1",
	parentId: null,
	type: "flashcard",
	name: "Biology cards",
	color: null,
	metadataJson: {},
	sortOrder: 1,
	createdAt: "2026-08-13T00:00:00.000Z",
	updatedAt: "2026-08-13T00:00:00.000Z",
};

describe("FlashcardViewer", () => {
	let container: HTMLDivElement;
	let root: Root;

	beforeEach(() => {
		testState.studyState = { kind: "flashcard", cards: {} };
		container = document.body.appendChild(document.createElement("div"));
		root = createRoot(container);
	});

	afterEach(async () => {
		await act(async () => root.unmount());
		container.remove();
	});

	it("restores the reviewed count from durable study state after reopening", async () => {
		await act(async () => root.render(<FlashcardViewer item={item} viewInstanceId="view-1" />));
		await act(async () => {
			container
				.querySelector<HTMLButtonElement>('button[aria-label="Got it"]')
				?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
		});

		await act(async () => root.render(null));
		await act(async () => root.render(<FlashcardViewer item={item} viewInstanceId="view-2" />));

		expect(container.textContent).toContain("1 reviewed");
	});
});
