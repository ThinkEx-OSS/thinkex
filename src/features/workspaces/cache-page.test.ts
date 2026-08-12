import { QueryClient } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";

import { workspacePageQueryKey } from "#/features/workspaces/cache-keys";
import { applyWorkspacePageDeltaToCache } from "#/features/workspaces/cache-page";
import type { WorkspaceItemSummary, WorkspacePage } from "#/features/workspaces/contracts";

describe("workspace page cache ordering", () => {
	it("keeps current cache data and reconciles a revision gap", () => {
		const queryClient = createQueryClient(createPage(3, createItem({ name: "Newer" })));
		const invalidate = vi.spyOn(queryClient, "invalidateQueries").mockResolvedValue();

		applyWorkspacePageDeltaToCache(queryClient, {
			type: "workspace.items.upserted",
			workspaceId: "workspace-1",
			revision: 5,
			items: [createItem({ name: "Older" })],
		});

		expect(readItem(queryClient)).toMatchObject({ name: "Newer" });
		expect(invalidate).toHaveBeenCalledWith({ queryKey: workspacePageQueryKey("workspace-1") });
	});
});

function createQueryClient(page: WorkspacePage) {
	const queryClient = new QueryClient();
	queryClient.setQueryData(workspacePageQueryKey("workspace-1"), page);
	return queryClient;
}

function readItem(queryClient: QueryClient) {
	return queryClient.getQueryData<WorkspacePage>(workspacePageQueryKey("workspace-1"))?.items[0];
}

function createPage(revision: number, item: WorkspaceItemSummary): WorkspacePage {
	return { workspace: {} as WorkspacePage["workspace"], items: [item], revision };
}

function createItem(input: Partial<WorkspaceItemSummary> = {}): WorkspaceItemSummary {
	return {
		color: input.color ?? null,
		createdAt: "2026-01-01T00:00:00.000Z",
		id: "folder-1",
		metadataJson: {},
		name: input.name ?? "Folder",
		parentId: null,
		sortOrder: 1,
		type: "folder",
		updatedAt: "2026-01-01T00:00:00.000Z",
		workspaceId: "workspace-1",
	};
}
