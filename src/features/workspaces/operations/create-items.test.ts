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

import { createWorkspaceItemsOperation } from "#/features/workspaces/operations/create-items";
import { createWorkspaceAccessContext } from "#/features/workspaces/operations/workspace-access-context";

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
});
