import { describe, expect, it } from "vitest";

import type { WorkspacePage } from "#/features/workspaces/contracts";
import { applyWorkspaceEventToPage } from "#/features/workspaces/model/workspace-page";
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
