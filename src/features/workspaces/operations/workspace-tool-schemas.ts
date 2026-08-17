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
	WORKSPACE_ITEM_NAME_MAX_LENGTH,
	workspaceItemTypeSchema,
	workspaceRelationKindSchema,
} from "#/features/workspaces/contracts";
import {
	documentAiEditSchema,
	documentAiHtmlSchema,
} from "#/features/workspaces/documents/document-ai-edits";
import { workspaceFileAssetKindSchema } from "#/features/workspaces/model/workspace-file";
import { flashcardEditSchema } from "#/features/workspaces/flashcards/flashcard-edits";
import { quizEditSchema, quizQuestionInputSchema } from "#/features/workspaces/quizzes/quiz-edits";
import { entryRichTextHtmlSchema } from "#/features/workspaces/content/entry-rich-text";

export { workspaceReadItemsInputSchema, workspaceReadItemsOutputSchema };

/**
 * Math, chemistry, and money for the HTML surfaces. Documents and widgets are
 * both HTML, so they share one rule and the model tracks "Markdown or HTML?"
 * rather than three per-surface dialects — chat keeps the `$…$` Markdown form.
 */
const workspaceHtmlMathInstruction =
	'This is HTML, so math is markup rather than delimiters: use <span data-type="inline-math" data-latex="..."></span> or <div data-type="block-math" data-latex="..."></div>, and keep dollar signs out of the data-latex value. Put every subscript and superscript (exponents like 10^8, indices like x_1) inside math rather than <sub>/<sup> tags. Chemistry renders with \\ce{...} (e.g. \\ce{CH4 + 2 O2 -> CO2 + 2 H2O}) and quantities with units render with \\pu{...} (e.g. \\pu{9.81 m/s^2}), both inside data-latex. Write literal money as plain text ($30, never \\$30) — a backslash before a dollar sign shows on screen in HTML.';

/**
 * The one diagram route every HTML surface shares. A mermaid block is an
 * ordinary code block, so cards and questions get diagrams without opening
 * their allowlist to widgets — which stay documents-only.
 */
const workspaceHtmlDiagramInstruction =
	'Draw a diagram as a mermaid code block: <pre><code class="language-mermaid">flowchart TD; A[Start] --> B[End]</code></pre>. It renders as a diagram wherever the item is read or studied, and is left out of a PDF export entirely, so never let a diagram carry a point the surrounding text does not also make. Keep it to about ten nodes with short labels, and include concise accTitle and accDescr lines — they become the diagram\'s alt text. No frontmatter, init directives, custom styles, HTML, links, or images inside the diagram.';

/**
 * The one code-block detail HTML does not make obvious. Every reader
 * normalizes aliases and casing, so the class prefix is the whole contract.
 */
const workspaceHtmlCodeInstruction =
	'A code block carries its language as a class on the inner <code>: <pre><code class="language-python">…</code></pre>. Without that class the block renders unhighlighted and unlabelled.';

/**
 * Keep discovery and serialization beside the document tool. The activated
 * skill owns the authoring contract so the two prompts cannot drift apart.
 */
const workspaceWidgetHtmlInstruction = `A widget is one interactive block inside a document. Use one when the user explicitly asks for a widget, asks for interaction or live computation, or wants a document visual that ordinary blocks cannot express. Keep ordinary content in ordinary blocks. Before authoring or editing widget source, activate the "widget-authoring" skill and follow its HTML, sandbox, layout, and editing contract. Serialize the result as <div data-type="widget" title="Short title">…HTML-escaped fragment…</div>.`;

export const workspaceDocumentHtmlInstruction = `Use semantic HTML with paragraphs, h1-h4, blockquotes, lists, code blocks, horizontal rules, tables, links, and standard text marks. ${workspaceHtmlMathInstruction} ${workspaceHtmlCodeInstruction} For checkboxes, use <ul data-type="taskList"><li data-type="taskItem" data-checked="false"><label><input type="checkbox"><span></span></label><div><p>Item</p></div></li></ul>. Documents cannot hold images: never use <img> or <figure> — draw a diagram or describe the visual in words instead. ${workspaceHtmlDiagramInstruction} Cite workspace sources in documents exactly as in a chat reply, with <citation ref="Xk7p2Qa9/b_x7Kp2Qa9x8Lm"></citation> placed after the claim it supports — the address is the item's ref, or ref/unit for a page, block, card, or question, with any .r_ suffix dropped. ${workspaceWidgetHtmlInstruction}`;

export const workspaceFlashcardHtmlInstruction = `Flashcard fronts and backs are HTML. Keep each side concise. Use paragraphs, lists, links, code blocks, and standard text marks only. ${workspaceHtmlMathInstruction} ${workspaceHtmlCodeInstruction} Do not use headings, tables, images, widgets, task lists, or citations inside a card. ${workspaceHtmlDiagramInstruction}`;

export const workspaceQuizHtmlInstruction = `Question stems, options, and explanations are HTML. Keep them concise. Use paragraphs, lists, links, code blocks, and standard text marks only. ${workspaceHtmlMathInstruction} ${workspaceHtmlCodeInstruction} Do not use headings, tables, images, widgets, task lists, or citations inside a question. ${workspaceHtmlDiagramInstruction} A diagram usually belongs in the stem or the explanation; if one option needs it, give them all one, since an option taller than the rest hints at the answer. Write correctAnswer as its own field and never hint at it in the stem or option order: the server shuffles the options and records which one is correct. Every distractor must be strictly wrong yet plausible, reflect a specific misconception, and match the correct answer's length and tone. Prefer 3 distractors; use 1 for true/false. Questions should test understanding from the source material, not trivia recall.`;

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
	path: workspacePathSchema,
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

export const workspaceEditItemInputSchema = z.discriminatedUnion("type", [
	z
		.object({
			type: z.literal("document"),
			path: z.string().min(1).describe("Absolute path of one actual ThinkEx document to edit."),
			edits: z
				.array(documentAiEditSchema)
				.min(1)
				.max(40)
				.describe(
					`Ordered document edits using exact refs from a read. Available operations: insert_before, insert_after, update, replace, replace_text, move, and delete. update accepts exactly one top-level block; replace may replace one block with several. move requires exactly one of beforeRef or afterRef. ${workspaceDocumentHtmlInstruction}`,
				),
		})
		.describe("Document edits."),
	z
		.object({
			type: z.literal("flashcard"),
			path: z
				.string()
				.min(1)
				.describe("Absolute path of one actual ThinkEx flashcard set to edit."),
			edits: z
				.array(flashcardEditSchema)
				.min(1)
				.max(100)
				.describe(
					`Ordered flashcard edits using exact refs from a read. Available operations: insert_before, insert_after, update, replace, replace_text, move, and delete. replace changes both sides; replace_text requires front or back as side; move requires exactly one of beforeRef or afterRef. ${workspaceFlashcardHtmlInstruction}`,
				),
		})
		.describe("Flashcard edits."),
	z
		.object({
			type: z.literal("quiz"),
			path: z.string().min(1).describe("Absolute path of one actual ThinkEx quiz to edit."),
			edits: z
				.array(quizEditSchema)
				.min(1)
				.max(100)
				.describe(
					`Ordered quiz edits using exact refs from a read. Available operations: insert_before, insert_after, update, replace, replace_text, move, and delete. insert and replace take a full authored question and reshuffle its options; update changes only the stem or explanation in place; replace_text requires question, options, or explanation as field and never reshuffles; move requires exactly one of beforeRef or afterRef. ${workspaceQuizHtmlInstruction}`,
				),
		})
		.describe("Quiz edits."),
]);

export const workspaceLinkItemsInputSchema = z.object({
	items: z
		.array(
			z.object({
				path: z.string().min(1).describe("Absolute path of the workspace item to link from."),
				relations: z
					.array(workspaceRelationInputSchema)
					.min(1)
					.max(20)
					.describe("Relationships from this item to other workspace items, at most 20."),
			}),
		)
		.min(1)
		.max(20)
		.describe(
			"One or more existing items to link from, at most 20. Each can have up to 20 relations.",
		),
});

export const workspaceRenameItemInputSchema = z.object({
	name: z
		.string()
		.trim()
		.min(1)
		.max(WORKSPACE_ITEM_NAME_MAX_LENGTH)
		.describe("New user-visible item name."),
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
			z.discriminatedUnion("type", [
				z.object({
					type: z.literal("folder"),
					path: z.string().min(1).describe("Final absolute path for the folder to create."),
				}),
				z
					.object({
						type: z.literal("document"),
						path: z.string().min(1).describe("Final absolute path for the document to create."),
						initialContent: documentAiHtmlSchema
							.describe(`Optional initial HTML content. ${workspaceDocumentHtmlInstruction}`)
							.optional(),
					})
					.describe("Document to create."),
				z
					.object({
						type: z.literal("flashcard"),
						path: z.string().min(1).describe("Final absolute path for the flashcard set."),
						cards: z
							.array(
								z.object({
									front: entryRichTextHtmlSchema.describe("HTML shown before the card flips."),
									back: entryRichTextHtmlSchema.describe("HTML shown after the card flips."),
								}),
							)
							.min(1)
							.max(100)
							.describe(`Ordered cards. ${workspaceFlashcardHtmlInstruction}`),
					})
					.describe("Flashcard set to create."),
				z
					.object({
						type: z.literal("quiz"),
						path: z.string().min(1).describe("Final absolute path for the quiz."),
						questions: z
							.array(quizQuestionInputSchema)
							.min(1)
							.max(100)
							.describe(`Ordered multiple-choice questions. ${workspaceQuizHtmlInstruction}`),
					})
					.describe("Quiz to create."),
			]),
		)
		.min(1)
		.max(20)
		.describe(
			"One or more workspace items to create in order, at most 20. Parent folders must already exist or be created earlier in the same request.",
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
		requests: [{ mode: "start", path: "/Demo Folder/Demo Flashcards" }],
	},
	{
		requests: [{ mode: "entries", path: "/Demo Folder/Demo Flashcards", range: "1-3" }],
	},
	{
		requests: [{ mode: "start", path: "/Demo Folder/Demo Quiz" }],
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
	{
		requests: [
			{
				ref: "Xk7p2Qa9/b_x7Kp2Qa9x8Lm",
				mode: "ref",
			},
		],
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
		},
		{
			type: "flashcard",
			path: "/Demo Folder/Demo Flashcards",
			cards: [{ front: "<p>What is ATP?</p>", back: "<p>The cell's main energy carrier.</p>" }],
		},
		{
			type: "quiz",
			path: "/Demo Folder/Demo Quiz",
			questions: [
				{
					question: "<p>What does ATP primarily provide to a cell?</p>",
					correctAnswer: "<p>Readily usable chemical energy</p>",
					distractors: [
						"<p>Long-term energy storage</p>",
						"<p>Structural support for the membrane</p>",
						"<p>Genetic information for protein synthesis</p>",
					],
					explanation:
						"<p>ATP transfers readily usable energy; fats store energy long-term, membranes get structure from lipids and proteins, and genetic information lives in DNA.</p>",
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
		type: "document",
		path: "/Demo Folder/Demo Document",
		edits: [
			{
				ref: "b_x7Kp2Qa9x8Lm.r_4f2a1b",
				op: "replace",
				html: "<p>Updated paragraph.</p>",
			},
		],
	},
	{
		type: "document",
		path: "/Demo Folder/Demo Document",
		edits: [
			{
				ref: "b_x7Kp2Qa9x8Lm.r_4f2a1b",
				afterRef: "b_y8Lq3Rb0y9Mn.r_9c3d2e",
				op: "move",
			},
		],
	},
	{
		type: "document",
		path: "/Demo Folder/Demo Document",
		edits: [
			{
				ref: "b_x7Kp2Qa9x8Lm.r_4f2a1b",
				op: "replace_text",
				find: "gravity = 9.8",
				replace: "gravity = 3.7",
			},
		],
	},
	{
		type: "flashcard",
		path: "/Demo Folder/Demo Flashcards",
		edits: [
			{
				op: "update",
				ref: "c_9xKp2Qab.r_4f2a1b",
				back: "<p>The cell's main energy carrier.</p>",
			},
		],
	},
	{
		type: "quiz",
		path: "/Demo Folder/Demo Quiz",
		edits: [
			{
				op: "replace_text",
				ref: "q_8Lq3Rb0y.r_9c3d2e",
				field: "options",
				find: "Long-term energy storage",
				replace: "Long-term energy reserves",
			},
		],
	},
);

export const workspaceLinkItemsInputExamples = createInputExamples<
	z.input<typeof workspaceLinkItemsInputSchema>
>({
	items: [
		{
			path: "/Demo Folder/Demo Flashcards",
			relations: [
				{
					kind: "derived_from",
					path: "/Demo Folder/Demo PDF.pdf",
					note: "Pages 1-3",
				},
			],
		},
		{
			path: "/Demo Folder/Demo Document",
			relations: [
				{
					kind: "derived_from",
					path: "/Demo Folder/Demo PDF.pdf",
				},
			],
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
		ref: z.string().min(1).describe("The item's durable address for citations and reads."),
		type: z.enum(["document", "flashcard", "folder", "quiz"]),
	}),
	failureSchema: createFailureSchema(createWorkspaceItemsFailureCodes).extend({
		detail: z.string().optional().describe("Why this item was refused, when the reason is known."),
	}),
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
	itemType: z.enum(["document", "flashcard", "quiz"]).optional(),
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

export const workspaceLinkItemsOutputSchema = createWorkspaceItemsResultSchema({
	itemSchema: workspacePathItemSchema,
	failureSchema: createFailureSchema(linkWorkspaceItemsFailureCodes),
});

/**
 * Accepts the bare string models send in place of an array, and strips null
 * bytes — a model can emit one as ` `, and Postgres rejects them inside a
 * text parameter, so the query would throw rather than come back empty.
 * Normalizing here rather than in a zod transform because MCP renders these
 * schemas as JSON Schema, which cannot express a transform.
 */
export function normalizeWorkspaceSearchPatterns(patterns: string | string[]) {
	return (Array.isArray(patterns) ? patterns : [patterns]).map((pattern) =>
		pattern.replaceAll("\0", ""),
	);
}

export const workspaceSearchItemsInputSchema = z.object({
	patterns: z
		.union([z.string().min(1), z.array(z.string().min(1)).min(1).max(5)])
		.describe(
			"Words to search for. Give two or three phrasings of one idea in a single call — the everyday wording and the technical term — and they are searched together.",
		),
});

const workspaceSearchHitSchema = z.object({
	ref: z
		.string()
		.min(1)
		.describe("Durable address of this hit, like aB3xK9pQ, or aB3xK9pQ/p12 for a file page."),
	path: workspacePathSchema,
	type: workspaceItemTypeSchema,
	page: z.number().int().positive().optional().describe("Page number, for file hits."),
	match: z
		.enum(["name", "content"])
		.describe("Whether the query matched the item's name or its content."),
	snippet: z.string().optional().describe("The matching text, with matches wrapped in **."),
});

export const workspaceSearchItemsOutputSchema = z.object({
	matches: z
		.number()
		.int()
		.nonnegative()
		.describe(
			"Total content matches. When this exceeds the content hits listed, the query was broad.",
		),
	hits: z
		.array(workspaceSearchHitSchema)
		.describe("Name matches first, then content matches by relevance."),
	unsearchable: z
		.array(
			z.object({
				path: workspacePathSchema,
				reason: z.enum(["extracting", "extraction_failed"]),
			}),
		)
		.optional()
		.describe("Files whose text is not indexed yet, so a miss here is not an absence."),
});

export const workspaceSearchItemsInputExamples = createInputExamples<
	z.input<typeof workspaceSearchItemsInputSchema>
>({ patterns: ["mitosis", "cell division"] }, { patterns: "late work" });
