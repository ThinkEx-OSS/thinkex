import { describe, expect, it } from "vitest";

import type { WorkspacePage } from "#/features/workspaces/contracts";
import { parseWorkspacePagePayload } from "#/features/workspaces/workspace-page-payload";

const validPage: WorkspacePage = {
	workspace: {
		id: "workspace-1",
		name: "Workspace",
		description: null,
		icon: null,
		color: null,
		theme: null,
		createdAt: "2026-01-01T00:00:00.000Z",
		updatedAt: "2026-01-01T00:00:00.000Z",
		lastOpenedAt: null,
		archivedAt: null,
		membershipRole: "owner",
	},
	items: [
		{
			id: "item-1",
			workspaceId: "workspace-1",
			parentId: null,
			type: "document",
			name: "Doc",
			color: null,
			metadataJson: {},
			sortOrder: 1,
			createdAt: "2026-01-01T00:00:00.000Z",
			updatedAt: "2026-01-01T00:00:00.000Z",
		},
	],
	revision: 3,
};

describe("parseWorkspacePagePayload", () => {
	it("returns the page when the payload matches the schema", () => {
		expect(parseWorkspacePagePayload(validPage)).toEqual(validPage);
	});

	it("keeps parsing when a newer deploy adds an unknown field", () => {
		const withExtraField = { ...validPage, itemFacts: [{ id: "fact-1" }] };
		expect(parseWorkspacePagePayload(withExtraField)).toEqual(validPage);
	});

	it("returns null when a field the bundle depends on is missing", () => {
		const { items: _items, ...withoutItems } = validPage;
		expect(parseWorkspacePagePayload(withoutItems)).toBeNull();
	});

	it("returns null when an item drops a required field", () => {
		const { metadataJson: _metadataJson, ...brokenItem } = validPage.items[0];
		const payload = { ...validPage, items: [brokenItem] };
		expect(parseWorkspacePagePayload(payload)).toBeNull();
	});
});
