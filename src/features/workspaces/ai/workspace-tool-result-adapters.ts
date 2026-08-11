import type { JSONValue } from "ai";
import { z } from "zod";

import { workspaceReadItemsOutputSchema } from "#/features/workspaces/content/workspace-content-contract";
import { createWorkspaceReadItemsModelOutput } from "#/features/workspaces/content/workspace-read-references";
import {
	workspaceReferenceRecordSchema,
	type WorkspaceReferenceRecord,
} from "#/features/workspaces/locations/workspace-location";

function defineWorkspaceToolResultAdapter<TSchema extends z.ZodTypeAny>(input: {
	collectReferences?: (output: z.output<TSchema>) => readonly WorkspaceReferenceRecord[];
	outputSchema: TSchema;
	projectOutput: (output: z.output<TSchema>) => unknown;
}) {
	return {
		collectReferences: (output: unknown) => {
			const parsed = input.outputSchema.safeParse(output);
			return parsed.success ? (input.collectReferences?.(parsed.data) ?? []) : [];
		},
		// Also runs when history is replayed, on results shaped by older versions
		// of this schema. Execution already validated them, so projection is
		// presentation only: project what parses, pass through what does not.
		projectOutput: (output: unknown) => {
			const parsed = input.outputSchema.safeParse(output);
			return (parsed.success ? input.projectOutput(parsed.data) : output) as JSONValue;
		},
	};
}

const workspaceReadItemsResultAdapter = defineWorkspaceToolResultAdapter({
	collectReferences: (output) => output.references,
	outputSchema: workspaceReadItemsOutputSchema,
	projectOutput: createWorkspaceReadItemsModelOutput,
});

const workspaceCreateItemsResultAdapter = defineWorkspaceToolResultAdapter({
	collectReferences: (output) => output.references,
	outputSchema: z.object({
		failed: z.array(
			z.object({
				code: z.string(),
				detail: z.string().optional(),
				index: z.number(),
				path: z.string(),
			}),
		),
		items: z.array(
			z.object({
				itemId: z.string(),
				path: z.string(),
				type: z.enum(["document", "folder"]),
			}),
		),
		references: z.array(workspaceReferenceRecordSchema),
	}),
	projectOutput: (output) => {
		const refsByItemId = new Map(
			output.references.flatMap((record) =>
				record.location.kind === "item" ? [[record.location.itemId, record.ref] as const] : [],
			),
		);

		return {
			failed: output.failed,
			items: output.items.map(({ itemId, path, type }) => {
				const reference = refsByItemId.get(itemId);

				return { path, ...(reference ? { reference } : {}), type };
			}),
		};
	},
});

// The operation output also carries the durable item id used by the app's
// review controls. Keep the model-facing receipt limited to actionable counts.
const workspaceEditItemResultAdapter = defineWorkspaceToolResultAdapter({
	outputSchema: z.object({
		applied: z.number(),
		failed: z.array(
			z.object({ code: z.string(), detail: z.string().optional(), index: z.number() }),
		),
		path: z.string(),
	}),
	projectOutput: (output) => output,
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
