import { describe, expect, it } from "vitest";

import type { WorkspaceItemSummary, WorkspacePage } from "#/features/workspaces/contracts";
import {
	applyWorkspaceEventToPage,
	removeWorkspaceItemsFromPage,
} from "#/features/workspaces/model/workspace-page";
import type { WorkspaceRealtimeEvent } from "#/features/workspaces/realtime/messages";

describe("applyWorkspaceEventToPage", () => {
	it.each(["workspace.relations.updated", "workspace.item.projection.updated"] as const)(
		"applies %s facts and revision",
		(type) => {
			const page = {
				workspace: {} as WorkspacePage["workspace"],
				items: [],
				itemFacts: [{ itemId: "item-1", relationshipCount: 0 }],
				revision: 4,
			} satisfies WorkspacePage;
			const event = {
				id: "event-1",
				revision: 5,
				workspaceId: "workspace-1",
				createdAt: "2026-01-01T00:00:00.000Z",
				actorUserId: null,
				clientMutationId: null,
				origin: "system",
				groupId: null,
				threadId: null,
				type,
				payload: {
					itemFacts: [{ itemId: "item-1", pageCount: 12, relationshipCount: 2 }],
				},
			} satisfies WorkspaceRealtimeEvent;

			expect(applyWorkspaceEventToPage(page, event)).toMatchObject({
				itemFacts: [{ itemId: "item-1", pageCount: 12, relationshipCount: 2 }],
				revision: 5,
			});
		},
	);
});

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
			itemFacts: [
				{ itemId: "folder", relationshipCount: 0 },
				{ itemId: "child", relationshipCount: 0 },
				{ itemId: "grandchild", relationshipCount: 0 },
				{ itemId: "sibling", relationshipCount: 0 },
			],
			revision: 1,
		} satisfies WorkspacePage;

		expect(removeWorkspaceItemsFromPage(page, ["folder"])).toMatchObject({
			items: [{ id: "sibling" }],
			itemFacts: [{ itemId: "sibling" }],
		});
	});
});

function createItem(
	input: Pick<WorkspaceItemSummary, "id"> & Partial<WorkspaceItemSummary>,
): WorkspaceItemSummary {
	return {
		color: null,
		createdAt: "2026-01-01T00:00:00.000Z",
		deletedAt: null,
		id: input.id,
		meta: "",
		metadataJson: {},
		name: input.id,
		parentId: input.parentId ?? null,
		sortOrder: 1,
		title: input.id,
		type: input.type ?? "document",
		updatedAt: "2026-01-01T00:00:00.000Z",
		workspaceId: "workspace-1",
	};
}
