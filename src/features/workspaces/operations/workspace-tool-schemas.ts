import { z } from "zod";

import {
	workspaceReadItemsInputSchema,
	workspaceReadItemsOutputSchema,
} from "#/features/workspaces/content/workspace-content-contract";
import {
	createWorkspaceItemsFailureCodes,
	deleteWorkspaceItemsFailureCodes,
	editWorkspaceItemFailureCodes,
	linkWorkspaceItemsFailureCodes,
	moveWorkspaceItemsFailureCodes,
	renameWorkspaceItemFailureCodes,
} from "#/features/workspaces/operations/workspace-operation-failure-codes";
import {
	workspaceItemTypeSchema,
	workspaceRelationKindSchema,
} from "#/features/workspaces/contracts";
import { workspaceCreatableItemTypeSchema } from "#/features/workspaces/workspace-item-registry";
import { workspaceReferenceRecordSchema } from "#/features/workspaces/locations/workspace-location";
import {
	documentAiEditSchema,
	documentAiHtmlSchema,
} from "#/features/workspaces/documents/document-ai-edits";
import { workspaceFileAssetKindSchema } from "#/features/workspaces/model/workspace-file";
import {
	workspaceSearchInputSchema,
	workspaceSearchOutputSchema,
} from "#/features/workspaces/search/workspace-search-contract";

export {
	workspaceReadItemsInputSchema,
	workspaceReadItemsOutputSchema,
	workspaceSearchInputSchema,
	workspaceSearchOutputSchema,
};

/**
 * Math, chemistry, and money for the HTML surfaces. Documents and widgets are
 * both HTML, so they share one rule and the model tracks "Markdown or HTML?"
 * rather than three per-surface dialects — chat keeps the `$…$` Markdown form.
 */
export const workspaceHtmlMathInstruction =
	'This is HTML, so math is markup rather than delimiters: use <span data-type="inline-math" data-latex="..."></span> or <div data-type="block-math" data-latex="..."></div>, and keep dollar signs out of the data-latex value. Put every subscript and superscript (exponents like 10^8, indices like x_1) inside math rather than <sub>/<sup> tags. Chemistry renders with \\ce{...} (e.g. \\ce{CH4 + 2 O2 -> CO2 + 2 H2O}) and quantities with units render with \\pu{...} (e.g. \\pu{9.81 m/s^2}), both inside data-latex. Write literal money as plain text ($30, never \\$30) — a backslash before a dollar sign shows on screen in HTML.';

/**
 * The hard constraints only — enough that a widget written without the skill
 * still renders. Activate the widget-authoring skill for the full contract,
 * starter template, and canvas/layout guidance rather than restating it here on
 * every turn.
 *
 * Carried by the document instruction because a widget is a document block: the
 * model reaches for one from inside the same write it would write prose in.
 */
const workspaceWidgetHtmlInstruction = `A widget is one interactive block inside a document, written as <div data-type="widget" title="Short title">…escaped HTML source…</div>. Reach for one when the user asks for something interactive — a simulation, calculator, diagram, or visualization — and keep the surrounding prose in normal blocks. Activate the "widget-authoring" skill before writing widget source; it has the full contract, a starter template, and canvas/layout rules. Hard constraints: the source is a self-contained fragment run in a sandboxed iframe, so provide only inner content (HTML plus inline <style> and <script>), never <!doctype>, <html>, <head>, or <body>; all JavaScript must be inline, with no external scripts, imports, or network access; style with the injected app CSS variables (--background, --foreground, --primary, --border, --radius, etc.) instead of hard-coded colors.`;

export const workspaceDocumentHtmlInstruction = `Use semantic HTML with paragraphs, h1-h4, blockquotes, lists, code blocks, horizontal rules, tables, links, and standard text marks. ${workspaceHtmlMathInstruction} For checkboxes, use <ul data-type="taskList"><li data-type="taskItem" data-checked="false"><label><input type="checkbox"><span></span></label><div><p>Item</p></div></li></ul>. Documents cannot hold images: never use <img> or <figure>, and describe the visual in words instead. Cite workspace sources in documents exactly as in a chat reply, with <citation ref="wr_7Kp2Qa9x"></citation> placed after the claim it supports. ${workspaceWidgetHtmlInstruction}`;

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

const workspaceListItemSchema = z.object({
	modifiedAt: z.string(),
	pageCount: z.number().int().positive().optional(),
	path: workspacePathSchema,
	relationshipCount: z.number().int().nonnegative(),
	type: z.union([workspaceItemTypeSchema, workspaceFileAssetKindSchema]),
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

const workspaceRelationInputSchema = z.object({
	kind: workspaceRelationKindSchema.describe(
		"`derived_from` means this item was created or materially changed from the linked item. `references` means this item cites or points to the linked item.",
	),
	note: z
		.string()
		.trim()
		.max(240)
		.optional()
		.describe("Optional short source detail, like pages 12-14 or section on photosynthesis."),
	path: z.string().min(1).describe("Absolute path of the related ThinkEx workspace item."),
});

export const workspaceListItemsInputSchema = z.object({
	offset: z
		.number()
		.int()
		.min(0)
		.optional()
		.describe("Zero-based item offset. Use nextOffset from the previous result to continue."),
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

export const workspaceEditItemInputSchema = z.object({
	path: z.string().min(1).describe("Absolute path of one actual ThinkEx workspace item to edit."),
	edits: z
		.array(documentAiEditSchema)
		.min(1)
		.max(40)
		.describe(
			'Ordered edits, at most 40. Target a block by copying its data-ref into the "ref" field (these are local to the document, not workspace citation refs). Use replace_text to change text inside one block, including a widget\'s source. Use overwrite only to discard the entire document and write a new one.',
		),
});

export const workspaceLinkItemsInputSchema = z.object({
	path: z.string().min(1).describe("Absolute path of the workspace item to link from."),
	relations: z
		.array(workspaceRelationInputSchema)
		.min(1)
		.max(20)
		.describe("Relationships from this item to other workspace items, at most 20."),
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
		.describe("Absolute paths of one or more actual ThinkEx workspace items to move, at most 20."),
});

export const workspaceCreateItemsInputSchema = z.object({
	items: z
		.array(
			z.union([
				z.object({
					type: z.literal("folder"),
					path: z.string().min(1).describe("Final absolute path for the folder to create."),
					relations: z
						.array(workspaceRelationInputSchema)
						.max(20)
						.optional()
						.describe(
							"Optional relationships from this new folder to other workspace items, at most 20.",
						),
				}),
				z.object({
					type: z.literal("document"),
					path: z.string().min(1).describe("Final absolute path for the document to create."),
					relations: z
						.array(workspaceRelationInputSchema)
						.max(20)
						.optional()
						.describe(
							"Optional relationships from this new document to other workspace items, at most 20.",
						),
					initialContent: documentAiHtmlSchema
						// Doc HTML rules live in the create tool description (see
						// workspace-tool-definitions), so they are not repeated here.
						.describe("Optional initial HTML content for the document.")
						.optional(),
				}),
			]),
		)
		.min(1)
		.max(20)
		.describe(
			"One or more folders or documents to create in order, at most 20. Parent folders must already exist or be created earlier in the same request.",
		),
});

export const workspaceDeleteItemsInputSchema = z.object({
	paths: z
		.array(z.string().min(1))
		.min(1)
		.max(20)
		.describe(
			"Absolute paths of one or more actual ThinkEx workspace items to delete, at most 20.",
		),
});

export const workspaceListItemsInputExamples = createInputExamples<
	z.input<typeof workspaceListItemsInputSchema>
>({
	path: "/",
	recursive: false,
});

export const workspaceReadItemsInputExamples = createInputExamples<
	z.input<typeof workspaceReadItemsInputSchema>
>(
	{
		requests: [{ mode: "start", path: "/Demo Folder/Demo Document" }],
	},
	{
		requests: [
			{
				mode: "pages",
				path: "/Demo Folder/Demo PDF.pdf",
				range: "1-3",
			},
		],
	},
);

export const workspaceSearchInputExamples = createInputExamples<
	z.input<typeof workspaceSearchInputSchema>
>(
	{
		query: "What does the market report say about adoption?",
		path: "/Research",
		types: ["document", "file"],
	},
	{
		query: "photosynthesis experiment results",
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
			initialContent:
				"<h1>Demo Document</h1><p>This document was created as part of a tool demo.</p>",
			relations: [
				{
					kind: "derived_from",
					path: "/Demo Folder/Demo PDF.pdf",
					note: "Pages 1-3",
				},
			],
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
>(
	{
		path: "/Demo Folder/Demo Document",
		edits: [
			{
				op: "replace",
				ref: "b_JQrkL4Neurv2.r_6sNqkQxDdy",
				html: "<p>Updated paragraph.</p>",
			},
		],
	},
	{
		path: "/Demo Folder/Demo Document",
		edits: [
			{
				op: "overwrite",
				html: "<h1>Demo Document</h1><p>This document was updated as part of the demo.</p>",
			},
		],
	},
	{
		path: "/Demo Folder/Demo Document",
		edits: [
			{
				op: "replace_text",
				ref: "b_JQrkL4Neurv2.r_6sNqkQxDdy",
				find: "gravity = 9.8",
				replace: "gravity = 3.7",
			},
		],
	},
);

export const workspaceLinkItemsInputExamples = createInputExamples<
	z.input<typeof workspaceLinkItemsInputSchema>
>({
	path: "/Demo Folder",
	relations: [
		{
			kind: "references",
			path: "/Demo Folder/Demo PDF.pdf",
			note: "Source folder for related materials.",
		},
	],
});

export const workspaceListItemsOutputSchema = z.object({
	path: workspacePathSchema,
	total: z.number().int().nonnegative(),
	nextOffset: z.number().int().nonnegative().optional(),
	items: z.array(workspaceListItemSchema),
	failed: z.array(
		createFailureSchema(["path_not_absolute", "path_not_folder", "path_not_found"], {
			includeIndex: false,
		}),
	),
});

export const workspaceCreateItemsOutputSchema = createWorkspaceItemsResultSchema({
	itemSchema: workspacePathItemSchema.extend({
		itemId: z.string().min(1),
		// Creation makes these three and nothing else; the shared item type covers
		// files and study items this tool cannot produce.
		type: workspaceCreatableItemTypeSchema,
	}),
	failureSchema: createFailureSchema(createWorkspaceItemsFailureCodes),
}).extend({
	references: z.array(workspaceReferenceRecordSchema),
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
	itemId: z.string().optional(),
	lineChanges: z
		.object({ added: z.number().int().min(0), removed: z.number().int().min(0) })
		.optional(),
	failed: z.array(
		z.object({
			code: z.enum(editWorkspaceItemFailureCodes),
			detail: z
				.string()
				.optional()
				.describe("Why this edit was refused, when the reason is known."),
			index: workspaceIndexSchema,
		}),
	),
});

export const workspaceLinkItemsOutputSchema = z.object({
	item: workspacePathItemSchema.optional(),
	failed: z.array(createFailureSchema(linkWorkspaceItemsFailureCodes, { includeIndex: false })),
});
