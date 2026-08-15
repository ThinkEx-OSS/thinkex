import type { JSONValue } from "ai";
import { z } from "zod";

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
function defineWorkspaceToolResultAdapter<TSchema extends z.ZodTypeAny>(input: {
	outputSchema: TSchema;
	projectOutput: (output: z.output<TSchema>) => unknown;
}) {
	return {
		projectOutput: (output: unknown) => {
			return input.projectOutput(input.outputSchema.parse(output)) as JSONValue;
		},
	};
}

const workspaceReadItemsResultAdapter = defineWorkspaceToolResultAdapter({
	outputSchema: workspaceReadItemsOutputSchema,
	projectOutput: createWorkspaceReadItemsModelOutput,
});

const workspaceCreateItemsResultAdapter = defineWorkspaceToolResultAdapter({
	outputSchema: workspaceCreateItemsOutputSchema,
	projectOutput: (output) => ({
		failed: output.failed,
		items: output.items.map(({ itemId: _itemId, ...item }) => item),
	}),
});

// The operation output also carries the durable item id used by the app's
// review controls. Keep the model-facing receipt limited to actionable counts.
const workspaceEditItemResultAdapter = defineWorkspaceToolResultAdapter({
	outputSchema: workspaceEditItemOutputSchema,
	projectOutput: ({ applied, failed, path }) => ({ applied, failed, path }),
});

const workspaceToolResultAdapters = {
	workspace_create_items: workspaceCreateItemsResultAdapter,
	workspace_edit_item: workspaceEditItemResultAdapter,
	workspace_read_items: workspaceReadItemsResultAdapter,
} as const;

export function getWorkspaceToolResultAdapter(name: string) {
	return Object.hasOwn(workspaceToolResultAdapters, name)
		? workspaceToolResultAdapters[name as keyof typeof workspaceToolResultAdapters]
		: null;
}
