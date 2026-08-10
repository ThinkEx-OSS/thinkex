import { describe, expect, it } from "vitest";

import { getWorkspaceToolResultAdapter } from "#/features/workspaces/ai/workspace-tool-result-adapters";

describe("workspace tool result adapters", () => {
	it("passes through results that predate the current output schema", () => {
		// Persisted before create results carried references, as replayed history does.
		const legacy = { failed: [], items: [{ path: "/Notes/A", type: "document" }] };

		expect(getWorkspaceToolResultAdapter("workspace_create_items")?.projectOutput(legacy)).toEqual(
			legacy,
		);
	});

	it("projects current results onto the model-facing shape", () => {
		const output = {
			failed: [],
			items: [{ itemId: "itm_1", path: "/Notes/A", type: "document" }],
			references: [{ location: { itemId: "itm_1", kind: "item", version: 1 }, ref: "wr_7Kp2Qa9x" }],
		};

		expect(getWorkspaceToolResultAdapter("workspace_create_items")?.projectOutput(output)).toEqual({
			failed: [],
			items: [{ path: "/Notes/A", reference: "wr_7Kp2Qa9x", type: "document" }],
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
});
