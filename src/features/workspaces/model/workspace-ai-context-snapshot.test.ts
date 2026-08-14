import { describe, expect, it } from "vitest";

import type { WorkspaceItem } from "#/features/workspaces/contracts";
import { buildWorkspaceAiContextSnapshot } from "#/features/workspaces/model/workspace-ai-context-snapshot";

const item: WorkspaceItem = {
	color: null,
	createdAt: "2026-08-13T00:00:00.000Z",
	id: "cards-1",
	metadataJson: {},
	name: "Biology",
	parentId: null,
	sortOrder: 1,
	type: "flashcard",
	updatedAt: "2026-08-13T00:00:00.000Z",
	workspaceId: "workspace-1",
};

describe("workspace AI context snapshot", () => {
	it("keeps live state with the tab that produced it", () => {
		const tabs = [
			{ createdAt: 1, id: "tab-a", title: "First", updatedAt: 1, viewItemId: item.id },
			{ createdAt: 2, id: "tab-b", title: "Second", updatedAt: 2, viewItemId: item.id },
		];
		const snapshot = buildWorkspaceAiContextSnapshot({
			activeItem: item,
			activeTabId: "tab-a",
			itemViewStatesByViewInstanceId: {
				"tab-a": { itemId: item.id, label: "card 1" },
				"tab-b": { itemId: item.id, label: "card 9" },
			},
			itemsById: new Map([[item.id, item]]),
			presentation: { mode: "standard" },
			selectedItemIds: [],
			selectedQuotes: [],
			tabs,
			workspaceId: item.workspaceId,
			workspaceName: "Course",
		});

		expect(snapshot.view.activeItem?.state.viewState?.label).toBe("card 1");
		expect(snapshot.openTabs.map((tab) => tab.view)).toMatchObject([
			{ item: { state: { viewState: { label: "card 1" } } } },
			{ item: { state: { viewState: { label: "card 9" } } } },
		]);
	});
});
