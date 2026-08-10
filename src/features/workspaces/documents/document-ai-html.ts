import { DOMParser, DOMSerializer, Fragment, type Node as ProseMirrorNode } from "@tiptap/pm/model";
import { parse as parseJavaScript } from "acorn";
import { parseHTML } from "linkedom";
import { nanoid } from "nanoid";

import type { WorkspaceLocation } from "#/features/workspaces/locations/workspace-location";
import {
	coerceTiptapDocumentJson,
	type TiptapDocumentJson,
} from "#/features/workspaces/documents/tiptap-document";
import {
	getTiptapDocumentSchema,
	tiptapDocumentAiRefAttribute,
} from "#/features/workspaces/documents/tiptap-schema";
import { sha256Base64UrlText } from "#/lib/binary";

const TEXT_NODE = 3;
const documentBlockIdPattern = /^b_[A-Za-z0-9_-]{12}$/;
const documentAiEditRefPattern = /^(b_[A-Za-z0-9_-]{12})\.r_[A-Za-z0-9_-]{10}$/;
export class DocumentAiHtmlError extends Error {}
export class WidgetScriptSyntaxError extends DocumentAiHtmlError {}

export interface DocumentAiBlockSnapshot {
	content: string;
	editRef: string;
}

export function parseDocumentAiHtml(html: string): TiptapDocumentJson {
	const htmlDocument = createHtmlDocument();
	htmlDocument.body.innerHTML = html;

	// A citation the operation could not resolve to a real item cannot navigate
	// anywhere, so it becomes its own label rather than failing the write.
	for (const element of htmlDocument.body.querySelectorAll("citation:not([data-item-id])")) {
		element.replaceWith(htmlDocument.createTextNode(element.textContent ?? ""));
	}

	rewriteLossyElements(htmlDocument);

	validateWidgetScriptSyntax(htmlDocument.body);
	validateDocumentAiHtml(htmlDocument.body);

	for (const element of htmlDocument.body.querySelectorAll("[data-edit-ref]")) {
		element.removeAttribute("data-edit-ref");
	}

	try {
		const document = DOMParser.fromSchema(getTiptapDocumentSchema()).parse(
			htmlDocument.body as unknown as HTMLElement,
		);
		document.check();
		return coerceTiptapDocumentJson(document.toJSON());
	} catch (error) {
		throw new DocumentAiHtmlError("Document HTML does not match the supported schema.", {
			cause: error,
		});
	}
}

export async function serializeTiptapDocumentToAiHtml(document: TiptapDocumentJson) {
	const node = getTiptapDocumentSchema().nodeFromJSON(document);
	return (
		await Promise.all(
			Array.from({ length: node.childCount }, (_, index) =>
				serializeTiptapNodeToAiHtml(node.child(index)),
			),
		)
	).join("");
}

export async function serializeTiptapNodeToAiHtml(node: ProseMirrorNode) {
	// The editRef is hashed from the full node, so a widget source change still
	// invalidates it. Only the serialized source is elided.
	const withEditRef = withTiptapNodeAiRef(node, await createDocumentAiEditRef(node));
	return serializeTiptapFragmentToAiHtml(Fragment.from(elideWidgetSource(withEditRef)));
}

/**
 * Replaces a widget's source with nothing for the model's benefit.
 *
 * A widget runs to kilobytes of markup and script. Inlining that in every read
 * would crowd out the prose the model actually needs — a handful of widgets
 * would fill a whole chunk. The placeholder keeps the editRef and title, which
 * is enough to decide whether to read it in full.
 */
function elideWidgetSource(node: ProseMirrorNode): ProseMirrorNode {
	if (node.type.name !== "widget") {
		return node;
	}
	return node.type.create(node.attrs, undefined, node.marks);
}

export async function createDocumentAiEditRef(node: ProseMirrorNode) {
	const blockId = readTiptapNodeBlockId(node);
	if (!blockId) {
		throw new Error(`Top-level document node ${node.type.name} is missing a block ID.`);
	}

	// Fingerprint the block's JSON rather than its HTML: rendering costs a whole
	// second DOM pass per block per read, and the editRef only has to change when
	// the block's content does.
	const content = JSON.stringify(withTiptapNodeAiRef(node, null).toJSON());
	const revision = (await sha256Base64UrlText(content)).slice(0, 10);
	return `${blockId}.r_${revision}`;
}

export function parseDocumentAiEditRef(editRef: string) {
	return documentAiEditRefPattern.exec(editRef)?.[1] ?? null;
}

export function ensureTiptapDocumentBlockIds(document: TiptapDocumentJson): {
	changed: boolean;
	document: TiptapDocumentJson;
} {
	const result = ensureProseMirrorDocumentBlockIds(
		getTiptapDocumentSchema().nodeFromJSON(document),
	);
	return result.changed
		? { changed: true, document: coerceTiptapDocumentJson(result.document.toJSON()) }
		: { changed: false, document };
}

export function ensureProseMirrorDocumentBlockIds(document: ProseMirrorNode): {
	changed: boolean;
	document: ProseMirrorNode;
} {
	const usedBlockIds = new Set<string>();
	let changed = false;
	const children: ProseMirrorNode[] = [];

	document.forEach((node) => {
		const currentBlockId = readTiptapNodeBlockId(node);
		const blockId =
			currentBlockId && !usedBlockIds.has(currentBlockId)
				? currentBlockId
				: createDocumentBlockId();
		usedBlockIds.add(blockId);
		changed ||= blockId !== currentBlockId;
		children.push(withTiptapNodeAiRef(node, blockId));
	});

	if (!changed) {
		return { changed: false, document };
	}

	return {
		changed: true,
		document: document.type.create(document.attrs, Fragment.fromArray(children)),
	};
}

function createDocumentBlockId() {
	return `b_${nanoid(12)}`;
}

export function readTiptapNodeBlockId(node: ProseMirrorNode) {
	const blockId = node.attrs[tiptapDocumentAiRefAttribute];
	return typeof blockId === "string" && documentBlockIdPattern.test(blockId) ? blockId : null;
}

export function withTiptapNodeAiRef(node: ProseMirrorNode, ref: string | null) {
	const attributes = node.type.spec.attrs;
	if (!attributes || !(tiptapDocumentAiRefAttribute in attributes)) {
		throw new Error(`Top-level document node ${node.type.name} cannot carry a block ID.`);
	}

	return node.type.create(
		{ ...node.attrs, [tiptapDocumentAiRefAttribute]: ref },
		node.content,
		node.marks,
	);
}

/**
 * The exact block HTML returned by a block read and matched by `replace_text`.
 * Its editRef travels beside it, never inside it, so there is only one target
 * value for the model to copy.
 */
export function serializeTiptapNodeToEditableAiHtml(node: ProseMirrorNode) {
	return serializeTiptapFragmentToAiHtml(Fragment.from(withTiptapNodeAiRef(node, null)));
}

/** Content and edit target minted together from one live block. */
export async function createDocumentAiBlockSnapshot(
	node: ProseMirrorNode,
): Promise<DocumentAiBlockSnapshot> {
	return {
		content: serializeTiptapNodeToEditableAiHtml(node),
		editRef: await createDocumentAiEditRef(node),
	};
}

function serializeTiptapFragmentToAiHtml(fragment: Fragment) {
	const htmlDocument = createHtmlDocument();
	const container = htmlDocument.createElement("div");
	const serialized = DOMSerializer.fromSchema(getTiptapDocumentSchema()).serializeFragment(
		fragment,
		{ document: htmlDocument as unknown as Document },
	);
	container.appendChild(serialized as unknown as globalThis.Node);
	return container.innerHTML;
}

/**
 * Rescues the two tags ProseMirror parses lossily.
 *
 * Everything else outside the schema is already handled by the parser: unknown
 * wrappers are skipped with their children kept, and `<script>`/`<style>` text
 * never reaches the document. These two lose meaning instead:
 *  - `<h5>`/`<h6>` fall all the way to a paragraph, so the heading disappears;
 *    the schema stops at 4, so 4 is where they belong.
 *  - `<sub>`/`<sup>` flatten to bare text (`CH<sub>4</sub>` becomes `CH4`), so
 *    they become inline math instead. `{}_{4}` is the KaTeX form for a
 *    subscript with no base, which is what the tag means on its own.
 *
 * Models write both by habit — evals showed `CH<sub>4</sub>` surviving an
 * explicit instruction not to use it.
 */
function rewriteLossyElements(htmlDocument: Document) {
	for (const element of htmlDocument.body.querySelectorAll("h5, h6")) {
		const heading = htmlDocument.createElement("h4");
		for (const child of Array.from(element.childNodes)) {
			heading.appendChild(child);
		}
		element.replaceWith(heading);
	}

	for (const element of htmlDocument.body.querySelectorAll("sub, sup")) {
		const latex = element.textContent?.trim();
		if (!latex) {
			element.remove();
			continue;
		}

		const math = htmlDocument.createElement("span");
		math.setAttribute("data-type", "inline-math");
		math.setAttribute(
			"data-latex",
			`{}${element.tagName.toLowerCase() === "sub" ? "_" : "^"}{${latex}}`,
		);
		element.replaceWith(math);
	}
}

function validateDocumentAiHtml(root: HTMLElement) {
	// Text sitting at the top level means this is not HTML at all — Markdown,
	// most often, which a model reaches for by habit. ProseMirror would take it
	// without complaint and flatten the whole thing into one paragraph of
	// literal source, so refuse it while the edit can still be reported failed.
	for (const node of root.childNodes) {
		if (node.nodeType === TEXT_NODE && node.textContent?.trim()) {
			throw new DocumentAiHtmlError(
				"Document content must be HTML elements. Plain text and Markdown are not accepted.",
			);
		}
	}
}

/**
 * Parse executable inline scripts exactly where model-authored widgets enter
 * the document. This runs before create/edit persistence, so a syntax error is
 * returned to the model by the same tool call instead of becoming a broken
 * iframe in the browser.
 *
 * Widget source is HTML-escaped text in the outer document. Parse that text as
 * its own fragment first, matching the document the sandbox will construct.
 * Non-JavaScript data blocks and external scripts are not executed inline and
 * therefore have no inline JavaScript syntax to validate.
 */
function validateWidgetScriptSyntax(root: HTMLElement) {
	const widgets = Array.from(root.querySelectorAll('div[data-type="widget"]'));

	for (const [widgetIndex, widget] of widgets.entries()) {
		const widgetDocument = createHtmlDocument();
		widgetDocument.body.innerHTML = widget.textContent ?? "";
		const scripts = Array.from(widgetDocument.body.querySelectorAll("script"));

		for (const [scriptIndex, script] of scripts.entries()) {
			if (script.hasAttribute("src")) {
				continue;
			}

			const sourceType = getWidgetScriptSourceType(script.getAttribute("type"));
			if (!sourceType) {
				continue;
			}

			try {
				parseJavaScript(script.textContent ?? "", {
					ecmaVersion: "latest",
					sourceType,
				});
			} catch (error) {
				const message = error instanceof Error ? error.message : "Invalid JavaScript syntax";
				throw new WidgetScriptSyntaxError(
					`Widget ${widgetIndex + 1} script ${scriptIndex + 1} has invalid JavaScript: ${message}`,
					{ cause: error },
				);
			}
		}
	}
}

function getWidgetScriptSourceType(typeAttribute: string | null): "module" | "script" | null {
	const type = (typeAttribute ?? "").split(";", 1)[0]?.trim().toLowerCase();
	if (!type) {
		return "script";
	}
	if (type === "module") {
		return "module";
	}
	return /^(?:text|application)\/(?:x-)?(?:java|ecma)script$/.test(type) ? "script" : null;
}

/** Short refs the assistant cited, for the caller to resolve to locations. */
export function readDocumentCitationRefs(html: string) {
	const htmlDocument = createHtmlDocument();
	htmlDocument.body.innerHTML = html;

	return [
		...new Set(
			[...htmlDocument.body.querySelectorAll("citation[ref]")].flatMap(
				(element) => element.getAttribute("ref") ?? [],
			),
		),
	];
}

/**
 * Rewrite cited refs to the locations they stand for. A ref belongs to one chat
 * turn; the location outlives it, so that is what the document keeps.
 */
export function applyDocumentCitationLocations(
	html: string,
	locationsByRef: Map<string, WorkspaceLocation>,
) {
	const htmlDocument = createHtmlDocument();
	htmlDocument.body.innerHTML = html;

	for (const element of htmlDocument.body.querySelectorAll("citation[ref]")) {
		const location = locationsByRef.get(element.getAttribute("ref") ?? "");
		element.removeAttribute("ref");

		if (!location) {
			continue;
		}
		element.setAttribute("data-item-id", location.itemId);
		if (location.kind === "pdf-page") {
			element.setAttribute("data-page", String(location.pageNumber));
		}
	}

	return htmlDocument.body.innerHTML;
}

function createHtmlDocument() {
	return parseHTML("<!doctype html><html><body></body></html>").document;
}
