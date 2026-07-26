import { describe, expect, it } from "vitest";

import type { WorkspaceTabSession } from "#/features/workspaces/model/tab-types";
import {
	planWorkspaceRevealTab,
	type WorkspaceRevealRequest,
} from "#/features/workspaces/locations/workspace-location-reveal";

const location = {
	itemId: "target",
	kind: "item",
	version: 1,
} as const;

describe("workspace location reveal tab planning", () => {
	it("reuses the active matching tab", () => {
		expect(
			planWorkspaceRevealTab({
				request: request(),
				session: session("active", [tab("active", "target", 1), tab("other", "target", 10)]),
			}),
		).toEqual({ action: "activate", tabId: "active" });
	});

	it("uses the most recently active matching tab", () => {
		expect(
			planWorkspaceRevealTab({
				request: request(),
				session: session("active", [
					tab("active", "other", 20),
					tab("older", "target", 5),
					tab("newer", "target", 10),
				]),
			}),
		).toEqual({ action: "activate", tabId: "newer" });
	});

	it("replaces an active root tab before creating another tab", () => {
		expect(
			planWorkspaceRevealTab({
				request: request(),
				session: session("root", [tab("root", undefined, 1)]),
			}),
		).toEqual({ action: "replace", tabId: "root" });
	});

	it("creates an adjacent tab when no reusable tab exists", () => {
		expect(
			planWorkspaceRevealTab({
				request: request(),
				session: session("active", [tab("active", "other", 1)]),
			}),
		).toEqual({ action: "create" });
	});
});

function request(): WorkspaceRevealRequest {
	return { location };
}

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
