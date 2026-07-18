import { z } from "zod";

import { workspaceRelationKindSchema } from "#/features/workspaces/contracts";

const workspacePathSchema = z.string().min(1);

export const readWorkspaceItemsFailureCodes = [
	"content_changed",
	"invalid_cursor",
	"invalid_selection",
	"page_range_out_of_range",
	"page_selection_too_large",
	"path_is_folder",
	"path_not_absolute",
	"path_not_found",
	"projection_failed",
	"unsupported_item_type",
] as const;

export const workspacePageRangeSchema = z
	.string()
	.trim()
	.min(1)
	.regex(/^\d+(?:\s*-\s*\d+)?(?:\s*,\s*\d+(?:\s*-\s*\d+)?)*$/)
	.describe(
		"Up to 20 physical pages from an extracted file, like 1, 3, 5-7, or 1,4-6. Defaults to page 1.",
	);

const workspaceContentReadRequestBase = {
	path: workspacePathSchema.describe("Absolute path of the workspace item to read."),
};

const workspaceContentReadRequestSchema = z.union([
	z.strictObject({
		...workspaceContentReadRequestBase,
		mode: z.literal("start"),
	}),
	z.strictObject({
		...workspaceContentReadRequestBase,
		mode: z.literal("pages"),
		range: workspacePageRangeSchema,
	}),
	z.strictObject({
		...workspaceContentReadRequestBase,
		cursor: z.string().min(1).max(4_096).describe("Opaque cursor returned by a previous read."),
		mode: z.literal("continue"),
	}),
]);

export const workspaceReadItemsInputSchema = z.object({
	requests: z
		.array(workspaceContentReadRequestSchema)
		.min(1)
		.max(20)
		.describe("Ordered workspace content reads."),
});

const workspaceReadPagesSchema = z.object({
	requested: z.string().describe("Requested page range."),
	returned: z.array(z.number().int().min(1)).describe("Page numbers included in content."),
	total: z.number().int().min(1).describe("Total pages available."),
});

const workspaceReadRelationsSchema = z.array(
	z.object({
		direction: z.enum(["incoming", "outgoing"]),
		kind: workspaceRelationKindSchema,
		note: z.string().optional(),
		path: workspacePathSchema,
	}),
);

const workspaceContentReadResultSchema = z.union([
	z.object({
		content: z.string(),
		format: z.literal("markdown"),
		location: z.object({
			endLine: z.number().int().nonnegative(),
			kind: z.literal("lines"),
			startLine: z.number().int().nonnegative(),
			totalLines: z.number().int().nonnegative(),
		}),
		nextCursor: z.string().optional(),
		path: workspacePathSchema,
		relations: workspaceReadRelationsSchema.optional(),
		status: z.literal("ready"),
		type: z.literal("document"),
	}),
	z.object({
		content: z.string(),
		format: z.literal("markdown"),
		location: workspaceReadPagesSchema.extend({ kind: z.literal("pages") }),
		nextCursor: z.string().optional(),
		path: workspacePathSchema,
		relations: workspaceReadRelationsSchema.optional(),
		status: z.literal("ready"),
		type: z.literal("file"),
	}),
	z.object({
		path: workspacePathSchema,
		status: z.literal("pending"),
		type: z.literal("file"),
	}),
	z.object({
		code: z.enum(readWorkspaceItemsFailureCodes),
		path: workspacePathSchema,
		status: z.literal("failed"),
		type: z.literal("file").optional(),
	}),
]);

export const workspaceReadItemsOutputSchema = z.object({
	results: z.array(workspaceContentReadResultSchema),
});

export type WorkspaceContentReadRequest = z.output<typeof workspaceContentReadRequestSchema>;
export type WorkspaceContentReadResult = z.output<typeof workspaceContentReadResultSchema>;
