import { beforeEach, describe, expect, it, vi } from "vitest";

const kernel = vi.hoisted(() => ({
	createItem: vi.fn(),
	resolvePaths: vi.fn(),
}));

vi.mock("#/features/workspaces/operations/workspace-operation-context", () => ({
	getAuthorizedWorkspaceKernel: vi.fn(async () => kernel),
}));

import { createWorkspaceItemsOperation } from "#/features/workspaces/operations/create-items";
import { createWorkspaceAccessContext } from "#/features/workspaces/operations/workspace-access-context";

describe("createWorkspaceItemsOperation", () => {
	beforeEach(() => {
		kernel.createItem.mockReset();
		kernel.resolvePaths.mockReset();
		kernel.resolvePaths.mockResolvedValue([{ path: "/", status: "root" }]);
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
		expect(kernel.createItem).not.toHaveBeenCalled();
	});
});
