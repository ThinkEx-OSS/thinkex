import { describe, expect, it } from "vitest";

import {
	toWorkspaceItemDisplayType,
	WORKSPACE_ITEM_PLACEHOLDER_TYPE,
} from "#/features/workspaces/workspace-item-registry";

describe("toWorkspaceItemDisplayType", () => {
	it("maps a known stored type through unchanged", () => {
		expect(toWorkspaceItemDisplayType("flashcard")).toBe("flashcard");
	});

	it("degrades an unknown stored kind to the read-only placeholder", () => {
		// A leftover 'recording' row from the reverted audio feature must not fail
		// the whole workspace tree read.
		expect(toWorkspaceItemDisplayType("recording")).toBe(WORKSPACE_ITEM_PLACEHOLDER_TYPE);
	});
});
