import { z } from "zod";

import { workspaceRelationKindSchema } from "#/features/workspaces/contracts";
import {
	flashcardReviewSchema,
	flashcardStudyProgressSchema,
} from "#/features/workspaces/flashcards/flashcard-study-state";
import { quizStudyProgressSchema } from "#/features/workspaces/quizzes/quiz-study-state";
import { workspaceAddressInputSchema } from "#/features/workspaces/locations/workspace-location";
import { workspaceFileAssetKindSchema } from "#/features/workspaces/model/workspace-file";

const workspacePathSchema = z.string().min(1);

const readWorkspaceItemsFailureCodes = [
	"extraction_failed",
	"extraction_stalled",
	"invalid_selection",
	"page_range_out_of_range",
	"page_selection_too_large",
	"path_is_folder",
	"path_not_absolute",
	"path_not_found",
	"projection_failed",
	"read_budget_exceeded",
	"ref_not_found",
	"unsupported_item_type",
] as const;

const workspaceNumberRangeSchema = z
	.string()
	.trim()
	.min(1)
	.regex(/^\d+(?:\s*-\s*\d+)?(?:\s*,\s*\d+(?:\s*-\s*\d+)?)*$/);
const workspacePageRangeSchema = workspaceNumberRangeSchema.describe(
	"Up to 20 physical pages from an extracted file, like 1, 3, 5-7, or 1,4-6.",
);
const workspaceEntryRangeSchema = workspaceNumberRangeSchema.describe(
	"Up to 20 entry numbers. Flashcards and quiz questions take lists like 1, 3, 5-7; document blocks take one contiguous range like 5-12.",
);

/**
 * One read request. `start` returns the first chunk of anything plus its
 * total unit count; every result reports which numbered units it covered, so
 * continuing is just another `entries` or `pages` request with the next range.
 * `ref` reads the exact content an address identifies — one block in full,
 * one card, one page — with a current revisioned ref beside it.
 */
const workspaceContentReadRequestSchema = z.union([
	z.strictObject({
		path: workspacePathSchema.describe("Absolute path of the workspace item to read."),
		mode: z.literal("start"),
	}),
	z.strictObject({
		path: workspacePathSchema.describe("Absolute path of the workspace item to read."),
		mode: z.literal("pages"),
		range: workspacePageRangeSchema,
	}),
	z.strictObject({
		path: workspacePathSchema.describe("Absolute path of the workspace item to read."),
		mode: z.literal("entries"),
		range: workspaceEntryRangeSchema,
	}),
	z.strictObject({
		mode: z.literal("ref"),
		ref: workspaceAddressInputSchema.describe(
			"Address from an earlier read or citation, like itemRef or itemRef/unit.",
		),
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

/** A unit ref with its current revision, like `c_9xKp2Qab.r_4f2a1b`. */
const workspaceUnitRefSchema = z.string().regex(/^[A-Za-z0-9_-]{1,40}\.r_[A-Za-z0-9_-]{6}$/);

/** Fields every ready read carries, whatever the item type. */
const workspaceReadyResultBase = {
	/** The item's durable address; cite units as `ref/unit`. */
	ref: z.string().min(1),
	itemId: z.string().min(1),
	// Beside the content rather than injected into it: the returned HTML is
	// the byte-exact anchor replace_text edits match against.
	images: z
		.array(z.object({ itemId: z.string().min(1), description: z.string().min(1) }))
		.optional()
		.describe(
			"Stored descriptions of the images this content embeds, keyed by each <img data-item-id>. Call view_image only when a description is not enough.",
		),
	path: workspacePathSchema,
	relations: workspaceReadRelationsSchema.optional(),
	status: z.literal("ready"),
};

/** Which numbered entries of an item this read returned. */
const workspaceEntriesLocationSchema = z.object({
	kind: z.literal("entries"),
	returned: z.array(z.number().int().positive()).min(1),
	total: z.number().int().positive(),
});

const workspaceContentReadResultSchema = z.union([
	z.object({
		...workspaceReadyResultBase,
		content: z.string(),
		format: z.literal("html"),
		location: z.object({
			endBlock: z.number().int().positive(),
			kind: z.literal("blocks"),
			startBlock: z.number().int().positive(),
			totalBlocks: z.number().int().positive(),
		}),
		type: z.literal("document"),
	}),
	z.object({
		...workspaceReadyResultBase,
		cards: z.array(
			z.object({
				ref: workspaceUnitRefSchema,
				front: z.string(),
				back: z.string(),
				study: flashcardReviewSchema.optional(),
			}),
		),
		format: z.literal("html"),
		location: workspaceEntriesLocationSchema,
		progress: flashcardStudyProgressSchema,
		type: z.literal("flashcard"),
	}),
	z.object({
		...workspaceReadyResultBase,
		format: z.literal("html"),
		location: workspaceEntriesLocationSchema,
		progress: quizStudyProgressSchema,
		questions: z.array(
			z.object({
				ref: workspaceUnitRefSchema,
				question: z.string(),
				options: z
					.array(z.object({ text: z.string(), correct: z.boolean() }))
					.min(2)
					.describe("Options in the order users see them; exactly one is correct."),
				explanation: z.string(),
				answer: z
					.object({
						selected: z.number().int().positive().describe("1-based option position."),
						correct: z.boolean(),
					})
					.optional()
					.describe("The reading user's locked-in answer, when they have one."),
			}),
		),
		type: z.literal("quiz"),
	}),
	z.object({
		...workspaceReadyResultBase,
		assetKind: workspaceFileAssetKindSchema,
		content: z.string(),
		emptyPages: z
			.array(z.number().int().min(1))
			.optional()
			.describe(
				"Returned pages that extracted no text. Expect these to fill in later while provisional is true.",
			),
		format: z.literal("markdown"),
		location: workspaceReadPagesSchema.extend({ kind: z.literal("pages") }),
		provisional: z
			.boolean()
			.optional()
			.describe(
				"True when this content came from the fast extraction pass and a higher-quality pass is still running.",
			),
		type: z.literal("file"),
	}),
	z.object({
		elapsedSeconds: z
			.number()
			.int()
			.nonnegative()
			.describe("How long extraction has been running."),
		itemId: z.string().min(1).optional(),
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
		...workspaceReadyResultBase,
		content: z.string(),
		contentRef: workspaceUnitRefSchema,
		format: z.literal("html"),
		type: z.literal("block"),
	}),
	z.object({
		code: z.enum(readWorkspaceItemsFailureCodes),
		message: z.string().optional().describe("Why this read failed, when the reason is known."),
		path: workspacePathSchema.optional(),
		ref: z.string().optional(),
		status: z.literal("failed"),
		type: z.literal("file").optional(),
	}),
]);

export const workspaceReadItemsOutputSchema = z.object({
	results: z.array(workspaceContentReadResultSchema),
});

export type WorkspaceContentReadRequest = z.output<typeof workspaceContentReadRequestSchema>;
export type WorkspaceContentReadResult = z.output<typeof workspaceContentReadResultSchema>;
export type WorkspaceReadItemsOutput = z.output<typeof workspaceReadItemsOutputSchema>;
