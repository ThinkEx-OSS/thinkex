import { beforeEach, describe, expect, it, vi } from "vitest";

const persistence = vi.hoisted(() => ({ searchWorkspaceContent: vi.fn() }));

vi.mock("#/features/workspaces/operations/workspace-operation-context", () => ({
	authorizeWorkspaceOperation: vi.fn(async () => undefined),
}));

vi.mock("#/features/workspaces/persistence/workspace-search", () => ({
	searchWorkspaceContent: persistence.searchWorkspaceContent,
}));

vi.mock("cloudflare:workers", () => ({ env: {} }));

import { searchWorkspaceItemsOperation } from "#/features/workspaces/operations/search-items";
import { createWorkspaceAccessContext } from "#/features/workspaces/operations/workspace-access-context";
import { workspaceAccessScopes } from "#/features/workspaces/operations/workspace-access-context";

const context = createWorkspaceAccessContext({
	operationId: "op_1",
	scopes: workspaceAccessScopes,
	userId: "user_1",
	workspaceId: "workspace_1",
});

function item(id: string, name: string, type: "document" | "file", refKey: string) {
	return {
		id,
		name,
		type,
		refKey,
		parentId: null,
		workspaceId: "workspace_1",
		color: null,
		metadataJson: {},
		sortOrder: 0,
		createdAt: "2026-01-01T00:00:00.000Z",
		updatedAt: "2026-01-01T00:00:00.000Z",
	};
}

describe("searchWorkspaceItemsOperation", () => {
	beforeEach(() => {
		persistence.searchWorkspaceContent.mockReset();
	});

	it("addresses a file page hit so it can be read back directly", async () => {
		persistence.searchWorkspaceContent.mockResolvedValue({
			contentHits: [{ itemId: "item_1", pageNumber: 12, snippet: "…**mitosis** begins…" }],
			items: [item("item_1", "Lecture 3.pdf", "file", "aB3xK9pQ")],
			pathsByItemId: new Map([["item_1", "/Bio 101/Lecture 3.pdf"]]),
			totalHits: 1,
			unsearchable: [],
		});

		const result = await searchWorkspaceItemsOperation(context, {
			patterns: ["mitosis"],
		});

		expect(result.hits).toEqual([
			{
				match: "content",
				page: 12,
				path: "/Bio 101/Lecture 3.pdf",
				ref: "aB3xK9pQ/p12",
				snippet: "…**mitosis** begins…",
				type: "file",
			},
		]);
		expect(result.matches).toBe(1);
	});

	// A name match on an item that also matched on content is the same hit twice.
	it("lists name matches first and never repeats an item that matched on content", async () => {
		persistence.searchWorkspaceContent.mockResolvedValue({
			contentHits: [{ itemId: "item_1", pageNumber: null, snippet: "…**mitosis** begins…" }],
			items: [
				item("item_1", "Mitosis notes", "document", "aB3xK9pQ"),
				item("item_2", "Mitosis diagram.pdf", "file", "cD4yL0rS"),
			],
			pathsByItemId: new Map([
				["item_1", "/Mitosis notes"],
				["item_2", "/Mitosis diagram.pdf"],
			]),
			totalHits: 1,
			unsearchable: [],
		});

		const result = await searchWorkspaceItemsOperation(context, {
			patterns: ["mitosis"],
		});

		expect(result.hits.map((hit) => [hit.match, hit.ref])).toEqual([
			["name", "cD4yL0rS"],
			["content", "aB3xK9pQ"],
		]);
	});

	it("reports files whose text is not indexed yet, so a miss is not read as an absence", async () => {
		persistence.searchWorkspaceContent.mockResolvedValue({
			contentHits: [],
			items: [item("item_1", "Textbook ch7.pdf", "file", "aB3xK9pQ")],
			pathsByItemId: new Map([["item_1", "/Bio 101/Textbook ch7.pdf"]]),
			totalHits: 0,
			unsearchable: [{ itemId: "item_1", reason: "extracting" as const }],
		});

		const result = await searchWorkspaceItemsOperation(context, {
			patterns: ["mitosis"],
		});

		expect(result.unsearchable).toEqual([
			{ path: "/Bio 101/Textbook ch7.pdf", reason: "extracting" },
		]);
	});
});
