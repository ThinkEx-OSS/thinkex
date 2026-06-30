import type { ToolSet } from "ai";
import { tool } from "ai";
import { z } from "zod";

import type { AIThreadContext } from "#/features/workspaces/ai/ai-thread-metadata";
import { createWorkspaceKernelAiItems } from "#/features/workspaces/ai/workspace-kernel-ai-create";
import { deleteWorkspaceKernelAiItems } from "#/features/workspaces/ai/workspace-kernel-ai-delete";
import { editWorkspaceKernelAiItem } from "#/features/workspaces/ai/workspace-kernel-ai-edit";
import { moveWorkspaceKernelAiItems } from "#/features/workspaces/ai/workspace-kernel-ai-move";
import { readWorkspaceKernelAiItems } from "#/features/workspaces/ai/workspace-kernel-ai-read";
import { renameWorkspaceKernelAiItem } from "#/features/workspaces/ai/workspace-kernel-ai-rename";
import { workspaceItemTypeSchema } from "#/features/workspaces/contracts";
import { documentMarkdownEditSchema } from "#/features/workspaces/documents/document-markdown-edits";
import { listWorkspaceKernelItems } from "#/features/workspaces/kernel/workspace-kernel-access";

const workspaceDocumentMarkdownMathInstruction =
	"For document Markdown math, use `$...$` for inline math and `$$...$$` on separate lines for block math. Escape literal currency dollar signs as `\\$`.";
const workspacePathSchema = z.string().min(1);
const workspaceIndexSchema = z.number().int().nonnegative();

function createInputExamples<T>(...inputs: T[]) {
	return inputs.map((input) => ({ input }));
}

function createFailureSchema<const TCodes extends [string, ...string[]]>(
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

const workspaceItemLinksSchema = z
	.array(workspacePathSchema)
	.max(20)
	.describe("Absolute paths of workspace items this item should link to.");

const workspaceItemLinkOutputSchema = z.object({
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

const workspaceReadPagesSchema = z.object({
	requested: z.string().describe("Requested page range."),
	returned: z.array(z.number().int().min(1)).describe("Page numbers included in content."),
	total: z.number().int().min(1).describe("Total pages available."),
});

const workspacePageRangeSchema = z
	.string()
	.trim()
	.min(1)
	.regex(/^\d+(?:\s*-\s*\d+)?(?:\s*,\s*\d+(?:\s*-\s*\d+)?)*$/)
	.describe(
		"1-based pages to read, like 1, 3, 5-7, or 1,4-6. For PDFs, pages are PDF pages. For Markdown-backed items, each page is 1000 Markdown lines. Defaults to 1.",
	);

const workspaceListItemsInputSchema = z.object({
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

const workspaceReadItemsInputSchema = z.object({
	pages: workspacePageRangeSchema.optional(),
	paths: z
		.array(z.string().min(1))
		.min(1)
		.max(20)
		.describe("Absolute paths in the actual ThinkEx workspace to read."),
});

const workspaceEditItemInputSchema = z
	.object({
		path: z.string().min(1).describe("Absolute path of one actual ThinkEx workspace item to edit."),
		edits: z
			.array(documentMarkdownEditSchema)
			.min(1)
			.max(40)
			.describe(
				`Ordered text edits to apply to the item projection. ${workspaceDocumentMarkdownMathInstruction}`,
			)
			.optional(),
		links: workspaceItemLinksSchema
			.optional()
			.describe(
				"Optional replacement set of related workspace items. Omit to leave links unchanged; pass [] to clear all links.",
			),
	})
	.superRefine((input, context) => {
		if ((input.edits?.length ?? 0) === 0 && input.links === undefined) {
			context.addIssue({
				code: "custom",
				message: "Provide at least one edit or links.",
				path: ["edits"],
			});
		}
	});

const workspaceRenameItemInputSchema = z.object({
	name: z.string().trim().min(1).max(160).describe("New user-visible item name."),
	path: z.string().min(1).describe("Absolute path of one actual ThinkEx workspace item to rename."),
});

const workspaceMoveItemsInputSchema = z.object({
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

const workspaceCreateItemsInputSchema = z.object({
	items: z
		.array(
			z.discriminatedUnion("type", [
				z.object({
					type: z.literal("folder"),
					path: z.string().min(1).describe("Final absolute path for the folder to create."),
					links: workspaceItemLinksSchema.optional(),
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
					links: workspaceItemLinksSchema.optional(),
				}),
			]),
		)
		.min(1)
		.max(20)
		.describe(
			"One or more folders or documents to create in order. Parent folders must already exist or be created earlier in the same request.",
		),
});

const workspaceDeleteItemsInputSchema = z.object({
	paths: z
		.array(z.string().min(1))
		.min(1)
		.max(20)
		.describe("Absolute paths of one or more actual ThinkEx workspace items to delete."),
});

const workspaceListItemsInputExamples = createInputExamples<
	z.input<typeof workspaceListItemsInputSchema>
>({
	path: "/",
	limit: 50,
	recursive: false,
});

const workspaceReadItemsInputExamples = createInputExamples<
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

const workspaceRenameItemInputExamples = createInputExamples<
	z.input<typeof workspaceRenameItemInputSchema>
>({
	path: "/Demo Folder/Demo Document",
	name: "Tool Demo",
});

const workspaceMoveItemsInputExamples = createInputExamples<
	z.input<typeof workspaceMoveItemsInputSchema>
>({
	destinationPath: "/Archive",
	paths: ["/Demo Folder/Demo Document"],
});

const workspaceCreateItemsInputExamples = createInputExamples<
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
			links: ["/Demo Folder"],
		},
	],
});

const workspaceDeleteItemsInputExamples = createInputExamples<
	z.input<typeof workspaceDeleteItemsInputSchema>
>({
	paths: ["/Demo Folder/Demo Document"],
});

const workspaceEditItemInputExamples = createInputExamples<
	z.input<typeof workspaceEditItemInputSchema>
>({
	path: "/Demo Folder/Demo Document",
	links: ["/Demo Folder"],
	edits: [
		{
			type: "overwrite",
			content: "# Demo Document\nThis document was updated as part of the demo.",
		},
	],
});

const workspaceListItemsOutputSchema = z.object({
	path: workspacePathSchema,
	more: z.boolean(),
	items: z.array(workspacePathItemSchema),
	failed: z.array(
		createFailureSchema(["path_not_absolute", "path_not_folder", "path_not_found"], {
			includeIndex: false,
		}),
	),
});

const workspaceReadItemsOutputSchema = createWorkspaceItemsResultSchema({
	itemSchema: z.object({
		path: workspacePathSchema,
		type: z.enum(["document", "file", "flashcard", "quiz"]),
		status: z.enum(["failed", "pending", "ready", "unsupported"]),
		content: z.string().optional(),
		links: z.array(workspaceItemLinkOutputSchema),
		pages: workspaceReadPagesSchema.optional(),
	}),
	failureSchema: createFailureSchema([
		"page_range_out_of_range",
		"path_is_folder",
		"path_not_absolute",
		"path_not_found",
	]),
});

const workspaceCreateItemsOutputSchema = createWorkspaceItemsResultSchema({
	itemSchema: z.object({
		path: workspacePathSchema,
		type: z.enum(["document", "folder"]),
		warnings: z
			.array(z.string())
			.optional()
			.describe("Content projection warnings for created documents."),
	}),
	failureSchema: createFailureSchema([
		"cannot_create_root",
		"invalid_initial_content",
		"link_path_is_root",
		"link_path_not_absolute",
		"link_path_not_found",
		"path_already_exists",
		"path_not_absolute",
		"path_not_canonical",
		"path_not_folder",
		"path_not_found",
	]),
});

const workspaceDeleteItemsOutputSchema = createWorkspaceItemsResultSchema({
	itemSchema: workspacePathItemSchema,
	failureSchema: createFailureSchema(["cannot_delete_root", "path_not_absolute", "path_not_found"]),
});

const workspaceMoveItemsOutputSchema = createWorkspaceItemsResultSchema({
	itemSchema: workspacePreviousPathItemSchema,
	failureSchema: createFailureSchema(
		[
			"already_in_destination",
			"cannot_move_into_descendant",
			"cannot_move_root",
			"destination_path_not_absolute",
			"destination_path_not_folder",
			"destination_path_not_found",
			"path_already_exists",
			"path_not_absolute",
			"path_not_found",
		],
		{ includeIndex: false },
	).extend({
		index: workspaceIndexSchema.optional(),
	}),
});

const workspaceRenameItemOutputSchema = z.object({
	item: workspacePreviousPathItemSchema.optional(),
	failed: z.array(
		createFailureSchema(
			["cannot_rename_root", "path_already_exists", "path_not_absolute", "path_not_found"],
			{ includeIndex: false },
		),
	),
});

const workspaceEditItemOutputSchema = z.object({
	path: workspacePathSchema,
	applied: z.number().int().min(0),
	failed: z.array(
		z.object({
			code: z.string(),
			index: workspaceIndexSchema,
		}),
	),
	warnings: z
		.array(z.string())
		.describe("Content projection warnings after applying edits.")
		.optional(),
	links: z.array(workspaceItemLinkOutputSchema).optional(),
});

type WorkspaceThreadToolConfig<
	TInputSchema extends z.ZodTypeAny,
	TOutputSchema extends z.ZodTypeAny,
> = {
	description: string;
	execute: (
		args: z.output<TInputSchema>,
		thread: AIThreadContext,
	) => Promise<z.output<TOutputSchema>>;
	getThreadContext: () => Promise<AIThreadContext | null>;
	inputExamples: Array<{ input: z.input<TInputSchema> }>;
	inputSchema: TInputSchema;
	outputSchema: TOutputSchema;
};

function createWorkspaceThreadTool<
	TInputSchema extends z.ZodTypeAny,
	TOutputSchema extends z.ZodTypeAny,
>(input: WorkspaceThreadToolConfig<TInputSchema, TOutputSchema>) {
	return tool({
		description: input.description,
		inputSchema: input.inputSchema,
		inputExamples: input.inputExamples,
		outputSchema: input.outputSchema,
		strict: true,
		execute: async (args) => {
			return await input.execute(
				args as z.output<TInputSchema>,
				await requireThreadContext(input.getThreadContext),
			);
		},
	});
}

export function createAIThreadWorkspaceTools(input: {
	getThreadContext: () => Promise<AIThreadContext | null>;
}): ToolSet {
	const createThreadTool = <TInputSchema extends z.ZodTypeAny, TOutputSchema extends z.ZodTypeAny>(
		config: Omit<WorkspaceThreadToolConfig<TInputSchema, TOutputSchema>, "getThreadContext">,
	) => {
		return createWorkspaceThreadTool({
			...config,
			getThreadContext: input.getThreadContext,
		});
	};

	return {
		workspace_list_items: createThreadTool({
			description: "List items in the actual ThinkEx workspace by absolute path.",
			inputSchema: workspaceListItemsInputSchema,
			inputExamples: workspaceListItemsInputExamples,
			outputSchema: workspaceListItemsOutputSchema,
			execute: async ({ limit, path, recursive }, thread) => {
				return await listWorkspaceKernelItems({
					workspaceId: thread.workspaceId,
					userId: thread.userId,
					path,
					recursive,
					limit,
				});
			},
		}),
		workspace_read_items: createThreadTool({
			description:
				"Read ThinkEx documents and files by absolute path, including any workspace item links previously attached to each item. Use pages for continuation: PDF pages for PDFs, 1000-line Markdown pages for documents and extracted files. Defaults to page 1. Check pages.total before reading more.",
			inputSchema: workspaceReadItemsInputSchema,
			inputExamples: workspaceReadItemsInputExamples,
			outputSchema: workspaceReadItemsOutputSchema,
			execute: async ({ pages, paths }, thread) => {
				return await readWorkspaceKernelAiItems({
					pages,
					workspaceId: thread.workspaceId,
					userId: thread.userId,
					paths,
				});
			},
		}),
		workspace_rename_item: createThreadTool({
			description:
				"Rename one actual ThinkEx workspace item by absolute path. If the requested final path already exists, the rename fails instead of auto-renaming.",
			inputSchema: workspaceRenameItemInputSchema,
			inputExamples: workspaceRenameItemInputExamples,
			outputSchema: workspaceRenameItemOutputSchema,
			execute: async ({ name, path }, thread) => {
				return await renameWorkspaceKernelAiItem({
					name,
					path,
					workspaceId: thread.workspaceId,
					userId: thread.userId,
				});
			},
		}),
		workspace_move_items: createThreadTool({
			description:
				"Move one or more actual ThinkEx workspace items into an existing folder or the workspace root. If the destination already has the same name, that move fails instead of auto-renaming.",
			inputSchema: workspaceMoveItemsInputSchema,
			inputExamples: workspaceMoveItemsInputExamples,
			outputSchema: workspaceMoveItemsOutputSchema,
			execute: async ({ destinationPath, paths }, thread) => {
				return await moveWorkspaceKernelAiItems({
					destinationPath,
					paths,
					workspaceId: thread.workspaceId,
					userId: thread.userId,
				});
			},
		}),
		workspace_create_items: createThreadTool({
			description: `Create one or more folders or documents at exact absolute paths. If a path already exists, creation fails instead of renaming. Optionally link each new item to existing workspace items, or to items created earlier in the same request, when you judge them meaningfully related. ${workspaceDocumentMarkdownMathInstruction}`,
			inputSchema: workspaceCreateItemsInputSchema,
			inputExamples: workspaceCreateItemsInputExamples,
			outputSchema: workspaceCreateItemsOutputSchema,
			execute: async ({ items }, thread) => {
				return await createWorkspaceKernelAiItems({
					items,
					workspaceId: thread.workspaceId,
					userId: thread.userId,
				});
			},
		}),
		workspace_delete_items: createThreadTool({
			description: "Delete one or more actual ThinkEx workspace items by absolute path.",
			inputSchema: workspaceDeleteItemsInputSchema,
			inputExamples: workspaceDeleteItemsInputExamples,
			outputSchema: workspaceDeleteItemsOutputSchema,
			execute: async ({ paths }, thread) => {
				return await deleteWorkspaceKernelAiItems({
					paths,
					workspaceId: thread.workspaceId,
					userId: thread.userId,
				});
			},
		}),
		workspace_edit_item: createThreadTool({
			description: `Edit one actual ThinkEx workspace item by absolute path. Use edits for document content changes and links to replace the item's related workspace items when you judge other items meaningfully related. Omit links to leave them unchanged, or pass [] to clear them. Read before editing document content unless the user requested a simple append or prepend. ${workspaceDocumentMarkdownMathInstruction}`,
			inputSchema: workspaceEditItemInputSchema,
			inputExamples: workspaceEditItemInputExamples,
			outputSchema: workspaceEditItemOutputSchema,
			execute: async ({ path, edits, links }, thread) => {
				return await editWorkspaceKernelAiItem({
					workspaceId: thread.workspaceId,
					userId: thread.userId,
					path,
					edits,
					links,
				});
			},
		}),
	};
}

async function requireThreadContext(getThreadContext: () => Promise<AIThreadContext | null>) {
	const thread = await getThreadContext();

	if (!thread) {
		throw new Error("Chat thread not found");
	}

	return thread;
}
