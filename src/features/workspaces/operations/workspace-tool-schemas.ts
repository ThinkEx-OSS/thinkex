import { z } from "zod";

import { createWorkspaceItemsFailureCodes } from "#/features/workspaces/operations/create-items";
import { deleteWorkspaceItemsFailureCodes } from "#/features/workspaces/operations/delete-items";
import { editWorkspaceItemFailureCodes } from "#/features/workspaces/operations/edit-item";
import { moveWorkspaceItemsFailureCodes } from "#/features/workspaces/operations/move-items";
import { readWorkspaceItemsFailureCodes } from "#/features/workspaces/operations/read-items";
import { renameWorkspaceItemFailureCodes } from "#/features/workspaces/operations/rename-item";
import { workspaceItemTypeSchema, workspaceSummarySchema } from "#/features/workspaces/contracts";
import { documentMarkdownEditSchema } from "#/features/workspaces/documents/document-markdown-edits";

export const workspaceDocumentMarkdownMathInstruction =
	"For document Markdown math, use `$...$` for inline math and `$$...$$` on separate lines for block math. Escape literal currency dollar signs as `\\$`.";

const workspacePathSchema = z.string().min(1);
const workspaceIndexSchema = z.number().int().nonnegative();

function createInputExamples<T>(...inputs: T[]) {
	return inputs.map((input) => ({ input }));
}

function createFailureSchema<const TCodes extends readonly [string, ...string[]]>(
	codes: TCodes,
	options?: { includeIndex?: boolean },
) {
	return z.object({
		code: z.enum(codes),
		path: workspacePathSchema,
		...(options?.includeIndex === false
			? {}
			: {
					index: workspaceIndexSchema,
				}),
	});
}

const workspacePathItemSchema = z.object({
	path: workspacePathSchema,
	type: workspaceItemTypeSchema,
});

const workspacePreviousPathItemSchema = workspacePathItemSchema.extend({
	previousPath: workspacePathSchema,
});

function createWorkspaceItemsResultSchema<
	TItemSchema extends z.ZodTypeAny,
	TFailureSchema extends z.ZodTypeAny,
>(input: { failureSchema: TFailureSchema; itemSchema: TItemSchema }) {
	return z.object({
		items: z.array(input.itemSchema),
		failed: z.array(input.failureSchema),
	});
}

export const accountListWorkspacesOutputSchema = z.object({
	workspaces: z.array(workspaceSummarySchema),
});

import {
	workspacePageRangeSchema,
	workspaceReadPagesSchema,
} from "#/features/workspaces/operations/workspace-page-range-schema";
export { workspacePageRangeSchema, workspaceReadPagesSchema };

export const workspaceListItemsInputSchema = z.object({
	limit: z
		.number()
		.int()
		.min(1)
		.max(200)
		.optional()
		.describe("Maximum number of workspace items to return. Defaults to 100."),
	path: z
		.string()
		.min(1)
		.optional()
		.describe("Absolute path in the actual ThinkEx workspace. Defaults to /."),
	recursive: z
		.boolean()
		.optional()
		.describe("Include nested descendants. Defaults to false for immediate children only."),
});

export const workspaceReadItemsInputSchema = z.object({
	pages: workspacePageRangeSchema.optional(),
	paths: z
		.array(z.string().min(1))
		.min(1)
		.max(20)
		.describe("Absolute paths in the actual ThinkEx workspace to read."),
});

export const workspaceEditItemInputSchema = z.object({
	path: z.string().min(1).describe("Absolute path of one actual ThinkEx workspace item to edit."),
	edits: z
		.array(documentMarkdownEditSchema)
		.min(1)
		.max(40)
		.describe(
			`Ordered text edits to apply to the item projection. ${workspaceDocumentMarkdownMathInstruction}`,
		),
});

export const workspaceRenameItemInputSchema = z.object({
	name: z.string().trim().min(1).max(160).describe("New user-visible item name."),
	path: z.string().min(1).describe("Absolute path of one actual ThinkEx workspace item to rename."),
});

export const workspaceMoveItemsInputSchema = z.object({
	destinationPath: z
		.string()
		.min(1)
		.describe("Absolute path of the destination folder. Use / for the workspace root."),
	paths: z
		.array(z.string().min(1))
		.min(1)
		.max(20)
		.describe("Absolute paths of one or more actual ThinkEx workspace items to move."),
});

export const workspaceCreateItemsInputSchema = z.object({
	items: z
		.array(
			z.discriminatedUnion("type", [
				z.object({
					type: z.literal("folder"),
					path: z.string().min(1).describe("Final absolute path for the folder to create."),
				}),
				z.object({
					type: z.literal("document"),
					path: z.string().min(1).describe("Final absolute path for the document to create."),
					initialContent: z
						.string()
						.describe(
							`Optional initial Markdown content for the document. ${workspaceDocumentMarkdownMathInstruction}`,
						)
						.optional(),
				}),
			]),
		)
		.min(1)
		.max(20)
		.describe(
			"One or more folders or documents to create in order. Parent folders must already exist or be created earlier in the same request.",
		),
});

export const workspaceDeleteItemsInputSchema = z.object({
	paths: z
		.array(z.string().min(1))
		.min(1)
		.max(20)
		.describe("Absolute paths of one or more actual ThinkEx workspace items to delete."),
});

export const workspaceListItemsInputExamples = createInputExamples<
	z.input<typeof workspaceListItemsInputSchema>
>({
	path: "/",
	limit: 50,
	recursive: false,
});

export const workspaceReadItemsInputExamples = createInputExamples<
	z.input<typeof workspaceReadItemsInputSchema>
>(
	{
		paths: ["/Demo Folder/Demo Document"],
		pages: "1",
	},
	{
		paths: ["/Demo Folder/Demo PDF.pdf"],
		pages: "1-3",
	},
);

export const workspaceRenameItemInputExamples = createInputExamples<
	z.input<typeof workspaceRenameItemInputSchema>
>({
	path: "/Demo Folder/Demo Document",
	name: "Tool Demo",
});

export const workspaceMoveItemsInputExamples = createInputExamples<
	z.input<typeof workspaceMoveItemsInputSchema>
>({
	destinationPath: "/Archive",
	paths: ["/Demo Folder/Demo Document"],
});

export const workspaceCreateItemsInputExamples = createInputExamples<
	z.input<typeof workspaceCreateItemsInputSchema>
>({
	items: [
		{
			type: "folder",
			path: "/Demo Folder",
		},
		{
			type: "document",
			path: "/Demo Folder/Demo Document",
			initialContent: "# Demo Document\nThis document was created as part of a tool demo.",
		},
	],
});

export const workspaceDeleteItemsInputExamples = createInputExamples<
	z.input<typeof workspaceDeleteItemsInputSchema>
>({
	paths: ["/Demo Folder/Demo Document"],
});

export const workspaceEditItemInputExamples = createInputExamples<
	z.input<typeof workspaceEditItemInputSchema>
>({
	path: "/Demo Folder/Demo Document",
	edits: [
		{
			type: "overwrite",
			content: "# Demo Document\nThis document was updated as part of the demo.",
		},
	],
});

export const workspaceListItemsOutputSchema = z.object({
	path: workspacePathSchema,
	more: z.boolean(),
	items: z.array(workspacePathItemSchema),
	failed: z.array(
		createFailureSchema(["path_not_absolute", "path_not_folder", "path_not_found"], {
			includeIndex: false,
		}),
	),
});

export const workspaceReadItemsOutputSchema = createWorkspaceItemsResultSchema({
	itemSchema: z.object({
		path: workspacePathSchema,
		type: z.enum(["document", "file", "flashcard", "quiz"]),
		status: z.enum(["failed", "pending", "ready", "unsupported"]),
		content: z.string().optional(),
		pages: workspaceReadPagesSchema.optional(),
	}),
	failureSchema: createFailureSchema(readWorkspaceItemsFailureCodes),
});

export const workspaceCreateItemsOutputSchema = createWorkspaceItemsResultSchema({
	itemSchema: z.object({
		path: workspacePathSchema,
		type: z.enum(["document", "folder"]),
		warnings: z
			.array(z.string())
			.optional()
			.describe("Content projection warnings for created documents."),
	}),
	failureSchema: createFailureSchema(createWorkspaceItemsFailureCodes),
});

export const workspaceDeleteItemsOutputSchema = createWorkspaceItemsResultSchema({
	itemSchema: workspacePathItemSchema,
	failureSchema: createFailureSchema(deleteWorkspaceItemsFailureCodes),
});

export const workspaceMoveItemsOutputSchema = createWorkspaceItemsResultSchema({
	itemSchema: workspacePreviousPathItemSchema,
	failureSchema: createFailureSchema(moveWorkspaceItemsFailureCodes, {
		includeIndex: false,
	}).extend({
		index: workspaceIndexSchema.optional(),
	}),
});

export const workspaceRenameItemOutputSchema = z.object({
	item: workspacePreviousPathItemSchema.optional(),
	failed: z.array(createFailureSchema(renameWorkspaceItemFailureCodes, { includeIndex: false })),
});

export const workspaceEditItemOutputSchema = z.object({
	path: workspacePathSchema,
	applied: z.number().int().min(0),
	failed: z.array(
		z.object({
			code: z.enum(editWorkspaceItemFailureCodes),
			index: workspaceIndexSchema,
		}),
	),
	warnings: z
		.array(z.string())
		.describe("Content projection warnings after applying edits.")
		.optional(),
});
