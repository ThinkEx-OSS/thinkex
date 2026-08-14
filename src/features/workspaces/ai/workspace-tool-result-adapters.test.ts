import { describe, expect, it } from "vitest";

import { getWorkspaceToolResultAdapter } from "#/features/workspaces/ai/workspace-tool-result-adapters";

describe("workspace tool result adapters", () => {
	it("projects current results onto the model-facing shape", () => {
		const output = {
			failed: [],
			items: [{ itemId: "itm_1", path: "/Notes/A", type: "document" }],
			references: [{ location: { itemId: "itm_1", kind: "item", version: 1 }, ref: "wr_7Kp2Qa9x" }],
		};

		expect(getWorkspaceToolResultAdapter("workspace_create_items")?.projectOutput(output)).toEqual({
			failed: [],
			items: [{ path: "/Notes/A", ref: "wr_7Kp2Qa9x", type: "document" }],
		});
	});

	it("preserves an actionable widget syntax failure for the creating model", () => {
		const output = {
			failed: [
				{
					code: "widget_script_syntax_error",
					detail: "Widget 1 script 1 has invalid JavaScript: Unexpected token (1:14)",
					index: 0,
					path: "/Broken widget",
				},
			],
			items: [],
			references: [],
		};

		expect(getWorkspaceToolResultAdapter("workspace_create_items")?.projectOutput(output)).toEqual({
			failed: output.failed,
			items: [],
		});
	});

	it("projects create failures without exposing internal references", () => {
		const output = {
			failed: [{ code: "path_already_exists", index: 0, path: "/Old" }],
			items: [{ itemId: "itm_internal", path: "/Old", type: "document" }],
			references: [
				{
					location: { itemId: "itm_internal", kind: "item", version: 1 },
					ref: "wr_7Kp2Qa9x",
				},
			],
		};

		expect(getWorkspaceToolResultAdapter("workspace_create_items")?.projectOutput(output)).toEqual({
			failed: output.failed,
			items: [{ path: "/Old", ref: "wr_7Kp2Qa9x", type: "document" }],
		});
	});

	it("keeps edit receipts limited to the model-facing fields", () => {
		const output = {
			applied: 1,
			failed: [],
			itemId: "itm_internal",
			lineChanges: { added: 1, removed: 0 },
			path: "/Widget",
		};

		expect(getWorkspaceToolResultAdapter("workspace_edit_item")?.projectOutput(output)).toEqual({
			applied: 1,
			failed: [],
			path: "/Widget",
		});
	});
});
