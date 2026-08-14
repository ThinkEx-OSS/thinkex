import { beforeEach, describe, expect, it, vi } from "vitest";

const persistence = vi.hoisted(() => ({
	createWorkspaceItem: vi.fn(),
	resolveWorkspacePaths: vi.fn(),
}));

vi.mock("#/features/workspaces/operations/workspace-operation-context", () => ({
	authorizeWorkspaceOperation: vi.fn(async () => undefined),
}));

vi.mock("#/features/workspaces/persistence/workspace-items", () => ({
	createWorkspaceItem: persistence.createWorkspaceItem,
	resolveWorkspacePaths: persistence.resolveWorkspacePaths,
}));

vi.mock("cloudflare:workers", () => ({ env: {} }));

import { createWorkspaceItemsOperation } from "#/features/workspaces/operations/create-items";
import { createWorkspaceAccessContext } from "#/features/workspaces/operations/workspace-access-context";
import { parseFlashcardSetContent } from "#/features/workspaces/flashcards/flashcard-content";

describe("createWorkspaceItemsOperation", () => {
	beforeEach(() => {
		persistence.createWorkspaceItem.mockReset();
		persistence.resolveWorkspacePaths.mockReset();
		persistence.resolveWorkspacePaths.mockResolvedValue([{ path: "/", status: "root" }]);
	});

	it("returns widget syntax errors to the original create call without persisting", async () => {
		const source = '<button id="run">Run</button><script>const ready = ;</script>';
		const result = await createWorkspaceItemsOperation(
			createWorkspaceAccessContext({
				operationId: "create-call",
				scopes: ["workspace:write"],
				userId: "user-1",
				workspaceId: "workspace-1",
			}),
			{
				items: [
					{
						initialContent: `<div data-type="widget">${source.replaceAll("<", "&lt;")}</div>`,
						path: "/Broken widget",
						type: "document",
					},
				],
			},
		);

		expect(result).toMatchObject({
			failed: [
				{
					code: "widget_script_syntax_error",
					detail: expect.stringContaining("Unexpected token"),
					index: 0,
					path: "/Broken widget",
				},
			],
			items: [],
		});
		expect(persistence.createWorkspaceItem).not.toHaveBeenCalled();
	});

	it("creates flashcards as structured content", async () => {
		persistence.createWorkspaceItem.mockResolvedValue({
			status: "applied",
			command: { result: { name: "Cell biology" }, revision: 1 },
		});

		const result = await createWorkspaceItemsOperation(
			createWorkspaceAccessContext({
				operationId: "create-flashcards",
				scopes: ["workspace:write"],
				userId: "user-1",
				workspaceId: "workspace-1",
			}),
			{
				items: [
					{
						cards: [{ front: "<p>What is ATP?</p>", back: "<p>Cellular energy.</p>" }],
						path: "/Cell biology",
						type: "flashcard",
					},
				],
			},
		);

		const createInput = persistence.createWorkspaceItem.mock.calls[0]?.[1];
		expect(result).toMatchObject({
			failed: [],
			items: [{ path: "/Cell biology", type: "flashcard" }],
		});
		expect(createInput).toMatchObject({ type: "flashcard" });
		expect(parseFlashcardSetContent(createInput?.initialContent).cards[0]).toMatchObject({
			front: { type: "doc" },
			back: { type: "doc" },
		});
	});
});
