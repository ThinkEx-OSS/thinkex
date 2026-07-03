import { z } from "zod";

import { workspacePageRangeSchema } from "#/features/workspaces/operations/workspace-page-range-schema";

export const mcpListItemsInputSchema = {
	workspaceId: z.string().min(1).describe("Workspace id to list items from."),
	limit: z
		.number()
		.int()
		.min(1)
		.max(200)
		.optional()
		.describe("Maximum number of workspace items to return. Defaults to 100."),
	path: z.string().min(1).optional().describe("Absolute path in the workspace. Defaults to /."),
	recursive: z
		.boolean()
		.optional()
		.describe("Include nested descendants. Defaults to false for immediate children only."),
} as const;

export const mcpReadItemsInputSchema = {
	workspaceId: z.string().min(1).describe("Workspace id to read items from."),
	pages: workspacePageRangeSchema.optional(),
	paths: z
		.array(z.string().min(1))
		.min(1)
		.max(20)
		.describe("Absolute paths in the workspace to read."),
} as const;
