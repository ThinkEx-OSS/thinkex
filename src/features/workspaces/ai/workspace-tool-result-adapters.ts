import type { JSONValue } from "ai";
import type { z } from "zod";

import { workspaceReadItemsOutputSchema } from "#/features/workspaces/content/workspace-content-contract";
import { createWorkspaceReadItemsModelOutput } from "#/features/workspaces/content/workspace-read-references";
import type { WorkspaceReferenceRecord } from "#/features/workspaces/locations/workspace-location";
import { workspaceSearchOutputSchema } from "#/features/workspaces/search/workspace-search-contract";
import { createWorkspaceSearchModelOutput } from "#/features/workspaces/search/workspace-search-references";

function defineWorkspaceToolResultAdapter<TSchema extends z.ZodTypeAny>(input: {
	collectReferences: (output: z.output<TSchema>) => readonly WorkspaceReferenceRecord[];
	outputSchema: TSchema;
	projectOutput: (output: z.output<TSchema>) => unknown;
}) {
	return {
		collectReferences: (output: unknown) => {
			const parsed = input.outputSchema.safeParse(output);
			return parsed.success ? input.collectReferences(parsed.data) : [];
		},
		projectOutput: (output: unknown) => {
			return input.projectOutput(input.outputSchema.parse(output)) as JSONValue;
		},
	};
}

export const workspaceReadItemsResultAdapter = defineWorkspaceToolResultAdapter({
	collectReferences: (output) => output.references,
	outputSchema: workspaceReadItemsOutputSchema,
	projectOutput: createWorkspaceReadItemsModelOutput,
});

export const workspaceSearchResultAdapter = defineWorkspaceToolResultAdapter({
	collectReferences: (output) => output.references,
	outputSchema: workspaceSearchOutputSchema,
	projectOutput: createWorkspaceSearchModelOutput,
});

const workspaceToolResultAdapters = {
	workspace_read_items: workspaceReadItemsResultAdapter,
	workspace_search: workspaceSearchResultAdapter,
} as const;

export function getWorkspaceToolResultAdapter(name: string) {
	return Object.hasOwn(workspaceToolResultAdapters, name)
		? workspaceToolResultAdapters[name as keyof typeof workspaceToolResultAdapters]
		: null;
}
