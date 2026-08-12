import { describe, expect, it } from "vitest";

import { isWorkspaceAiContextSnapshot } from "#/features/workspaces/model/workspace-ai-context-validation";

const minimalSnapshot = {
	contentIncluded: false,
	openTabs: [],
	selectedItems: [],
	selectedQuotes: [],
	view: { presentation: { mode: "standard" } },
	workspace: { name: "Course" },
};

describe("workspace AI context validation", () => {
	it("validates nested collection entries before narrowing the snapshot", () => {
		expect(isWorkspaceAiContextSnapshot(minimalSnapshot)).toBe(true);
		expect(
			isWorkspaceAiContextSnapshot({
				...minimalSnapshot,
				selectedItems: [{}],
			}),
		).toBe(false);
		expect(
			isWorkspaceAiContextSnapshot({
				...minimalSnapshot,
				view: { activeItem: {}, presentation: { mode: "standard" } },
			}),
		).toBe(false);
	});
});
