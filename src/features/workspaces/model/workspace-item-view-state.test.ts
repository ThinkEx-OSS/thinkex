import { describe, expect, it } from "vitest";

import {
	getWorkspaceAiContextItemViewState,
	normalizeWorkspaceItemViewState,
} from "#/features/workspaces/model/workspace-item-view-state";

describe("workspace item view state", () => {
	it("keeps feature-owned labels and details bounded", () => {
		const state = normalizeWorkspaceItemViewState({
			detail: `  ${"detail".repeat(300)}  `,
			itemId: "item-1",
			label: `  ${"label".repeat(30)}  `,
		});

		expect(state.label).toHaveLength(80);
		expect(state.detail).toHaveLength(1_000);
		expect(getWorkspaceAiContextItemViewState({ itemId: "item-1", viewState: state })).toEqual({
			detail: state.detail,
			label: state.label,
		});
		expect(
			getWorkspaceAiContextItemViewState({ itemId: "other", viewState: state }),
		).toBeUndefined();
	});
});
