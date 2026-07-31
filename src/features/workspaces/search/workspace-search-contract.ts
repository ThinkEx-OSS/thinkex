import { z } from "zod";

import { workspaceReferenceRecordSchema } from "#/features/workspaces/locations/workspace-location";
import { workspaceFileAssetKindSchema } from "#/features/workspaces/model/workspace-file";

const workspaceSearchItemTypeSchema = z.enum(["document", "file"]);

export const workspaceSearchInputSchema = z.object({
	query: z
		.string()
		.trim()
		.min(2)
		.max(1_000)
		.describe("Text or natural-language question to search for in the workspace."),
	path: z
		.string()
		.min(1)
		.optional()
		.describe(
			"Optional absolute workspace path. A folder searches recursively; an item searches only that item. Defaults to /.",
		),
	types: z
		.array(workspaceSearchItemTypeSchema)
		.min(1)
		.max(2)
		.overwrite((types) => Array.from(new Set(types)))
		.optional()
		.describe("Optional content types to include. Defaults to documents and files."),
	limit: z
		.number()
		.int()
		.min(1)
		.max(25)
		.optional()
		.describe("Maximum results to return. Defaults to 10 and is capped at 25."),
});

const workspaceSearchLocationSchema = z.discriminatedUnion("kind", [
	z.object({
		endLine: z.number().int().nonnegative(),
		kind: z.literal("lines"),
		startLine: z.number().int().nonnegative(),
	}),
	z.object({
		kind: z.literal("page"),
		pageNumber: z.number().int().positive(),
	}),
]);

const workspaceSearchResultSchema = z.object({
	assetKind: workspaceFileAssetKindSchema.optional(),
	excerpt: z.string(),
	itemId: z.string().min(1),
	location: workspaceSearchLocationSchema,
	path: z.string().min(1),
	title: z.string().min(1),
	type: workspaceSearchItemTypeSchema,
});

const workspaceSearchFailureSchema = z.object({
	code: z.enum(["path_not_absolute", "path_not_found"]),
	path: z.string(),
});

const workspaceSearchStatusSchema = z.enum(["ready", "indexing", "partial"]);

export const workspaceSearchOutputSchema = z.object({
	failed: z.array(workspaceSearchFailureSchema),
	references: z.array(workspaceReferenceRecordSchema),
	results: z.array(workspaceSearchResultSchema),
	status: workspaceSearchStatusSchema.describe(
		"ready when coverage is current, indexing while the search projection catches up, or partial when some files lack usable extracted text or semantic indexing failed.",
	),
});

export type WorkspaceSearchInput = z.output<typeof workspaceSearchInputSchema>;
export type WorkspaceSearchItemType = z.output<typeof workspaceSearchItemTypeSchema>;
export type WorkspaceSearchResult = z.output<typeof workspaceSearchResultSchema>;
export type WorkspaceSearchFailure = z.output<typeof workspaceSearchFailureSchema>;
export type WorkspaceSearchStatus = z.output<typeof workspaceSearchStatusSchema>;
export type WorkspaceSearchOutput = z.output<typeof workspaceSearchOutputSchema>;
