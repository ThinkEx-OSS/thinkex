import { describe, expect, it } from "vitest";

import type { WorkspaceItem, WorkspacePage } from "#/features/workspaces/contracts";
import { removeWorkspaceItemsFromPage } from "#/features/workspaces/model/workspace-page";

describe("removeWorkspaceItemsFromPage", () => {
	it("removes descendant items when a folder is removed", () => {
		const page = {
			workspace: {} as WorkspacePage["workspace"],
			items: [
				createItem({ id: "folder", type: "folder" }),
				createItem({ id: "child", parentId: "folder" }),
				createItem({ id: "grandchild", parentId: "child" }),
				createItem({ id: "sibling" }),
			],
			revision: 1,
		} satisfies WorkspacePage;

		expect(removeWorkspaceItemsFromPage(page, ["folder"])).toMatchObject({
			items: [{ id: "sibling" }],
		});
	});
});

function createItem(input: Pick<WorkspaceItem, "id"> & Partial<WorkspaceItem>): WorkspaceItem {
	return {
		color: null,
		createdAt: "2026-01-01T00:00:00.000Z",
		id: input.id,
		metadataJson: {},
		name: input.id,
		parentId: input.parentId ?? null,
		sortOrder: 1,
		type: input.type ?? "document",
		updatedAt: "2026-01-01T00:00:00.000Z",
		workspaceId: "workspace-1",
	};
}
