import { describe, expect, it, vi } from "vitest";

import type { WorkspaceItem } from "#/features/workspaces/contracts";
import type { WorkspaceContentReadRequest } from "#/features/workspaces/content/workspace-content-contract";
import {
	createDocumentAiBlockSnapshot,
	ensureTiptapDocumentBlockIds,
	parseDocumentAiHtml,
	readTiptapNodeBlockId,
} from "#/features/workspaces/documents/document-ai-html";
import { readDocumentHtmlChunk } from "#/features/workspaces/documents/document-html-chunk";
import { getTiptapDocumentSchema } from "#/features/workspaces/documents/tiptap-schema";
import type { WorkspacePathResolution } from "#/features/workspaces/persistence/workspace-persistence-types";
import { readWorkspaceContent } from "#/features/workspaces/content/workspace-content-reader";
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
	refKey: "refdoc01",
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
	refKey: "refcard1",
	type: "flashcard",
	name: "Biology cards",
};

const unitRefPattern = /^[A-Za-z0-9_-]+\.r_[A-Za-z0-9_-]{6}$/;

describe("WorkspaceContentReader", () => {
	it("reads a complete flashcard set with revisioned unit refs", async () => {
		const set = createFlashcardSetFromHtml([{ front: "<p>Question</p>", back: "<p>Answer</p>" }]);
		const read = createReader({
			bucket: {} as R2Bucket,
			getDocumentSession: () => createDocumentSession({ html: "<p />" }),
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
						ref: expect.stringMatching(unitRefPattern),
						front: "<p>Question</p>",
						back: "<p>Answer</p>",
						study: { lastRating: "good", reviewCount: 2 },
					},
				],
				format: "html",
				location: { kind: "entries", returned: [1], total: 1 },
				progress: {
					gotItCount: 1,
					missedCount: 0,
					reviewedCount: 1,
					totalCards: 1,
					unreviewedCount: 0,
				},
				ref: "refcard1",
				status: "ready",
				type: "flashcard",
			},
		]);
	});

	it("reads the exact flashcard an address identifies", async () => {
		const set = createFlashcardSetFromHtml([
			{ front: "<p>One</p>", back: "<p>1</p>" },
			{ front: "<p>Two</p>", back: "<p>2</p>" },
		]);
		const read = createReader({
			bucket: {} as R2Bucket,
			getDocumentSession: () => createDocumentSession({ html: "<p />" }),
			item: flashcardItem,
			readFlashcardItem: async () => ({
				cards: set.cards,
				studyState: { kind: "flashcard", cards: {} },
			}),
			resolveRefKey: async (refKey) =>
				refKey === flashcardItem.refKey
					? { item: flashcardItem, path: "/Biology cards" }
					: undefined,
		});

		await expect(
			read([{ mode: "ref", ref: `refcard1/${set.cards[1]!.id}` }]),
		).resolves.toMatchObject([
			{
				cards: [{ front: "<p>Two</p>" }],
				location: { kind: "entries", returned: [2], total: 2 },
				status: "ready",
				type: "flashcard",
			},
		]);
	});

	it("chunks a large flashcard set and continues by entry range", async () => {
		const side = `<p>${"x".repeat(7_900)}</p>`;
		const set = createFlashcardSetFromHtml(
			Array.from({ length: 4 }, () => ({ front: side, back: side })),
		);
		const read = createReader({
			bucket: {} as R2Bucket,
			getDocumentSession: () => createDocumentSession({ html: "<p />" }),
			item: flashcardItem,
			readFlashcardItem: async () => ({
				cards: set.cards,
				studyState: { kind: "flashcard", cards: {} },
			}),
		});

		const [first] = await read([{ mode: "start", path: "/Biology cards" }]);
		expect(first).toMatchObject({
			location: { kind: "entries", returned: [1, 2, 3], total: 4 },
			status: "ready",
			type: "flashcard",
		});

		const [rest] = await read([{ mode: "entries", path: "/Biology cards", range: "4" }]);
		expect(rest).toMatchObject({
			cards: [{ ref: expect.stringMatching(unitRefPattern) }],
			location: { kind: "entries", returned: [4], total: 4 },
			status: "ready",
			type: "flashcard",
		});

		const [targeted] = await read([{ mode: "entries", path: "/Biology cards", range: "1, 4" }]);
		expect(targeted).toMatchObject({
			location: { kind: "entries", returned: [1, 4], total: 4 },
			status: "ready",
			type: "flashcard",
		});
	});

	it("chunks a large document and continues by block range", async () => {
		// Blocks are wide rather than numerous: the chunker breaks on a 48k
		// character budget, so a few hundred fat paragraphs cross it just as well
		// as tens of thousands of thin ones — and parse two orders of magnitude
		// faster. The thin version took longer than the suite's 5s timeout under
		// parallel load.
		const html = Array.from(
			{ length: 200 },
			(_, index) => `<p>line ${index + 1} ${"word ".repeat(200)}</p>`,
		).join("");
		const session = createDocumentSession({ html });
		const read = createReader({
			bucket: {} as R2Bucket,
			getDocumentSession: () => session,
		});

		const [first] = await read([{ mode: "start", path: "/Notes" }]);
		expect(first).toMatchObject({
			format: "html",
			location: { kind: "blocks", startBlock: 1, totalBlocks: 200 },
			path: "/Notes",
			ref: "refdoc01",
			status: "ready",
			type: "document",
		});
		if (
			!first ||
			first.status !== "ready" ||
			first.type !== "document" ||
			first.location.kind !== "blocks"
		) {
			throw new Error("Expected a document chunk.");
		}
		expect(first.location.endBlock).toBeLessThan(200);

		const [second] = await read([
			{
				mode: "entries",
				path: "/Notes",
				range: `${first.location.endBlock + 1}-${first.location.endBlock + 3}`,
			},
		]);
		expect(second).toMatchObject({
			location: {
				kind: "blocks",
				startBlock: first.location.endBlock + 1,
				endBlock: first.location.endBlock + 3,
			},
			status: "ready",
			type: "document",
		});
	});

	it("rejects a scattered block range for documents", async () => {
		const read = createReader({
			bucket: {} as R2Bucket,
			getDocumentSession: () => createDocumentSession({ html: "<p>a</p><p>b</p>" }),
		});

		await expect(read([{ mode: "entries", path: "/Notes", range: "1,3" }])).resolves.toMatchObject([
			{ code: "invalid_selection", path: "/Notes", status: "failed" },
		]);
	});

	it("keeps document HTML split on top-level block boundaries", async () => {
		const html = `<h1>Heading</h1><pre><code>${"x".repeat(64_000)}</code></pre><p>Tail</p>`;
		const read = createReader({
			bucket: {} as R2Bucket,
			getDocumentSession: () => createDocumentSession({ html }),
		});

		const contents: string[] = [];
		let request: WorkspaceContentReadRequest = { mode: "start", path: "/Notes" };
		for (;;) {
			const [result] = await read([request]);
			expect(result).toMatchObject({ status: "ready", type: "document" });
			if (
				!result ||
				result.status !== "ready" ||
				result.type !== "document" ||
				result.location.kind !== "blocks"
			) {
				throw new Error("Expected a document chunk.");
			}
			contents.push(result.content);
			if (result.location.endBlock >= result.location.totalBlocks) {
				break;
			}
			request = {
				mode: "entries",
				path: "/Notes",
				range: `${result.location.endBlock + 1}-${result.location.totalBlocks}`,
			};
		}
		expect(contents).toHaveLength(3);
		expect(contents[0]).toMatch(
			/^<h1 data-ref="b_[A-Za-z0-9_-]{12}\.r_[A-Za-z0-9_-]{6}">Heading<\/h1>$/,
		);
		expect(contents[1]).toContain("<pre data-ref=");
		expect(contents[1]).toContain("</pre>");
		expect(contents[2]).toContain(">Tail</p>");
	});

	it("bounds total content returned by a batch", async () => {
		const read = createReader({
			bucket: {} as R2Bucket,
			getDocumentSession: () => createDocumentSession({ html: `<p>${"😀".repeat(300_000)}</p>` }),
		});
		const requests = Array.from({ length: 3 }, (_, index) => ({
			mode: "start" as const,
			path: `/Notes ${index + 1}`,
		}));

		const results = await read(requests);
		expect(results.filter((result) => result.status === "ready")).toHaveLength(1);
		expect(results.slice(1)).toMatchObject(
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
		});
		const read = createReader({
			bucket: {} as R2Bucket,
			getDocumentSession: () => session,
			resolveRefKey: async (refKey) =>
				refKey === documentItem.refKey ? { item: documentItem, path: "/Notes" } : undefined,
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
		const blockId = contentRef!.split(".")[0]!;

		const [block] = await read([{ mode: "ref", ref: `refdoc01/${blockId}` }]);
		expect(block).toMatchObject({ contentRef, status: "ready", type: "block" });
		if (!block || block.status !== "ready" || block.type !== "block") {
			throw new Error("Expected a block read.");
		}
		expect(block.content).toContain("Interactive");
		expect(block.content).not.toContain("data-ref");
	});

	it("rejects unknown addresses", async () => {
		const read = createReader({
			bucket: {} as R2Bucket,
			getDocumentSession: () => createDocumentSession({ html: "" }),
		});

		await expect(read([{ mode: "ref", ref: "zzZZzzZZ/p5" }])).resolves.toEqual([
			{ code: "ref_not_found", ref: "zzZZzzZZ/p5", status: "failed" },
		]);
	});

	it("rejects a unit that cannot belong to the item's type", async () => {
		const read = createReader({
			bucket: {} as R2Bucket,
			getDocumentSession: () => createDocumentSession({ html: "<p>a</p>" }),
			resolveRefKey: async (refKey) =>
				refKey === documentItem.refKey ? { item: documentItem, path: "/Notes" } : undefined,
		});

		await expect(read([{ mode: "ref", ref: "refdoc01/p5" }])).resolves.toEqual([
			{ code: "ref_not_found", ref: "refdoc01/p5", status: "failed" },
		]);
	});

	it("keeps one ordered result for every requested path", async () => {
		const read = createReader({
			bucket: {} as R2Bucket,
			getDocumentSession: () => createDocumentSession({ html: "" }),
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

function createDocumentSession(input: { html: string }) {
	const document = ensureTiptapDocumentBlockIds(parseDocumentAiHtml(input.html)).document;
	const documentNode = getTiptapDocumentSchema().nodeFromJSON(document);
	return {
		readHtmlChunk: vi.fn(async ({ offset, maxBlocks }: { offset: number; maxBlocks?: number }) => {
			const chunk = await readDocumentHtmlChunk(documentNode, offset, maxBlocks);
			return chunk ? { ...chunk, status: "ready" as const } : { status: "invalid_offset" as const };
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
	readQuizItem?: Parameters<typeof readWorkspaceContent>[0]["readQuizItem"];
	readRecordingItem?: Parameters<typeof readWorkspaceContent>[0]["readRecordingItem"];
	resolveRefKey?: Parameters<typeof readWorkspaceContent>[0]["resolveRefKey"];
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
			readQuizItem:
				input.readQuizItem ??
				(async () => ({ questions: [], studyState: { kind: "quiz", answers: {} } })),
			readRecordingItem: input.readRecordingItem ?? (async () => ({ cues: [] })),
			resolveRefKey: input.resolveRefKey ?? (async () => undefined),
			requests,
			workspaceId: "workspace-1",
		});
}
