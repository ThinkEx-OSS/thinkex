import type { JSONValue } from "ai";

import { workspaceReadItemsOutputSchema } from "#/features/workspaces/content/workspace-content-contract";
import { createWorkspaceReadItemsModelOutput } from "#/features/workspaces/content/workspace-read-model-output";
import {
	workspaceCreateItemsOutputSchema,
	workspaceEditItemOutputSchema,
} from "#/features/workspaces/operations/workspace-tool-schemas";

/**
 * Model-facing projections for tool outputs whose rich form carries more than
 * the model needs. Addresses are already self-describing, so projection is
 * only ever subtraction: internal item ids and app-side bookkeeping.
 */
const workspaceToolResultAdapters = {
	workspace_create_items: {
		projectOutput: (output: unknown): JSONValue => {
			const { failed, items } = workspaceCreateItemsOutputSchema.parse(output);
			return { failed, items: items.map(({ itemId: _itemId, ...item }) => item) } as JSONValue;
		},
	},
	// The operation output also carries the durable item id used by the app's
	// review controls. Keep the model-facing receipt limited to actionable counts.
	workspace_edit_item: {
		projectOutput: (output: unknown): JSONValue => {
			const { applied, failed, path } = workspaceEditItemOutputSchema.parse(output);
			return { applied, failed, path } as JSONValue;
		},
	},
	workspace_read_items: {
		projectOutput: (output: unknown): JSONValue =>
			createWorkspaceReadItemsModelOutput(
				workspaceReadItemsOutputSchema.parse(output),
			) as JSONValue,
	},
} as const;

export function getWorkspaceToolResultAdapter(name: string) {
	return Object.hasOwn(workspaceToolResultAdapters, name)
		? workspaceToolResultAdapters[name as keyof typeof workspaceToolResultAdapters]
		: null;
}
