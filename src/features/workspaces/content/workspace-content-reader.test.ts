import { describe, expect, it, vi } from "vitest";

import type { WorkspaceItem } from "#/features/workspaces/contracts";
import type { WorkspaceContentReadRequest } from "#/features/workspaces/content/workspace-content-contract";
import {
	createDocumentAiBlockSnapshot,
	ensureTiptapDocumentBlockIds,
	parseDocumentAiHtml,
	parseDocumentAiRef,
	readTiptapNodeBlockId,
} from "#/features/workspaces/documents/document-ai-html";
import { readDocumentHtmlChunk } from "#/features/workspaces/documents/document-html-chunk";
import { getTiptapDocumentSchema } from "#/features/workspaces/documents/tiptap-schema";
import type { WorkspacePathResolution } from "#/features/workspaces/persistence/workspace-persistence-types";
import { readWorkspaceContent } from "#/features/workspaces/content/workspace-content-reader";
import { encodeWorkspaceContentCursor } from "#/features/workspaces/content/workspace-content-cursor";
import { createFlashcardSetFromHtml } from "#/features/workspaces/flashcards/flashcard-content";
import type { FlashcardStudyState } from "#/features/workspaces/flashcards/flashcard-study-state";

const persistence = vi.hoisted(() => ({
	getWorkspaceItemPaths: vi.fn(),
	listWorkspaceItemRelations: vi.fn(),
	resolveWorkspacePaths: vi.fn(),
}));

vi.mock("#/features/workspaces/persistence/workspace-items", () => persistence);
vi.mock("#/features/workspaces/persistence/workspace-files", () => ({
	readWorkspaceFileExtraction: vi.fn(async () => null),
	readWorkspaceFilePages: vi.fn(async () => []),
}));

const documentItem: WorkspaceItem = {
	id: "document-1",
	workspaceId: "workspace-1",
	parentId: null,
	type: "document",
	name: "Notes",
	color: null,
	metadataJson: {},
	sortOrder: 1,
	createdAt: "2026-01-01T00:00:00.000Z",
	updatedAt: "2026-01-01T00:00:00.000Z",
};

const flashcardItem: WorkspaceItem = {
	...documentItem,
	id: "flashcard-1",
	type: "flashcard",
	name: "Biology cards",
};

describe("WorkspaceContentReader", () => {
	it("reads a complete flashcard set with revision metadata", async () => {
		const set = createFlashcardSetFromHtml([{ front: "<p>Question</p>", back: "<p>Answer</p>" }]);
		const read = createReader({
			bucket: {} as R2Bucket,
			getDocumentSession: () => createDocumentSession({ html: "<p />", revision: "unused" }),
			item: flashcardItem,
			readFlashcardItem: async () => ({
				cards: set.cards,
				studyState: {
					kind: "flashcard",
					cards: {
						[set.cards[0]!.id]: {
							lastRating: "good",
							lastReviewedAt: "2026-01-02T00:00:00.000Z",
							reviewCount: 2,
						},
					},
				},
			}),
		});

		await expect(read([{ mode: "start", path: "/Biology cards" }])).resolves.toMatchObject([
			{
				cards: [
					{
						cardId: set.cards[0]!.id,
						revision: expect.stringMatching(/^[A-Za-z0-9_-]{10}$/),
						front: "<p>Question</p>",
						back: "<p>Answer</p>",
						study: { lastRating: "good", reviewCount: 2 },
					},
				],
				format: "html",
				location: { kind: "cards", returned: [1], total: 1 },
				progress: {
					gotItCount: 1,
					missedCount: 0,
					reviewedCount: 1,
					totalCards: 1,
					unreviewedCount: 0,
				},
				status: "ready",
				type: "flashcard",
			},
		]);
	});

	it("reads the current flashcard addressed by a ref", async () => {
		const set = createFlashcardSetFromHtml([
			{ front: "<p>One</p>", back: "<p>1</p>" },
			{ front: "<p>Two</p>", back: "<p>2</p>" },
		]);
		const read = createReader({
			bucket: {} as R2Bucket,
			getDocumentSession: () => createDocumentSession({ html: "<p />", revision: "unused" }),
			item: flashcardItem,
			readFlashcardItem: async () => ({
				cards: set.cards,
				studyState: { kind: "flashcard", cards: {} },
			}),
			resolveReference: (_itemId, ref) =>
				ref === "wr_AAAAAAAA"
					? {
							cardId: set.cards[1]!.id,
							itemId: flashcardItem.id,
							kind: "flashcard",
							version: 1,
						}
					: undefined,
		});

		await expect(
			read([{ mode: "ref", path: "/Biology cards", ref: "wr_AAAAAAAA" }]),
		).resolves.toMatchObject([
			{
				cards: [{ cardId: set.cards[1]!.id, front: "<p>Two</p>" }],
				location: { kind: "cards", returned: [2], total: 2 },
				status: "ready",
				type: "flashcard",
			},
		]);
	});

	it("continues a large flashcard set without repeating cards", async () => {
		const side = `<p>${"x".repeat(7_900)}</p>`;
		const set = createFlashcardSetFromHtml(
			Array.from({ length: 4 }, () => ({ front: side, back: side })),
		);
		let cards = set.cards;
		const read = createReader({
			bucket: {} as R2Bucket,
			getDocumentSession: () => createDocumentSession({ html: "<p />", revision: "unused" }),
			item: flashcardItem,
			readFlashcardItem: async () => ({
				cards,
				studyState: { kind: "flashcard", cards: {} },
			}),
		});

		const [first] = await read([{ mode: "start", path: "/Biology cards" }]);
		expect(first).toMatchObject({
			cards: expect.any(Array),
			location: { kind: "cards", returned: [1, 2, 3], total: 4 },
			status: "ready",
			type: "flashcard",
		});
		if (!first || first.status !== "ready" || first.type !== "flashcard" || !first.nextCursor) {
			throw new Error("Expected the first flashcard chunk to have a continuation cursor.");
		}
		expect(first.cards).toHaveLength(3);

		cards = [...set.cards].reverse();
		await expect(
			read([{ cursor: first.nextCursor, mode: "continue", path: "/Biology cards" }]),
		).resolves.toEqual([{ code: "content_changed", path: "/Biology cards", status: "failed" }]);
		cards = set.cards;

		const [second] = await read([
			{ cursor: first.nextCursor, mode: "continue", path: "/Biology cards" },
		]);
		expect(second).toMatchObject({
			cards: [{ cardId: set.cards[3]!.id, revision: expect.stringMatching(/^[A-Za-z0-9_-]{10}$/) }],
			location: { kind: "cards", returned: [4], total: 4 },
			status: "ready",
			type: "flashcard",
		});

		const [targeted] = await read([{ mode: "cards", path: "/Biology cards", range: "1, 4" }]);
		expect(targeted).toMatchObject({
			cards: [{ cardId: set.cards[0]!.id }, { cardId: set.cards[3]!.id }],
			location: { kind: "cards", returned: [1, 4], total: 4 },
			status: "ready",
			type: "flashcard",
		});
	});

	it("continues a large live document with a revision-guarded cursor", async () => {
		const html = Array.from({ length: 20_000 }, (_, index) => `<p>line ${index + 1}</p>`).join("");
		const session = createDocumentSession({ html, revision: "revision-1" });
		const read = createReader({
			bucket: {} as R2Bucket,
			getDocumentSession: () => session,
		});

		const [first] = await read([{ mode: "start", path: "/Notes" }]);
		expect(first).toMatchObject({
			format: "html",
			location: { kind: "blocks", startBlock: 1, totalBlocks: 20_000 },
			path: "/Notes",
			status: "ready",
			type: "document",
		});
		if (
			!first ||
			first.status !== "ready" ||
			first.type !== "document" ||
			first.location.kind !== "blocks" ||
			!first.nextCursor
		) {
			throw new Error("Expected the first document chunk to have a continuation cursor.");
		}

		const [second] = await read([{ cursor: first.nextCursor, mode: "continue", path: "/Notes" }]);
		expect(second).toMatchObject({
			location: { kind: "blocks" },
			path: "/Notes",
			status: "ready",
			type: "document",
		});
		if (
			!second ||
			second.status !== "ready" ||
			second.type !== "document" ||
			second.location.kind !== "blocks"
		) {
			throw new Error("Expected a continued document chunk.");
		}
		expect(second.location.startBlock).toBeGreaterThan(first.location.startBlock);
	});

	it("rejects continuation when the live document revision changed", async () => {
		const session = createDocumentSession({
			html: "<p>a</p>".repeat(40_000),
			revision: "revision-1",
		});
		const read = createReader({
			bucket: {} as R2Bucket,
			getDocumentSession: () => session,
		});
		const [first] = await read([{ mode: "start", path: "/Notes" }]);
		if (!first || first.status !== "ready" || first.type !== "document" || !first.nextCursor) {
			throw new Error("Expected a continuation cursor.");
		}

		session.readHtmlChunk = vi.fn(async () => ({ status: "content_changed" }));
		await expect(
			read([{ cursor: first.nextCursor, mode: "continue", path: "/Notes" }]),
		).resolves.toEqual([{ code: "content_changed", path: "/Notes", status: "failed" }]);
	}, 10_000);

	it("keeps document HTML split on top-level block boundaries", async () => {
		const html = `<h1>Heading</h1><pre><code>${"x".repeat(64_000)}</code></pre><p>Tail</p>`;
		const read = createReader({
			bucket: {} as R2Bucket,
			getDocumentSession: () => createDocumentSession({ html, revision: "revision-1" }),
		});

		const contents: string[] = [];
		let request: WorkspaceContentReadRequest = { mode: "start", path: "/Notes" };
		for (;;) {
			const [result] = await read([request]);
			expect(result).toMatchObject({ status: "ready", type: "document" });
			if (!result || result.status !== "ready" || result.type !== "document") {
				throw new Error("Expected a document chunk.");
			}
			contents.push(result.content);
			if (!result.nextCursor) {
				break;
			}
			request = { cursor: result.nextCursor, mode: "continue", path: "/Notes" };
		}
		expect(contents).toHaveLength(3);
		expect(contents[0]).toMatch(
			/^<h1 data-ref="b_[A-Za-z0-9_-]{12}\.r_[A-Za-z0-9_-]{10}">Heading<\/h1>$/,
		);
		expect(contents[1]).toContain("<pre data-ref=");
		expect(contents[1]).toContain("</pre>");
		expect(contents[2]).toContain(">Tail</p>");
	});

	it("rejects a nonzero continuation offset for an empty document", async () => {
		const read = createReader({
			bucket: {} as R2Bucket,
			getDocumentSession: () => createDocumentSession({ html: "", revision: "revision-1" }),
		});
		const cursor = encodeWorkspaceContentCursor({
			kind: "document",
			offset: 1,
			path: "/Notes",
			revision: "revision-1",
			version: 3,
		});

		await expect(read([{ cursor, mode: "continue", path: "/Notes" }])).resolves.toEqual([
			{ code: "invalid_cursor", path: "/Notes", status: "failed" },
		]);
	});

	it("rejects a continuation cursor issued for another path", async () => {
		const read = createReader({
			bucket: {} as R2Bucket,
			getDocumentSession: () => createDocumentSession({ html: "", revision: "revision-1" }),
		});
		const cursor = encodeWorkspaceContentCursor({
			kind: "document",
			offset: 0,
			path: "/Other",
			revision: "revision-1",
			version: 3,
		});

		await expect(read([{ cursor, mode: "continue", path: "/Notes" }])).resolves.toEqual([
			{ code: "invalid_cursor", path: "/Notes", status: "failed" },
		]);
	});

	it("bounds total content returned by a batch", async () => {
		const read = createReader({
			bucket: {} as R2Bucket,
			getDocumentSession: () =>
				createDocumentSession({
					html: `<p>${"😀".repeat(300_000)}</p>`,
					revision: "revision-1",
				}),
		});
		const requests = Array.from({ length: 20 }, (_, index) => ({
			mode: "start" as const,
			path: `/Notes ${index + 1}`,
		}));

		const results = await read(requests);
		expect(results.filter((result) => result.status === "ready")).toHaveLength(1);
		expect(results.slice(1)).toEqual(
			requests.slice(1).map((request) => ({
				code: "read_budget_exceeded",
				path: request.path,
				status: "failed",
			})),
		);
	});

	it("returns one block in full, including a widget's elided source", async () => {
		const source = "<div>Interactive</div>";
		// One session across both reads: a fresh one would mint new refs.
		const session = createDocumentSession({
			html: `<p>Before</p><div data-type="widget" title="Sine">${source.replaceAll("<", "&lt;")}</div>`,
			revision: "revision-1",
		});
		const read = createReader({
			bucket: {} as R2Bucket,
			getDocumentSession: () => session,
		});

		const [chunk] = await read([{ mode: "start", path: "/Notes" }]);
		if (!chunk || chunk.status !== "ready" || chunk.type !== "document") {
			throw new Error("Expected a document chunk.");
		}
		// The chunk carries the placeholder, not the source.
		expect(chunk.content).not.toContain("Interactive");
		const widgetTag = /<div[^>]*data-type="widget"[^>]*>/.exec(chunk.content)?.[0] ?? "";
		const contentRef = /data-ref="([^"]+)"/.exec(widgetTag)?.[1];
		expect(contentRef).toBeTruthy();

		const readBlock = createReader({
			bucket: {} as R2Bucket,
			getDocumentSession: () => session,
			resolveReference: (_itemId, ref) =>
				ref === "wr_AAAAAAAA"
					? {
							blockId: parseDocumentAiRef(contentRef!)!,
							itemId: documentItem.id,
							kind: "document-block",
							version: 1,
						}
					: undefined,
		});
		const [block] = await readBlock([{ ref: "wr_AAAAAAAA", mode: "ref", path: "/Notes" }]);
		expect(block).toMatchObject({ contentRef, status: "ready", type: "block" });
		if (!block || block.status !== "ready" || block.type !== "block") {
			throw new Error("Expected a block read.");
		}
		expect(block.content).toContain("Interactive");
		expect(block.content).not.toContain("data-ref");
	});

	it("rejects unknown exact refs", async () => {
		const fileItem = {
			...documentItem,
			id: "file-1",
			name: "Book.pdf",
			type: "file",
		} satisfies WorkspaceItem;
		const read = createReader({
			bucket: {} as R2Bucket,
			getDocumentSession: () => createDocumentSession({ html: "", revision: "revision-1" }),
			item: fileItem,
		});

		await expect(
			read([
				{
					ref: "wr_AAAAAAAA",
					mode: "ref",
					path: "/Book.pdf",
				},
			]),
		).resolves.toEqual([{ code: "ref_not_found", path: "/Book.pdf", status: "failed" }]);
	});

	it("keeps one ordered result for every requested path", async () => {
		const read = createReader({
			bucket: {} as R2Bucket,
			getDocumentSession: () => createDocumentSession({ html: "", revision: "revision-1" }),
			resolvePaths: vi.fn(
				async () =>
					[
						{ code: "path_not_absolute", path: "Notes", status: "invalid_path" },
						{ path: "/Missing", status: "not_found" },
						{ path: "/", status: "root" },
					] satisfies WorkspacePathResolution[],
			),
		});

		await expect(
			read([
				{ mode: "start", path: "Notes" },
				{ mode: "start", path: "/Missing" },
				{ mode: "start", path: "/" },
			]),
		).resolves.toEqual([
			{ code: "path_not_absolute", path: "Notes", status: "failed" },
			{ code: "path_not_found", path: "/Missing", status: "failed" },
			{ code: "path_is_folder", path: "/", status: "failed" },
		]);
	});
});

function createDocumentSession(input: { html: string; revision: string }) {
	const document = ensureTiptapDocumentBlockIds(parseDocumentAiHtml(input.html)).document;
	const documentNode = getTiptapDocumentSchema().nodeFromJSON(document);
	return {
		readHtmlChunk: vi.fn(async ({ expectedRevision, offset }) => {
			if (expectedRevision && expectedRevision !== input.revision) {
				return { status: "content_changed" as const };
			}
			const chunk = await readDocumentHtmlChunk(documentNode, offset);
			return chunk
				? { ...chunk, revision: input.revision, status: "ready" as const }
				: { status: "invalid_offset" as const };
		}),
		readBlock: vi.fn(async ({ blockId }: { blockId: string }) => {
			let found: ReturnType<typeof documentNode.child> | null = null;
			documentNode.forEach((node) => {
				if (!found && readTiptapNodeBlockId(node) === blockId) {
					found = node;
				}
			});
			return found
				? {
						...(await createDocumentAiBlockSnapshot(found)),
						status: "ready" as const,
					}
				: { status: "ref_not_found" as const };
		}),
	};
}

function createReader(input: {
	bucket: R2Bucket;
	getDocumentSession: (itemId: string) => ReturnType<typeof createDocumentSession>;
	item?: WorkspaceItem;
	readFlashcardItem?: () =>
		| {
				cards: ReturnType<typeof createFlashcardSetFromHtml>["cards"];
				studyState: FlashcardStudyState;
		  }
		| Promise<{
				cards: ReturnType<typeof createFlashcardSetFromHtml>["cards"];
				studyState: FlashcardStudyState;
		  }>;
	resolveReference?: Parameters<typeof readWorkspaceContent>[0]["resolveReference"];
	resolvePaths?: typeof persistence.resolveWorkspacePaths;
}) {
	const item = input.item ?? documentItem;
	persistence.resolveWorkspacePaths.mockImplementation(
		input.resolvePaths ??
			(async ({ paths }: { paths: string[] }) =>
				paths.map((path) => ({ item, path, status: "item" as const }))),
	);
	persistence.listWorkspaceItemRelations.mockResolvedValue([]);
	persistence.getWorkspaceItemPaths.mockResolvedValue([{ itemId: item.id, path: "/Notes" }]);

	return (requests: WorkspaceContentReadRequest[]) =>
		readWorkspaceContent({
			bucket: input.bucket,
			getDocumentSession: input.getDocumentSession,
			readFlashcardItem:
				input.readFlashcardItem ??
				(async () => ({ cards: [], studyState: { kind: "flashcard", cards: {} } })),
			resolveReference: input.resolveReference,
			requests,
			workspaceId: "workspace-1",
		});
}
