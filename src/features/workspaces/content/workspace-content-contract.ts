import { z } from "zod";

import { workspaceRelationKindSchema } from "#/features/workspaces/contracts";
import { workspaceReferenceRecordSchema } from "#/features/workspaces/locations/workspace-location";
import { workspaceFileAssetKindSchema } from "#/features/workspaces/model/workspace-file";

const workspacePathSchema = z.string().min(1);
const workspaceEditRefSchema = z.string().trim().min(1).max(64);

const readWorkspaceItemsFailureCodes = [
	"content_changed",
	"extraction_failed",
	"extraction_stalled",
	"invalid_cursor",
	"invalid_selection",
	"page_range_out_of_range",
	"page_selection_too_large",
	"read_budget_exceeded",
	"path_is_folder",
	"path_not_absolute",
	"path_not_found",
	"projection_failed",
	"edit_ref_not_found",
	"unsupported_item_type",
] as const;

const workspacePageRangeSchema = z
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
	z.strictObject({
		...workspaceContentReadRequestBase,
		editRef: workspaceEditRefSchema.describe(
			"editRef of one block from an earlier document read. The result returns the block in full with its current editRef.",
		),
		mode: z.literal("block"),
	}),
]);

export const workspaceReadItemsInputSchema = z.object({
	requests: z
		.array(workspaceContentReadRequestSchema)
		.min(1)
		.max(20)
		.describe("Ordered workspace content reads, at most 20."),
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
		format: z.literal("html"),
		itemId: z.string().min(1),
		location: z.object({
			endBlock: z.number().int().positive(),
			kind: z.literal("blocks"),
			startBlock: z.number().int().positive(),
			totalBlocks: z.number().int().positive(),
		}),
		nextCursor: z.string().optional(),
		path: workspacePathSchema,
		relations: workspaceReadRelationsSchema.optional(),
		status: z.literal("ready"),
		type: z.literal("document"),
	}),
	z.object({
		assetKind: workspaceFileAssetKindSchema,
		content: z.string(),
		emptyPages: z
			.array(z.number().int().min(1))
			.optional()
			.describe(
				"Returned pages that extracted no text. Expect these to fill in later while provisional is true.",
			),
		format: z.literal("markdown"),
		itemId: z.string().min(1),
		location: workspaceReadPagesSchema.extend({ kind: z.literal("pages") }),
		nextCursor: z.string().optional(),
		path: workspacePathSchema,
		provisional: z
			.boolean()
			.optional()
			.describe(
				"True when this content came from the fast extraction pass and a higher-quality pass is still running.",
			),
		relations: workspaceReadRelationsSchema.optional(),
		status: z.literal("ready"),
		type: z.literal("file"),
	}),
	z.object({
		elapsedSeconds: z
			.number()
			.int()
			.nonnegative()
			.describe("How long extraction has been running."),
		path: workspacePathSchema,
		phase: z
			.enum(["queued", "extracting"])
			.describe("Whether extraction has started yet for this file."),
		retryAfterSeconds: z
			.number()
			.int()
			.positive()
			.describe("Suggested wait before reading this path again."),
		status: z.literal("pending"),
		type: z.literal("file"),
	}),
	z.object({
		content: z.string(),
		editRef: workspaceEditRefSchema,
		format: z.literal("html"),
		itemId: z.string().min(1),
		path: workspacePathSchema,
		relations: workspaceReadRelationsSchema.optional(),
		status: z.literal("ready"),
		type: z.literal("block"),
	}),
	z.object({
		code: z.enum(readWorkspaceItemsFailureCodes),
		message: z.string().optional().describe("Why extraction failed, when known."),
		path: workspacePathSchema,
		status: z.literal("failed"),
		type: z.literal("file").optional(),
	}),
]);

export const workspaceReadItemsOutputSchema = z.object({
	references: z.array(workspaceReferenceRecordSchema),
	results: z.array(workspaceContentReadResultSchema),
});

export type WorkspaceContentReadRequest = z.output<typeof workspaceContentReadRequestSchema>;
export type WorkspaceContentReadResult = z.output<typeof workspaceContentReadResultSchema>;
export type WorkspaceReadItemsOutput = z.output<typeof workspaceReadItemsOutputSchema>;
