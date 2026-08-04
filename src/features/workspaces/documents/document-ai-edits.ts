import { Fragment, type Node as ProseMirrorNode } from "@tiptap/pm/model";
import { z } from "zod";

import {
	createDocumentAiEditRef,
	DocumentAiHtmlError,
	ensureProseMirrorDocumentBlockIds,
	parseDocumentAiHtml,
	parseDocumentAiEditRef,
	serializeTiptapNodeToEditableAiHtml,
	readTiptapNodeBlockId,
	withTiptapNodeAiRef,
} from "#/features/workspaces/documents/document-ai-html";
import type { DocumentEditLineChanges } from "#/features/workspaces/documents/document-edit-receipt";
import {
	coerceTiptapDocumentJson,
	type TiptapDocumentJson,
} from "#/features/workspaces/documents/tiptap-document";
import { getTiptapDocumentSchema } from "#/features/workspaces/documents/tiptap-schema";

const documentEditRefSchema = z
	.string()
	.trim()
	.min(1)
	.max(64)
	.describe("Exact editRef from a recent document or block read.");
export const documentAiHtmlSchema = z
	.string()
	.max(512_000)
	.describe(
		"Schema-constrained HTML fragment. Model-supplied data-edit-ref attributes are ignored.",
	);
const documentAiEditTextSchema = z.string().max(512_000);

export const documentAiEditSchema = z.union([
	z.strictObject({
		editRef: documentEditRefSchema,
		html: documentAiHtmlSchema,
		op: z.enum(["insert_after", "insert_before", "replace"]),
	}),
	z.strictObject({
		editRef: documentEditRefSchema,
		op: z.literal("delete"),
	}),
	z.strictObject({
		html: documentAiHtmlSchema,
		op: z.literal("overwrite"),
	}),
	z.strictObject({
		editRef: documentEditRefSchema,
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
]);

export const documentAiEditFailureCodes = [
	"edit_not_found",
	// Deliberately a failure rather than a silent replace-all: a model retargeting
	// one of three identical buttons would otherwise change all three, unnoticed.
	"edit_not_unique",
	"invalid_html",
	"no_change",
	"edit_ref_not_found",
	"edit_ref_stale",
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
	// tool call began. That lets one ordered batch reuse an editRef while still
	// rejecting it in a later call after a human or agent changed the block.
	const requestedBlockIds = new Set(
		edits.flatMap((edit) => {
			if (edit.op === "overwrite") {
				return [];
			}
			const blockId = parseDocumentAiEditRef(edit.editRef);
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
	const editRefByBlockId = new Map(
		await Promise.all(
			requestedTargets.map(
				async ([blockId, node]) => [blockId, await createDocumentAiEditRef(node)] as const,
			),
		),
	);
	const failures: DocumentAiEditResult["failures"] = [];
	let applied = 0;

	for (const [index, edit] of edits.entries()) {
		let blockId: string | undefined;
		if (edit.op !== "overwrite") {
			const parsedBlockId = parseDocumentAiEditRef(edit.editRef);
			if (!parsedBlockId || !editRefByBlockId.has(parsedBlockId)) {
				failures.push({ code: "edit_ref_not_found", index });
				continue;
			}
			if (editRefByBlockId.get(parsedBlockId) !== edit.editRef) {
				failures.push({ code: "edit_ref_stale", index });
				continue;
			}
			blockId = parsedBlockId;
		}

		const result = applyDocumentAiEdit(current, edit, blockId);
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
	blockId?: string,
):
	| { code: DocumentAiEditFailureCode; detail?: string; status: "failed" }
	| { document: ProseMirrorNode; status: "applied" } {
	if (edit.op === "overwrite") {
		const parsed = parseEditHtml(edit.html);
		if (!parsed.children) {
			return { code: "invalid_html", detail: parsed.detail, status: "failed" };
		}

		const next = createDocument(parsed.children);
		return documentsHaveSameVisibleContent(document, next)
			? { code: "no_change", status: "failed" }
			: { document: next, status: "applied" };
	}

	if (!blockId) {
		throw new Error("Targeted document edits require a validated block id.");
	}
	const targetIndex = findTargetIndex(document, blockId);
	if (targetIndex === -1) {
		return { code: "edit_ref_not_found", status: "failed" };
	}

	const children = getDocumentChildren(document);
	if (edit.op === "delete") {
		children.splice(targetIndex, 1);
	} else if (edit.op === "replace_text") {
		const target = document.child(targetIndex);
		const replaced = replaceUniqueText(
			serializeTiptapNodeToEditableAiHtml(target),
			edit.find,
			edit.replace,
		);
		if (!replaced.ok) {
			return { code: replaced.code, detail: replaced.detail, status: "failed" };
		}

		const parsed = parseEditHtml(replaced.text);
		if (!parsed.children) {
			return { code: "invalid_html", detail: parsed.detail, status: "failed" };
		}
		const targetBlockId = readTiptapNodeBlockId(target);
		const firstNode = parsed.children[0];
		children.splice(
			targetIndex,
			1,
			...(targetBlockId && firstNode
				? [withTiptapNodeAiRef(firstNode, targetBlockId), ...parsed.children.slice(1)]
				: parsed.children),
		);
	} else {
		const parsed = parseEditHtml(edit.html);
		if (!parsed.children) {
			return { code: "invalid_html", detail: parsed.detail, status: "failed" };
		}
		const targetBlockId = readTiptapNodeBlockId(document.child(targetIndex));
		const firstNode = parsed.children[0];
		// A replacement inherits the block ID of the block it stands in for, so a
		// model holding its editRef can keep editing it.
		const inserted =
			edit.op === "replace" && targetBlockId && firstNode
				? [withTiptapNodeAiRef(firstNode, targetBlockId), ...parsed.children.slice(1)]
				: parsed.children;

		switch (edit.op) {
			case "insert_after":
				children.splice(targetIndex + 1, 0, ...inserted);
				break;
			case "insert_before":
				children.splice(targetIndex, 0, ...inserted);
				break;
			case "replace":
				children.splice(targetIndex, 1, ...inserted);
				break;
		}
	}

	const next = createDocument(children);
	return documentsHaveSameVisibleContent(document, next)
		? { code: "no_change", status: "failed" }
		: { document: next, status: "applied" };
}

const DATA_EDIT_REF_ATTRIBUTE = /\s+data-edit-ref="[^"]*"/g;

/**
 * Replaces a single unique occurrence, or explains why it could not.
 *
 * Line endings are normalised first: a model reproducing text with different
 * newlines otherwise gets an unexplained miss. A non-unique match fails with its
 * count so the next attempt can add surrounding context instead of guessing.
 */
function replaceUniqueText(
	source: string,
	find: string,
	replace: string,
):
	| { ok: true; text: string }
	| { ok: false; code: "edit_not_found" | "edit_not_unique"; detail: string } {
	const haystack = source.replaceAll("\r\n", "\n").replace(DATA_EDIT_REF_ATTRIBUTE, "");
	const needle = find.replaceAll("\r\n", "\n").replace(DATA_EDIT_REF_ATTRIBUTE, "");
	const matches = haystack.split(needle).length - 1;

	if (matches === 0) {
		return { ok: false, code: "edit_not_found", detail: `No match for: ${needle.slice(0, 80)}` };
	}
	if (matches > 1) {
		return {
			ok: false,
			code: "edit_not_unique",
			detail: `Found ${matches} matches; include more surrounding text so it matches once.`,
		};
	}

	return { ok: true, text: haystack.replace(needle, replace) };
}

function parseEditHtml(html: string) {
	try {
		return {
			children: getDocumentChildren(
				getTiptapDocumentSchema().nodeFromJSON(parseDocumentAiHtml(html)),
			),
		};
	} catch (error) {
		if (error instanceof DocumentAiHtmlError) {
			return { detail: error.message };
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
