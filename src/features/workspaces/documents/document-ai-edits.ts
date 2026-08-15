import { Fragment, type Node as ProseMirrorNode } from "@tiptap/pm/model";
import { z } from "zod";

import { replaceUniqueText } from "#/features/workspaces/content/replace-unique-text";
import {
	createDocumentAiRef,
	DocumentAiHtmlError,
	ensureProseMirrorDocumentBlockIds,
	parseDocumentAiHtml,
	parseDocumentAiRef,
	serializeTiptapNodeToEditableAiHtml,
	readTiptapNodeBlockId,
	withTiptapNodeAiRef,
	WidgetScriptSyntaxError,
} from "#/features/workspaces/documents/document-ai-html";
import type { DocumentEditLineChanges } from "#/features/workspaces/documents/document-edit-receipt";
import {
	coerceTiptapDocumentJson,
	type TiptapDocumentJson,
} from "#/features/workspaces/documents/tiptap-document";
import { getTiptapDocumentSchema } from "#/features/workspaces/documents/tiptap-schema";
import { workspaceUnitRefInputSchema } from "#/features/workspaces/locations/workspace-location";

const documentRefSchema = workspaceUnitRefInputSchema.describe(
	"Exact ref from a recent document or block read.",
);
export const documentAiHtmlSchema = z
	.string()
	.max(512_000)
	.describe("Schema-constrained HTML fragment. Model-supplied data-ref attributes are ignored.");
const documentAiEditTextSchema = z.string().max(512_000);

export const documentAiEditSchema = z.union([
	z.strictObject({
		ref: documentRefSchema,
		html: documentAiHtmlSchema,
		op: z.enum(["insert_after", "insert_before", "replace", "update"]),
	}),
	z.strictObject({
		ref: documentRefSchema,
		op: z.literal("delete"),
	}),
	z.strictObject({
		ref: documentRefSchema,
		find: documentAiEditTextSchema
			.min(1)
			.describe(
				"Exact text to replace inside the target block, copied from a read. It must appear exactly once in that block; if it matches more than once the edit fails instead of replacing every occurrence.",
			),
		op: z.literal("replace_text"),
		replace: documentAiEditTextSchema.describe(
			"Replacement text. May be empty to delete the matched text.",
		),
	}),
	z
		.strictObject({
			ref: documentRefSchema,
			beforeRef: documentRefSchema.optional(),
			afterRef: documentRefSchema.optional(),
			op: z.literal("move"),
		})
		.refine((edit) => Boolean(edit.beforeRef) !== Boolean(edit.afterRef), {
			message: "Provide exactly one of beforeRef or afterRef.",
		}),
]);

export const documentAiEditFailureCodes = [
	"edit_not_found",
	// Deliberately a failure rather than a silent replace-all: a model retargeting
	// one of three identical buttons would otherwise change all three, unnoticed.
	"edit_not_unique",
	"invalid_html",
	"widget_script_syntax_error",
	"no_change",
	"ref_not_found",
	"ref_stale",
] as const;

export type DocumentAiEdit = z.infer<typeof documentAiEditSchema>;
export type DocumentAiEditFailureCode = (typeof documentAiEditFailureCodes)[number];
export type DocumentAiEditResultStatus = "applied" | "failed" | "partial" | "rejected";

export interface DocumentAiEditResult {
	applied: number;
	document: TiptapDocumentJson;
	failed: number;
	/** `detail` explains a rejection in the model's own terms, so a retry can fix
	 * the markup instead of repeating it. */
	failures: { code: DocumentAiEditFailureCode; detail?: string; index: number }[];
	status: Exclude<DocumentAiEditResultStatus, "rejected">;
}

export async function applyDocumentAiEdits(
	document: TiptapDocumentJson,
	edits: DocumentAiEdit[],
): Promise<DocumentAiEditResult> {
	let current = getTiptapDocumentSchema().nodeFromJSON(document);
	// Validate every targeted edit against the document as it existed when this
	// tool call began. That lets one ordered batch reuse a ref while still
	// rejecting it in a later call after a human or agent changed the block.
	const requestedBlockIds = new Set(
		edits.flatMap(getDocumentAiRefs).flatMap((ref) => {
			const blockId = parseDocumentAiRef(ref);
			return blockId ? [blockId] : [];
		}),
	);
	const requestedTargets: Array<readonly [string, ProseMirrorNode]> = [];
	current.forEach((node) => {
		const blockId = readTiptapNodeBlockId(node);
		if (blockId && requestedBlockIds.has(blockId)) {
			requestedTargets.push([blockId, node]);
		}
	});
	const refByBlockId = new Map(
		await Promise.all(
			requestedTargets.map(
				async ([blockId, node]) => [blockId, await createDocumentAiRef(node)] as const,
			),
		),
	);
	const failures: DocumentAiEditResult["failures"] = [];
	let applied = 0;

	for (const [index, edit] of edits.entries()) {
		const blockIds: string[] = [];
		let invalidRefCode: "ref_not_found" | "ref_stale" | undefined;
		for (const ref of getDocumentAiRefs(edit)) {
			const blockId = parseDocumentAiRef(ref);
			if (!blockId || !refByBlockId.has(blockId)) {
				invalidRefCode = "ref_not_found";
				break;
			}
			if (refByBlockId.get(blockId) !== ref) {
				invalidRefCode = "ref_stale";
				break;
			}
			blockIds.push(blockId);
		}
		if (invalidRefCode) {
			failures.push({ code: invalidRefCode, index });
			continue;
		}

		const result = applyDocumentAiEdit(current, edit, blockIds);
		if (result.status === "failed") {
			failures.push({
				code: result.code,
				...(result.detail ? { detail: result.detail } : {}),
				index,
			});
			continue;
		}

		current = result.document;
		applied++;
	}

	return {
		applied,
		document: coerceTiptapDocumentJson(current.toJSON()),
		failed: failures.length,
		failures,
		status: applied === 0 ? "failed" : failures.length > 0 ? "partial" : "applied",
	};
}

/**
 * Count the lines an AI edit added and removed. Lines are compared as a bag of
 * contents rather than by position, so moving a paragraph counts as nothing
 * while rewriting one counts as a line out and a line in.
 */
export function summarizeDocumentAiLineChanges(
	before: TiptapDocumentJson,
	after: TiptapDocumentJson,
): DocumentEditLineChanges {
	const beforeLines = countDocumentLines(before);
	const afterLines = countDocumentLines(after);
	let added = 0;
	let removed = 0;

	for (const [line, count] of afterLines) {
		added += Math.max(0, count - (beforeLines.get(line) ?? 0));
	}

	for (const [line, count] of beforeLines) {
		removed += Math.max(0, count - (afterLines.get(line) ?? 0));
	}

	return { added, removed };
}

function countDocumentLines(document: TiptapDocumentJson) {
	const counts = new Map<string, number>();
	const countLine = (line: string) => counts.set(line, (counts.get(line) ?? 0) + 1);

	getTiptapDocumentSchema()
		.nodeFromJSON(document)
		.descendants((node) => {
			if (node.isTextblock) {
				const text = node.textContent.trim();
				if (text) {
					countLine(`${node.type.name}:${text}`);
				}
				return false;
			}
			// A rule or a formula holds no text but still occupies a line.
			if (node.isAtom) {
				countLine(JSON.stringify(node.toJSON()));
				return false;
			}

			return true;
		});

	return counts;
}

function applyDocumentAiEdit(
	document: ProseMirrorNode,
	edit: DocumentAiEdit,
	blockIds: string[],
):
	| { code: DocumentAiEditFailureCode; detail?: string; status: "failed" }
	| { document: ProseMirrorNode; status: "applied" } {
	const [blockId, destinationBlockId] = blockIds;
	if (!blockId) throw new Error("Document edits require a validated block id.");
	const targetIndex = findTargetIndex(document, blockId);
	if (targetIndex === -1) {
		return { code: "ref_not_found", status: "failed" };
	}

	const children = getDocumentChildren(document);
	if (edit.op === "delete") {
		children.splice(targetIndex, 1);
	} else if (edit.op === "move") {
		if (!destinationBlockId || destinationBlockId === blockId) {
			return { code: "no_change", status: "failed" };
		}
		const [target] = children.splice(targetIndex, 1);
		const destinationIndex = children.findIndex(
			(node) => readTiptapNodeBlockId(node) === destinationBlockId,
		);
		if (!target || destinationIndex === -1) {
			return { code: "ref_not_found", status: "failed" };
		}
		children.splice(edit.beforeRef ? destinationIndex : destinationIndex + 1, 0, target);
	} else {
		let operation: "insert_after" | "insert_before" | "replace" | "update";
		let html: string;
		if (edit.op === "replace_text") {
			const replaced = replaceUniqueText(
				serializeTiptapNodeToEditableAiHtml(document.child(targetIndex)),
				edit.find,
				edit.replace,
			);
			if (!replaced.ok) {
				return { code: replaced.code, detail: replaced.detail, status: "failed" };
			}
			operation = "replace";
			html = replaced.text;
		} else {
			operation = edit.op;
			html = edit.html;
		}

		const parsed = parseEditHtml(html);
		if ("code" in parsed) {
			return { code: parsed.code, detail: parsed.detail, status: "failed" };
		}
		if (operation === "update" && parsed.children.length !== 1) {
			return {
				code: "invalid_html",
				detail: "update requires exactly one top-level block.",
				status: "failed",
			};
		}
		const targetBlockId = readTiptapNodeBlockId(document.child(targetIndex));
		const firstNode = parsed.children[0];
		// A replacement inherits the block ID of the block it stands in for, so a
		// model holding its ref can keep editing it.
		const inserted =
			(operation === "replace" || operation === "update") && targetBlockId && firstNode
				? [withTiptapNodeAiRef(firstNode, targetBlockId), ...parsed.children.slice(1)]
				: parsed.children;

		switch (operation) {
			case "insert_after":
				children.splice(targetIndex + 1, 0, ...inserted);
				break;
			case "insert_before":
				children.splice(targetIndex, 0, ...inserted);
				break;
			case "replace":
			case "update":
				children.splice(targetIndex, 1, ...inserted);
				break;
		}
	}

	const next = createDocument(children);
	return documentsHaveSameVisibleContent(document, next)
		? { code: "no_change", status: "failed" }
		: { document: next, status: "applied" };
}

function parseEditHtml(
	html: string,
):
	| { children: ProseMirrorNode[] }
	| { code: "invalid_html" | "widget_script_syntax_error"; detail: string } {
	try {
		return {
			children: getDocumentChildren(
				getTiptapDocumentSchema().nodeFromJSON(parseDocumentAiHtml(html)),
			),
		};
	} catch (error) {
		if (error instanceof DocumentAiHtmlError) {
			return {
				code:
					error instanceof WidgetScriptSyntaxError ? "widget_script_syntax_error" : "invalid_html",
				detail: error.message,
			};
		}
		throw error;
	}
}

function createDocument(children: ProseMirrorNode[]) {
	const schema = getTiptapDocumentSchema();
	const editorChildren = children.length > 0 ? [...children] : [schema.nodes.paragraph.create()];

	// StarterKit keeps a paragraph after a final non-paragraph block so users can
	// place the cursor after lists, tables, and other atom-like content. Apply the
	// same invariant before persisting an AI edit so opening the editor is not
	// misclassified as a later human change.
	if (editorChildren.at(-1)?.type !== schema.nodes.paragraph) {
		editorChildren.push(schema.nodes.paragraph.create());
	}

	const document = ensureProseMirrorDocumentBlockIds(
		schema.topNodeType.create(null, Fragment.fromArray(editorChildren)),
	).document;
	document.check();
	return document;
}

function documentsHaveSameVisibleContent(left: ProseMirrorNode, right: ProseMirrorNode) {
	return withoutTopLevelAiRefs(left).eq(withoutTopLevelAiRefs(right));
}

function withoutTopLevelAiRefs(document: ProseMirrorNode) {
	return document.type.create(
		document.attrs,
		Fragment.fromArray(
			getDocumentChildren(document).map((node) => withTiptapNodeAiRef(node, null)),
		),
	);
}

function findTargetIndex(document: ProseMirrorNode, blockId: string) {
	for (let index = 0; index < document.childCount; index++) {
		if (readTiptapNodeBlockId(document.child(index)) === blockId) {
			return index;
		}
	}
	return -1;
}

function getDocumentChildren(document: ProseMirrorNode) {
	return Array.from({ length: document.childCount }, (_, index) => document.child(index));
}

function getDocumentAiRefs(edit: DocumentAiEdit) {
	if (edit.op !== "move") return [edit.ref];
	const destinationRef = edit.beforeRef ?? edit.afterRef;
	return destinationRef ? [edit.ref, destinationRef] : [edit.ref];
}
