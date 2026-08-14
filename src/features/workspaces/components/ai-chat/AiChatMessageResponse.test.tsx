import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { AiChatMessageResponse } from "#/features/workspaces/components/ai-chat/AiChatMessageResponse";
import type { TiptapDocumentJson } from "#/features/workspaces/documents/tiptap-document";
import { flashcardViewerQueryOptions } from "#/features/workspaces/flashcards/flashcard-queries";
import { createEmptyFlashcardStudyState } from "#/features/workspaces/flashcards/flashcard-study-state";
import type {
	WorkspaceLocation,
	WorkspaceReference,
} from "#/features/workspaces/locations/workspace-location";
import { WorkspaceLocationProvider } from "#/features/workspaces/locations/workspace-location-context";
import type { WorkspaceItem } from "#/features/workspaces/contracts";

vi.mock("#/features/workspaces/flashcards/flashcard-functions", () => ({
	getFlashcardViewerFn: vi.fn(),
	recordFlashcardStudyRatingFn: vi.fn(),
	resetFlashcardStudyProgressFn: vi.fn(),
}));

const documentItem: WorkspaceItem = {
	color: null,
	createdAt: "2026-01-01T00:00:00.000Z",
	id: "document-1",
	metadataJson: {},
	name: "Research Notes",
	parentId: null,
	sortOrder: 1,
	type: "document",
	updatedAt: "2026-01-01T00:00:00.000Z",
	workspaceId: "workspace-1",
};

const flashcardItem: WorkspaceItem = {
	...documentItem,
	id: "flashcard-1",
	name: "Biology",
	type: "flashcard",
};

function renderMessage(
	children: string,
	options: {
		isStreaming?: boolean;
		items?: WorkspaceItem[];
		locations?: ReadonlyMap<WorkspaceReference, WorkspaceLocation>;
		queryClient?: QueryClient;
	} = {},
) {
	return renderToStaticMarkup(
		<QueryClientProvider client={options.queryClient ?? new QueryClient()}>
			<WorkspaceLocationProvider
				itemsById={new Map(options.items?.map((item) => [item.id, item]))}
				navigate={() => "tab-1"}
			>
				<AiChatMessageResponse
					isStreaming={options.isStreaming}
					workspaceCitationLocations={options.locations}
				>
					{children}
				</AiChatMessageResponse>
			</WorkspaceLocationProvider>
		</QueryClientProvider>,
	);
}

describe("AI chat message response citations", () => {
	it("renders a validated citation as an app-owned source button", () => {
		const ref = "wr_AAAAAAAA" as WorkspaceReference;
		const html = renderMessage(`Claim <citation ref="${ref}"></citation>`, {
			locations: new Map([
				[ref, { itemId: "missing-pdf", kind: "pdf-page", pageNumber: 12, version: 1 }],
			]),
		});

		expect(html).toContain("<button");
		expect(html).toContain("Open Source unavailable · p. 12");
		expect(html).toContain(">Source unavailable</span>");
		expect(html).toContain(">· p. 12</span>");
		expect(html).not.toContain("<citation");
	});

	it("reuses the workspace item's icon and color", () => {
		const ref = "wr_BBBBBBBB" as WorkspaceReference;
		const html = renderMessage(`Claim <citation ref="${ref}"></citation>`, {
			items: [documentItem],
			locations: new Map([[ref, { itemId: documentItem.id, kind: "item", version: 1 }]]),
		});

		expect(html).toContain("<svg");
		expect(html).toContain("text-sky-600");
		expect(html).toContain("Research Notes");
	});

	it("shows a flashcard's authored position", () => {
		const ref = "wr_CCCCCCCC" as WorkspaceReference;
		const cardId = "f67080f9-0158-4565-86a9-4c90ed6809d2";
		const queryClient = new QueryClient();
		const query = flashcardViewerQueryOptions({
			itemId: flashcardItem.id,
			updatedAt: flashcardItem.updatedAt,
			workspaceId: flashcardItem.workspaceId,
		});
		const side = { content: [{ type: "paragraph" }], type: "doc" } satisfies TiptapDocumentJson;
		queryClient.setQueryData(query.queryKey, {
			cards: [
				{ back: side, front: side, id: "b8f7bfe7-222f-4fea-8615-b9394d1932fe" },
				{ back: side, front: side, id: cardId },
			],
			studyState: createEmptyFlashcardStudyState(),
		});
		const html = renderMessage(`Claim <citation ref="${ref}"></citation>`, {
			items: [flashcardItem],
			locations: new Map([
				[ref, { cardId, itemId: flashcardItem.id, kind: "flashcard", version: 1 }],
			]),
			queryClient,
		});

		expect(html).toContain("Open Biology · Card 2");
		expect(html).toContain(">· Card 2</span>");
	});

	it("does not expose an incomplete streamed citation tag", () => {
		const html = renderMessage('Claim <citation ref="wr_AAAAAAAA', { isStreaming: true });

		expect(html).toContain("Claim");
		expect(html).not.toContain("citation");
		expect(html).not.toContain("wr_AAAAAAAA");
	});

	it("renders non-empty citation markup as inert text", () => {
		const ref = "wr_AAAAAAAA" as WorkspaceReference;
		const html = renderMessage(`Claim <citation ref="${ref}">not a citation</citation>`, {
			locations: new Map([[ref, { itemId: "document-1", kind: "item", version: 1 }]]),
		});

		expect(html).toContain("not a citation");
		expect(html).not.toContain("<button");
	});
});
