import { describe, expect, it } from "vitest";

import { activateWorkspaceTabSession } from "#/features/workspaces/model/tab-state";

describe("workspace tab activation", () => {
	it("records recency on the activated tab", () => {
		const session = {
			activeTabId: "first",
			tabs: [
				{ createdAt: 1, id: "first", title: "First", updatedAt: 10 },
				{ createdAt: 2, id: "second", title: "Second", updatedAt: 20 },
			],
		};

		expect(activateWorkspaceTabSession(session, "second", 30)).toEqual({
			activeTabId: "second",
			tabs: [
				{ createdAt: 1, id: "first", title: "First", updatedAt: 10 },
				{ createdAt: 2, id: "second", title: "Second", updatedAt: 30 },
			],
		});
	});

	it("does not alter a session for a missing tab", () => {
		const session = {
			activeTabId: "first",
			tabs: [{ createdAt: 1, id: "first", title: "First", updatedAt: 10 }],
		};

		expect(activateWorkspaceTabSession(session, "missing", 30)).toBe(session);
	});
});
