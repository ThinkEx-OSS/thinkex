import { describe, expect, it } from "vitest";
import { z } from "zod";

import { getAIThreadSoulPrompt } from "#/features/workspaces/ai/ai-thread-soul-prompt";
import {
	workspaceCreateItemsInputSchema,
	workspaceDeleteItemsInputSchema,
	workspaceEditItemInputSchema,
	workspaceLinkItemsInputSchema,
	workspaceListItemsInputSchema,
	workspaceMoveItemsInputSchema,
	workspaceReadItemsInputSchema,
	workspaceRenameItemInputSchema,
} from "#/features/workspaces/operations/workspace-tool-schemas";

// Free, deterministic regression net for the model-facing surface: the assembled
// system prompt and each tool's input JSON schema (field `.describe()` text
// included). A change to a schema shape, a field description, or the soul prompt
// shows up here as a reviewable diff — zero model calls, runs in normal CI.
//
// Update intentionally with `pnpm test -u` when the change is deliberate; an
// unexpected diff is a regression to look at. Whether the model actually *uses*
// the surface correctly is the live evals' job: `pnpm eval`.

const TOOL_INPUT_SCHEMAS = {
	workspace_list_items: workspaceListItemsInputSchema,
	workspace_read_items: workspaceReadItemsInputSchema,
	workspace_create_items: workspaceCreateItemsInputSchema,
	workspace_edit_item: workspaceEditItemInputSchema,
	workspace_delete_items: workspaceDeleteItemsInputSchema,
	workspace_move_items: workspaceMoveItemsInputSchema,
	workspace_rename_item: workspaceRenameItemInputSchema,
	workspace_link_items: workspaceLinkItemsInputSchema,
} as const;

describe("workspace tool surface", () => {
	it("system prompt is stable", () => {
		expect(getAIThreadSoulPrompt()).toMatchSnapshot();
	});

	for (const [name, schema] of Object.entries(TOOL_INPUT_SCHEMAS)) {
		it(`${name} input schema is stable`, () => {
			expect(z.toJSONSchema(schema)).toMatchSnapshot();
		});
	}
});
