import { describe, expect, it } from "vitest";

import type { WorkspaceTabSession } from "#/features/workspaces/model/tab-types";
import { planWorkspaceRevealTab } from "#/features/workspaces/locations/workspace-location-reveal";

const location = {
	itemId: "target",
	kind: "item",
	version: 1,
} as const;

describe("workspace location reveal tab planning", () => {
	it("reuses the active matching tab", () => {
		expect(
			planWorkspaceRevealTab({
				location,
				session: session("active", [tab("active", "target", 1), tab("other", "target", 10)]),
			}),
		).toEqual({ action: "activate", tabId: "active" });
	});

	it("uses the first matching tab without changing global tab recency", () => {
		expect(
			planWorkspaceRevealTab({
				location,
				session: session("active", [
					tab("active", "other", 20),
					tab("older", "target", 5),
					tab("newer", "target", 10),
				]),
			}),
		).toEqual({ action: "activate", tabId: "older" });
	});

	it("replaces an active root tab before creating another tab", () => {
		expect(
			planWorkspaceRevealTab({
				location,
				session: session("root", [tab("root", undefined, 1)]),
			}),
		).toEqual({ action: "replace", tabId: "root" });
	});

	it("creates an adjacent tab when no reusable tab exists", () => {
		expect(
			planWorkspaceRevealTab({
				location,
				session: session("active", [tab("active", "other", 1)]),
			}),
		).toEqual({ action: "create" });
	});
});

function session(activeTabId: string, tabs: WorkspaceTabSession["tabs"]): WorkspaceTabSession {
	return { activeTabId, tabs };
}

function tab(
	id: string,
	viewItemId: string | undefined,
	updatedAt: number,
): WorkspaceTabSession["tabs"][number] {
	return {
		createdAt: 1,
		id,
		title: id,
		updatedAt,
		...(viewItemId ? { viewItemId } : {}),
	};
}
